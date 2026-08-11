namespace Asambleas.Web.Middleware;

/// <summary>
/// Blocks credential leakage via query string. Root cause of URL passwords is client form GET;
/// this is defense-in-depth so any accidental GET never keeps secrets in the address bar / Referer.
/// </summary>
public sealed class CredentialQueryGuardMiddleware
{
    /// <summary>Never allow passwords/secrets in query. Invitation tokens are allowed only on activation UX.</summary>
    private static readonly string[] AlwaysSensitiveKeys =
    [
        "password", "passwd", "pwd", "secret", "apikey", "api_key"
    ];

    private static readonly string[] TokenLikeKeys =
    [
        "token", "accesstoken", "access_token", "id_token"
    ];

    private readonly RequestDelegate _next;

    public CredentialQueryGuardMiddleware(RequestDelegate next) => _next = next;

    public async Task InvokeAsync(HttpContext context)
    {
        if (context.Request.Query.Count > 0 && ContainsSensitiveQuery(context.Request.Path, context.Request.Query))
        {
            var path = context.Request.Path.HasValue ? context.Request.Path.Value! : "/";
            context.Response.StatusCode = StatusCodes.Status303SeeOther;
            context.Response.Headers.Location = path;
            return;
        }

        await _next(context);
    }

    private static bool ContainsSensitiveQuery(PathString path, IQueryCollection query)
    {
        var allowInviteToken = IsOwnerActivationPath(path);

        foreach (var key in query.Keys)
        {
            if (string.IsNullOrEmpty(key))
            {
                continue;
            }

            var normalized = key.Trim().ToLowerInvariant();
            if (AlwaysSensitiveKeys.Any(s => normalized == s || normalized.Contains(s, StringComparison.Ordinal)))
            {
                return true;
            }

            if (TokenLikeKeys.Any(s => normalized == s || normalized.Contains(s, StringComparison.Ordinal)))
            {
                // Owner portal activation uses a single-use opaque token in the query on /activate.html only.
                if (allowInviteToken && normalized == "token")
                {
                    continue;
                }

                return true;
            }
        }

        return false;
    }

    private static bool IsOwnerActivationPath(PathString path)
    {
        var value = path.Value ?? string.Empty;
        return value.Equals("/activate.html", StringComparison.OrdinalIgnoreCase)
               || value.Equals("/activate", StringComparison.OrdinalIgnoreCase);
    }
}
