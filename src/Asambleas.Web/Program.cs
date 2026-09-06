using Asambleas.Application;
using Asambleas.Application.Abstractions;
using Asambleas.Infrastructure;
using Asambleas.Infrastructure.Identity;
using Asambleas.Infrastructure.Persistence;
using Asambleas.Infrastructure.Seed;
using Asambleas.Web.Hubs;
using Asambleas.Web.Middleware;
using Asambleas.Web.Realtime;
using Asambleas.Web.Security;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using OpenTelemetry.Resources;
using OpenTelemetry.Trace;
using Serilog;
using Serilog.Events;
using System.Threading.RateLimiting;

Log.Logger = new LoggerConfiguration()
    .MinimumLevel.Information()
    .MinimumLevel.Override("Microsoft.AspNetCore", LogEventLevel.Warning)
    .Enrich.FromLogContext()
    .Enrich.WithEnvironmentName()
    .WriteTo.Console()
    .CreateLogger();

try
{
    var builder = WebApplication.CreateBuilder(args);

    builder.Host.UseSerilog();

    builder.Services.AddAsambleasApplication();
    builder.Services.AddAsambleasInfrastructure(builder.Configuration);

    builder.Services.AddScoped<IUserClaimsPrincipalFactory<ApplicationUser>, AsambleasUserClaimsPrincipalFactory>();
    builder.Services.AddScoped<IAssemblyRealtimePublisher, SignalRAssemblyRealtimePublisher>();

    builder.Services
        .AddAuthentication(IdentityConstants.ApplicationScheme)
        .AddIdentityCookies();

    var allowInsecureCookies = builder.Environment.IsDevelopment()
        || string.Equals(builder.Environment.EnvironmentName, "Testing", StringComparison.OrdinalIgnoreCase)
        || builder.Configuration.GetValue("ASAMBLEAS_ALLOW_INSECURE_LOGIN", false);

    // SameAsRequest keeps Secure cookies on HTTPS and still works on the HTTP :8092 IP pilot.
    var cookieSecure = allowInsecureCookies
        ? CookieSecurePolicy.SameAsRequest
        : CookieSecurePolicy.Always;

    builder.Services.ConfigureApplicationCookie(options =>
    {
        options.Cookie.Name = "asambleas.auth";
        options.Cookie.HttpOnly = true;
        options.Cookie.SameSite = SameSiteMode.Lax;
        options.Cookie.SecurePolicy = cookieSecure;
        options.SlidingExpiration = true;
        options.ExpireTimeSpan = TimeSpan.FromHours(8);
        options.Events.OnRedirectToLogin = context =>
        {
            if (context.Request.Path.StartsWithSegments("/api")
                || context.Request.Path.StartsWithSegments("/hubs"))
            {
                context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                return Task.CompletedTask;
            }

            context.Response.Redirect("/");
            return Task.CompletedTask;
        };
        options.Events.OnRedirectToAccessDenied = async context =>
        {
            if (context.Request.Path.StartsWithSegments("/api")
                || context.Request.Path.StartsWithSegments("/hubs"))
            {
                context.Response.StatusCode = StatusCodes.Status403Forbidden;
                context.Response.ContentType = "application/problem+json";
                await context.Response.WriteAsJsonAsync(new Microsoft.AspNetCore.Mvc.ProblemDetails
                {
                    Status = StatusCodes.Status403Forbidden,
                    Title = "Sin permiso",
                    Detail =
                        "No tienes permiso para realizar esta acción. "
                        + "Para crear un PH necesitas el permiso «Administrar PH» "
                        + "(rol Administrador PH o Presidente de asamblea)."
                });
                return;
            }

            context.Response.Redirect("/");
        };
    });

    builder.Services.AddAntiforgery(options =>
    {
        options.HeaderName = "RequestVerificationToken";
        options.Cookie.Name = "asambleas.af";
        options.Cookie.HttpOnly = true;
        options.Cookie.SecurePolicy = cookieSecure;
        options.Cookie.SameSite = SameSiteMode.Lax;
    });

    builder.Services.AddRateLimiter(options =>
    {
        options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
        var permitLimit = builder.Environment.IsDevelopment() ? 200 : 10;
        options.AddPolicy("auth-login", httpContext =>
            RateLimitPartition.GetFixedWindowLimiter(
                partitionKey: httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                factory: _ => new FixedWindowRateLimiterOptions
                {
                    PermitLimit = permitLimit,
                    Window = TimeSpan.FromMinutes(1),
                    QueueLimit = 0
                }));
    });

    builder.Services.AddAsambleasPermissionPolicies();
    builder.Services.AddControllers(options =>
    {
        options.Filters.Add<CookieAntiforgeryFilter>();
    });

    builder.Services.AddSignalR();

    var connectionString = builder.Configuration.GetConnectionString("DefaultConnection") ?? string.Empty;

    var healthChecks = builder.Services.AddHealthChecks();
    if (!string.IsNullOrWhiteSpace(connectionString))
    {
        healthChecks.AddNpgSql(
            connectionString,
            name: "postgres",
            tags: ["ready"]);
    }

    builder.Services.AddOpenTelemetry()
        .ConfigureResource(resource => resource.AddService("Asambleas.Web"))
        .WithTracing(tracing => tracing
            .AddAspNetCoreInstrumentation(options =>
            {
                options.EnrichWithHttpRequest = (activity, request) =>
                {
                    var path = request.Path.Value ?? string.Empty;
                    if (path.StartsWith("/ingresar/", StringComparison.OrdinalIgnoreCase)
                        || path.StartsWith("/go/reset-password/", StringComparison.OrdinalIgnoreCase))
                    {
                        var redacted = RedactSensitivePath(path);
                        activity.DisplayName = $"{request.Method} {redacted}";
                        activity.SetTag("url.path", redacted);
                        activity.SetTag("http.route", path.StartsWith("/ingresar/", StringComparison.OrdinalIgnoreCase)
                            ? "/ingresar/{token}"
                            : "/go/reset-password/{token}");
                    }
                };
            })
            .AddHttpClientInstrumentation()
            .AddConsoleExporter());

    builder.Services.Configure<QuorumOptions>(builder.Configuration.GetSection(QuorumOptions.SectionName));
    builder.Services.Configure<DemoOptions>(builder.Configuration.GetSection(DemoOptions.SectionName));

    builder.Services.Configure<ForwardedHeadersOptions>(options =>
    {
        options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
        options.KnownNetworks.Clear();
        options.KnownProxies.Clear();
    });

    var app = builder.Build();

    app.UseForwardedHeaders();
    app.UseMiddleware<CredentialQueryGuardMiddleware>();
    app.UseMiddleware<CorrelationIdMiddleware>();
    app.UseMiddleware<ExceptionHandlingMiddleware>();
    app.UseMiddleware<SecurityHeadersMiddleware>();

    app.UseSerilogRequestLogging(options =>
    {
        // Never emit raw /ingresar/{token} (or reset-password tokens) in the default request line.
        options.MessageTemplate =
            "HTTP {RequestMethod} {RedactedRequestPath} responded {StatusCode} in {Elapsed:0.0000} ms";
        options.EnrichDiagnosticContext = (diagnosticContext, httpContext) =>
        {
            var path = httpContext.Request.Path.Value ?? string.Empty;
            var redacted = RedactSensitivePath(path);
            diagnosticContext.Set("RedactedRequestPath", redacted);
            diagnosticContext.Set("RequestPath", redacted);
        };
    });

    if (!app.Environment.IsDevelopment())
    {
        app.UseHsts();
    }

    // Behind Nginx, TLS terminates at the proxy. Avoid redirect loops on HTTP pilot ports.
    var disableHttpsRedirect = app.Configuration.GetValue("ASAMBLEAS_DISABLE_HTTPS_REDIRECT", false);
    if (!app.Environment.IsDevelopment() && !disableHttpsRedirect)
    {
        app.UseHttpsRedirection();
    }
    app.UseDefaultFiles();
    app.UseStaticFiles(new StaticFileOptions
    {
        OnPrepareResponse = ctx =>
        {
            var path = ctx.File.Name;
            var reqPath = ctx.Context.Request.Path.Value ?? string.Empty;
            // Fingerprinted / versioned assets (?v= or hashed names) — long cache, immutable.
            var hasVersionQuery = ctx.Context.Request.Query.ContainsKey("v");
            var isVersionedAsset =
                hasVersionQuery
                || reqPath.Contains(".css", StringComparison.OrdinalIgnoreCase)
                || reqPath.Contains(".js", StringComparison.OrdinalIgnoreCase)
                || reqPath.EndsWith(".woff2", StringComparison.OrdinalIgnoreCase)
                || reqPath.EndsWith(".woff", StringComparison.OrdinalIgnoreCase)
                || reqPath.EndsWith(".ttf", StringComparison.OrdinalIgnoreCase)
                || reqPath.EndsWith(".svg", StringComparison.OrdinalIgnoreCase)
                || reqPath.EndsWith(".png", StringComparison.OrdinalIgnoreCase)
                || reqPath.EndsWith(".ico", StringComparison.OrdinalIgnoreCase);

            // Never cache HTML shells (hybrid deep-links must revalidate).
            if (reqPath.EndsWith(".html", StringComparison.OrdinalIgnoreCase) || reqPath is "/" or "")
            {
                ctx.Context.Response.Headers.CacheControl = "no-cache";
                return;
            }

            if (isVersionedAsset && hasVersionQuery)
            {
                ctx.Context.Response.Headers.CacheControl = "public,max-age=31536000,immutable";
            }
            else if (isVersionedAsset)
            {
                ctx.Context.Response.Headers.CacheControl = "public,max-age=86400";
            }
        }
    });

    // If login JS is blocked, a native form POST must not blank-404/405 the site root.
    app.Use(async (context, next) =>
    {
        if (HttpMethods.IsPost(context.Request.Method)
            && (context.Request.Path == "/"
                || context.Request.Path.Equals("/index.html", StringComparison.OrdinalIgnoreCase)))
        {
            context.Response.Redirect("/");
            return;
        }

        await next();
    });

    app.UseRateLimiter();
    app.UseAuthentication();
    app.UseMiddleware<TenantResolutionMiddleware>();
    app.UseAuthorization();

    app.MapHealthChecks("/health");
    app.MapGet("/favicon.ico", (IWebHostEnvironment env) =>
    {
        var path = Path.Combine(env.WebRootPath, "favicon.svg");
        return Results.File(path, "image/svg+xml");
    });
    app.MapHealthChecks("/health/live", new Microsoft.AspNetCore.Diagnostics.HealthChecks.HealthCheckOptions
    {
        Predicate = _ => false
    });
    app.MapHealthChecks("/health/ready", new Microsoft.AspNetCore.Diagnostics.HealthChecks.HealthCheckOptions
    {
        Predicate = check => check.Tags.Contains("ready")
    });

    app.MapHub<AssemblyHub>("/hubs/assembly");
    app.MapControllers();

    // Email-safe short entry for assembly join (path token; JS redeems via POST, then cleans URL).
    app.MapGet("/ingresar/{token}", async (string token, IWebHostEnvironment env, HttpContext http) =>
    {
        http.Response.Headers.CacheControl = "no-store, no-cache, must-revalidate";
        http.Response.Headers.Pragma = "no-cache";
        http.Response.Headers["Referrer-Policy"] = "no-referrer";

        if (string.IsNullOrWhiteSpace(token) || token.Length > 512)
        {
            return Results.Redirect("/join.html");
        }

        // Serve join.html; client reads token from path then replaceState + POST /api/join/redeem.
        // Do not log the token; Serilog path enrichment redacts /ingresar/*.
        var path = Path.Combine(env.WebRootPath, "join.html");
        return Results.File(path, "text/html; charset=utf-8");
    }).AllowAnonymous().DisableAntiforgery();

    // Email-safe short entry for password reset (avoids opening /reset-password.html without ?token=).
    app.MapGet("/go/reset-password/{token}", (string token) =>
    {
        if (string.IsNullOrWhiteSpace(token) || token.Length > 256)
        {
            return Results.Redirect("/reset-password.html");
        }

        return Results.Redirect($"/reset-password.html?token={Uri.EscapeDataString(token)}");
    }).AllowAnonymous();

    var applyMigrations = app.Environment.IsDevelopment()
        || app.Configuration.GetValue("ASAMBLEAS_APPLY_MIGRATIONS", false);
    var demoOptions = app.Configuration.GetSection(DemoOptions.SectionName).Get<DemoOptions>()
        ?? new DemoOptions();
    var seedDemo = demoOptions.Enabled
        && (app.Environment.IsDevelopment() || app.Configuration.GetValue("Demo:SeedUsers", false));
    if (applyMigrations || seedDemo)
    {
        using var scope = app.Services.CreateScope();
        if (applyMigrations)
        {
            var db = scope.ServiceProvider.GetRequiredService<AsambleasDbContext>();
            await db.Database.MigrateAsync();
            Log.Information("EF Core migrations applied");
        }

        if (seedDemo)
        {
            var seeder = scope.ServiceProvider.GetRequiredService<DemoDataSeeder>();
            await seeder.SeedAsync();
            Log.Information("Demo seed executed");
        }
    }

    await app.RunAsync();
}
catch (Exception ex)
{
    Log.Fatal(ex, "Asambleas.Web terminated unexpectedly");
    throw;
}
finally
{
    await Log.CloseAndFlushAsync();
}

static string RedactSensitivePath(string path)
{
    if (string.IsNullOrEmpty(path))
    {
        return path;
    }

    // /ingresar/{token} and /go/reset-password/{token}
    if (path.StartsWith("/ingresar/", StringComparison.OrdinalIgnoreCase))
    {
        return "/ingresar/[REDACTED]";
    }

    if (path.StartsWith("/go/reset-password/", StringComparison.OrdinalIgnoreCase))
    {
        return "/go/reset-password/[REDACTED]";
    }

    return path;
}

public sealed class QuorumOptions
{
    public const string SectionName = "Quorum";

    public decimal RequiredPercent { get; set; } = 50m;
}

public sealed class DemoOptions
{
    public const string SectionName = "Demo";

    public bool Enabled { get; set; }

    public bool PublicUserList { get; set; }
}

/// <summary>
/// Marker for <see cref="Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactory{TEntryPoint}"/>.
/// </summary>
public partial class Program;
