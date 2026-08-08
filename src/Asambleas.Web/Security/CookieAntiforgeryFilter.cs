namespace Asambleas.Web.Security;

using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

/// <summary>
/// Validates antiforgery tokens from the RequestVerificationToken header for authenticated cookie mutations.
/// </summary>
public sealed class CookieAntiforgeryFilter : IAsyncActionFilter
{
    private readonly IAntiforgery _antiforgery;

    public CookieAntiforgeryFilter(IAntiforgery antiforgery)
    {
        _antiforgery = antiforgery;
    }

    public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        var request = context.HttpContext.Request;
        var method = request.Method;

        var isUnsafe = HttpMethods.IsPost(method)
                       || HttpMethods.IsPut(method)
                       || HttpMethods.IsPatch(method)
                       || HttpMethods.IsDelete(method);

        var allowAnonymous = context.ActionDescriptor.EndpointMetadata
            .OfType<Microsoft.AspNetCore.Authorization.AllowAnonymousAttribute>()
            .Any();

        if (isUnsafe
            && !allowAnonymous
            && context.HttpContext.User.Identity?.IsAuthenticated == true)
        {
            try
            {
                await _antiforgery.ValidateRequestAsync(context.HttpContext);
            }
            catch (AntiforgeryValidationException)
            {
                context.Result = new AntiforgeryValidationFailedResult();
                return;
            }
        }

        await next();
    }
}

public sealed class AntiforgeryValidationFailedResult : ObjectResult
{
    public AntiforgeryValidationFailedResult()
        : base(new ProblemDetails
        {
            Status = StatusCodes.Status400BadRequest,
            Title = "Antiforgery validation failed",
            Detail = "Missing or invalid antiforgery token. Call GET /api/auth/antiforgery first."
        })
    {
        StatusCode = StatusCodes.Status400BadRequest;
        ContentTypes.Add("application/problem+json");
    }
}
