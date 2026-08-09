namespace Asambleas.Web.Middleware;

/// <summary>
/// Blocks credential leakage via query string. Root cause of URL passwords is client form GET;
/// this is defense-in-depth so any accidental GET never keeps secrets in the address bar / Referer.
/// </summary>
public sealed class CredentialQueryGuardMiddleware
{
    private static readonly string[] SensitiveKeys =
    [
        "password", "passwd", "pwd", "secret", "token", "apikey", "api_key"
    ];

    private readonly RequestDelegate _next;

    public CredentialQueryGuardMiddleware(RequestDelegate next) => _next = next;

    public async Task InvokeAsync(HttpContext context)
    {
        if (context.Request.Query.Count > 0 && ContainsSensitiveQuery(context.Request.Query))
        {
            var path = context.Request.Path.HasValue ? context.Request.Path.Value! : "/";
            context.Response.StatusCode = StatusCodes.Status303SeeOther;
            context.Response.Headers.Location = path;
            return;
        }

        await _next(context);
    }

    private static bool ContainsSensitiveQuery(IQueryCollection query)
    {
        foreach (var key in query.Keys)
        {
            if (string.IsNullOrEmpty(key))
            {
                continue;
            }

            var normalized = key.Trim().ToLowerInvariant();
            if (SensitiveKeys.Any(s => normalized == s || normalized.Contains(s, StringComparison.Ordinal)))
            {
                return true;
            }

            if (normalized is "email" or "username" or "user")
            {
                // Email alone is not a password, but email+password combo is handled by password key.
                // Still strip auth-shaped GET logins that include email when password also present —
                // password key already triggers. Allow assemblyId etc.
            }
        }

        return false;
    }
}
