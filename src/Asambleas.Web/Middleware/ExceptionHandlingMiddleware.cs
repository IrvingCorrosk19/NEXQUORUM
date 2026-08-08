namespace Asambleas.Web.Middleware;

using Asambleas.Domain.Common;
using Microsoft.AspNetCore.Mvc;

public sealed class ExceptionHandlingMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<ExceptionHandlingMiddleware> _logger;
    private readonly IHostEnvironment _environment;

    public ExceptionHandlingMiddleware(
        RequestDelegate next,
        ILogger<ExceptionHandlingMiddleware> logger,
        IHostEnvironment environment)
    {
        _next = next;
        _logger = logger;
        _environment = environment;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await _next(context);
        }
        catch (Exception ex)
        {
            await WriteProblemAsync(context, ex);
        }
    }

    private async Task WriteProblemAsync(HttpContext context, Exception exception)
    {
        var correlationId = CorrelationIdMiddleware.Get(context) ?? Guid.NewGuid().ToString("N");

        if (exception is DomainException domainException)
        {
            _logger.LogWarning(domainException, "Domain exception. CorrelationId={CorrelationId}", correlationId);

            var status = MapDomainStatus(domainException.Message);
            var problem = new ProblemDetails
            {
                Status = status,
                Title = status == StatusCodes.Status403Forbidden ? "Forbidden" : "Bad Request",
                Detail = domainException.Message,
                Instance = context.Request.Path,
                Extensions =
                {
                    ["correlationId"] = correlationId
                }
            };

            if (!string.IsNullOrWhiteSpace(domainException.Code))
            {
                problem.Extensions["code"] = domainException.Code;
            }

            context.Response.StatusCode = status;
            context.Response.ContentType = "application/problem+json";
            await context.Response.WriteAsJsonAsync(problem);
            return;
        }

        _logger.LogError(exception, "Unhandled exception. CorrelationId={CorrelationId}", correlationId);

        var unhandled = new ProblemDetails
        {
            Status = StatusCodes.Status500InternalServerError,
            Title = "An unexpected error occurred.",
            Detail = _environment.IsDevelopment()
                ? exception.Message
                : "An unexpected error occurred. Use the correlation id when contacting support.",
            Instance = context.Request.Path,
            Extensions =
            {
                ["correlationId"] = correlationId
            }
        };

        context.Response.StatusCode = StatusCodes.Status500InternalServerError;
        context.Response.ContentType = "application/problem+json";
        await context.Response.WriteAsJsonAsync(unhandled);
    }

    private static int MapDomainStatus(string message)
    {
        // Authorization / tenancy denials only — business rule violations stay 400.
        if (message.Contains("Cross-tenant", StringComparison.OrdinalIgnoreCase)
            || message.Contains("Forbidden", StringComparison.OrdinalIgnoreCase)
            || message.Contains("Authenticated tenant context is required", StringComparison.OrdinalIgnoreCase)
            || message.Contains("does not belong to the current tenant", StringComparison.OrdinalIgnoreCase))
        {
            return StatusCodes.Status403Forbidden;
        }

        return StatusCodes.Status400BadRequest;
    }
}
