namespace Asambleas.Infrastructure;

using Asambleas.Application.Abstractions;
using Asambleas.Application.Abstractions.Communications;
using Asambleas.Application.Communications;
using Asambleas.Infrastructure.Communications;
using Asambleas.Infrastructure.Identity;
using Asambleas.Infrastructure.Meeting;
using Asambleas.Infrastructure.Persistence;
using Asambleas.Infrastructure.Seed;
using Asambleas.Infrastructure.Tenancy;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

public static class DependencyInjection
{
    public static IServiceCollection AddAsambleasInfrastructure(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        ArgumentNullException.ThrowIfNull(services);
        ArgumentNullException.ThrowIfNull(configuration);

        services.AddScoped<CurrentTenant>();
        services.AddScoped<ICurrentTenant>(sp => sp.GetRequiredService<CurrentTenant>());

        BindLiveKitOptions(services, configuration);

        var connectionString = configuration.GetConnectionString("DefaultConnection")
            ?? throw new InvalidOperationException(
                "Connection string 'DefaultConnection' is required for Asambleas.Infrastructure.");

        services.AddDbContext<AsambleasDbContext>((sp, options) =>
        {
            options.UseNpgsql(connectionString, npgsql =>
            {
                npgsql.MigrationsAssembly(typeof(AsambleasDbContext).Assembly.FullName);
                npgsql.MigrationsHistoryTable("__ef_migrations_history", "public");
            });
        });

        services.AddScoped<IAsambleasDbContext>(sp => sp.GetRequiredService<AsambleasDbContext>());

        services
            .AddIdentityCore<ApplicationUser>(options =>
            {
        options.User.RequireUniqueEmail = true;
                options.Password.RequiredLength = 12;
                options.Password.RequireDigit = true;
                options.Password.RequireLowercase = true;
                options.Password.RequireUppercase = true;
                options.Password.RequireNonAlphanumeric = true;
                options.Lockout.AllowedForNewUsers = true;
                options.Lockout.MaxFailedAccessAttempts = 5;
                options.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(15);
            })
            .AddRoles<ApplicationRole>()
            .AddEntityFrameworkStores<AsambleasDbContext>()
            .AddSignInManager()
            .AddDefaultTokenProviders();

        services.AddScoped<IMeetingProvider, LiveKitMeetingProvider>();
        services.AddScoped<DemoDataSeeder>();

        services.AddDataProtection();
        services.AddScoped<ISecretProtector, DataProtectionSecretProtector>();
        services.AddSingleton<ICommunicationEnvironment, HostCommunicationEnvironment>();
        services.AddScoped<MockEmailProvider>();
        services.AddScoped<IEmailProvider>(sp => sp.GetRequiredService<MockEmailProvider>());
        services.AddScoped<IWhatsAppProvider, MockWhatsAppProvider>();
        services.AddScoped<ISmsProvider, MockSmsProvider>();
        services.AddScoped<IPortalNotificationProvider, PortalNotificationProvider>();
        services.AddScoped<Func<SmtpClientFactoryArgs, IEmailProvider>>(sp => args =>
        {
            var settings = SmtpClientSettings.FromJson(args.SettingsJson, args.Password);
            return new SmtpEmailProvider(settings, sp.GetRequiredService<ILogger<SmtpEmailProvider>>());
        });

        return services;
    }

    private static void BindLiveKitOptions(IServiceCollection services, IConfiguration configuration)
    {
        services.Configure<LiveKitOptions>(options =>
        {
            configuration.GetSection(LiveKitOptions.SectionName).Bind(options);

            // Environment variables override config section (never hardcode secrets).
            options.Url = FirstNonEmpty(
                Environment.GetEnvironmentVariable("LIVEKIT_URL"),
                options.Url) ?? string.Empty;

            options.ApiKey = FirstNonEmpty(
                Environment.GetEnvironmentVariable("LIVEKIT_API_KEY"),
                options.ApiKey) ?? string.Empty;

            options.ApiSecret = FirstNonEmpty(
                Environment.GetEnvironmentVariable("LIVEKIT_API_SECRET"),
                options.ApiSecret) ?? string.Empty;

            options.DefaultRoomPrefix = FirstNonEmpty(
                Environment.GetEnvironmentVariable("LIVEKIT_DEFAULT_ROOM_PREFIX"),
                options.DefaultRoomPrefix);
        });
    }

    private static string? FirstNonEmpty(params string?[] values)
    {
        foreach (var value in values)
        {
            if (!string.IsNullOrWhiteSpace(value))
            {
                return value.Trim();
            }
        }

        return null;
    }
}
