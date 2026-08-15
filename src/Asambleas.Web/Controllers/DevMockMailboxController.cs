using Asambleas.Infrastructure.Communications;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Asambleas.Web.Controllers;

/// <summary>
/// Development-only mock mailbox for localhost E2E (activation links, convocation emails).
/// Not registered in Production.
/// </summary>
[ApiController]
[Route("api/dev/mock-mailbox")]
#if !DEBUG
[ApiExplorerSettings(IgnoreApi = true)]
#endif
public sealed class DevMockMailboxController : ControllerBase
{
    private readonly IHostEnvironment _env;

    public DevMockMailboxController(IHostEnvironment env) => _env = env;

    [HttpGet]
    [AllowAnonymous]
    public IActionResult List([FromQuery] string? to = null)
    {
        if (!_env.IsDevelopment())
        {
            return NotFound();
        }

        var items = MockEmailProvider.Snapshot()
            .Where(m => string.IsNullOrWhiteSpace(to) ||
                        string.Equals(m.To, to, StringComparison.OrdinalIgnoreCase))
            .OrderByDescending(m => m.AtUtc)
            .Select(m => new
            {
                m.AtUtc,
                m.To,
                m.Subject,
                m.HtmlBody,
                m.TextBody,
                activationToken = ExtractActivationToken(m.HtmlBody, m.TextBody)
            });
        return Ok(items);
    }

    [HttpPost("clear")]
    [AllowAnonymous]
    public IActionResult Clear()
    {
        if (!_env.IsDevelopment())
        {
            return NotFound();
        }

        MockEmailProvider.Clear();
        return NoContent();
    }

    private static string? ExtractActivationToken(string? html, string? text)
    {
        var blob = $"{html}\n{text}";
        var marker = "activate.html?token=";
        var idx = blob.IndexOf(marker, StringComparison.OrdinalIgnoreCase);
        if (idx < 0)
        {
            return null;
        }

        var start = idx + marker.Length;
        var end = start;
        while (end < blob.Length)
        {
            var c = blob[end];
            if (c is '"' or '\'' or ' ' or '<' or '&' or '\r' or '\n' or '#')
            {
                break;
            }

            end++;
        }

        var raw = blob[start..end];
        return Uri.UnescapeDataString(raw);
    }
}
