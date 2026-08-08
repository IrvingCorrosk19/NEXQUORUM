namespace Asambleas.Web.Controllers;

using Asambleas.Application.Security;
using Asambleas.Infrastructure.Seed;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

[ApiController]
[AllowAnonymous]
[Route("api/demo")]
public sealed class DemoController : ControllerBase
{
    /// <summary>
    /// Public demo user metadata for the login screen. Passwords are documented in docs/DEMO-USERS.md only.
    /// </summary>
    [HttpGet("users")]
    public IActionResult Users()
    {
        var users = DemoUsersCatalog.Users
            .Select(u => new
            {
                u.Email,
                u.UserName,
                u.DisplayName,
                u.Role,
                u.UnitCode,
                u.CoefficientPercent,
                AssemblyId = DemoSeedConstants.AssemblyOceanId
            });

        return Ok(users);
    }
}

public static class DemoUsersCatalog
{
    public static IReadOnlyList<DemoUserInfo> Users { get; } =
    [
        new("president", "president@ocean.demo", "Presidente Asamblea", Roles.AssemblyPresident, "107", 8.00m),
        new("secretary", "secretary@ocean.demo", "Secretario Asamblea", Roles.AssemblySecretary, "108", 8.00m),
        new("owner101", "owner101@ocean.demo", "Propietario 101", Roles.Owner, "101", 14.00m),
        new("owner102", "owner102@ocean.demo", "Propietario 102", Roles.Owner, "102", 14.00m),
        new("owner103", "owner103@ocean.demo", "Propietario 103", Roles.Owner, "103", 14.00m),
        new("owner104", "owner104@ocean.demo", "Propietario 104", Roles.Owner, "104", 14.00m),
        new("owner105", "owner105@ocean.demo", "Propietario 105", Roles.Owner, "105", 14.00m),
        new("owner106", "owner106@ocean.demo", "Propietario 106", Roles.Owner, "106", 14.00m)
    ];
}

public sealed record DemoUserInfo(
    string UserName,
    string Email,
    string DisplayName,
    string Role,
    string UnitCode,
    decimal CoefficientPercent);
