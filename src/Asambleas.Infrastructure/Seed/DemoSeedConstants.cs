namespace Asambleas.Infrastructure.Seed;

/// <summary>
/// Fixed GUIDs for deterministic demo / isolation seed data (EO-001).
/// </summary>
public static class DemoSeedConstants
{
    public static readonly Guid TenantOceanId = Guid.Parse("11111111-1111-1111-1111-111111111101");
    public static readonly Guid TenantOtherId = Guid.Parse("11111111-1111-1111-1111-111111111102");

    public static readonly Guid OrgOceanId = Guid.Parse("22222222-2222-2222-2222-222222222201");
    public static readonly Guid OrgOtherId = Guid.Parse("22222222-2222-2222-2222-222222222202");

    public static readonly Guid PhOceanId = Guid.Parse("33333333-3333-3333-3333-333333333301");
    public static readonly Guid PhOtherId = Guid.Parse("33333333-3333-3333-3333-333333333302");

    public static readonly Guid AssemblyOceanId = Guid.Parse("44444444-4444-4444-4444-444444444401");
    public static readonly Guid AssemblyOtherId = Guid.Parse("44444444-4444-4444-4444-444444444402");

    public static readonly Guid Unit101Id = Guid.Parse("55555555-5555-5555-5555-555555555101");
    public static readonly Guid Unit102Id = Guid.Parse("55555555-5555-5555-5555-555555555102");
    public static readonly Guid Unit103Id = Guid.Parse("55555555-5555-5555-5555-555555555103");
    public static readonly Guid Unit104Id = Guid.Parse("55555555-5555-5555-5555-555555555104");
    public static readonly Guid Unit105Id = Guid.Parse("55555555-5555-5555-5555-555555555105");
    public static readonly Guid Unit106Id = Guid.Parse("55555555-5555-5555-5555-555555555106");
    public static readonly Guid Unit107Id = Guid.Parse("55555555-5555-5555-5555-555555555107");
    public static readonly Guid Unit108Id = Guid.Parse("55555555-5555-5555-5555-555555555108");
    public static readonly Guid UnitOtherId = Guid.Parse("55555555-5555-5555-5555-555555555201");

    public static readonly Guid Owner101Id = Guid.Parse("66666666-6666-6666-6666-666666666101");
    public static readonly Guid Owner102Id = Guid.Parse("66666666-6666-6666-6666-666666666102");
    public static readonly Guid Owner103Id = Guid.Parse("66666666-6666-6666-6666-666666666103");
    public static readonly Guid Owner104Id = Guid.Parse("66666666-6666-6666-6666-666666666104");
    public static readonly Guid Owner105Id = Guid.Parse("66666666-6666-6666-6666-666666666105");
    public static readonly Guid Owner106Id = Guid.Parse("66666666-6666-6666-6666-666666666106");
    public static readonly Guid OwnerPresidentId = Guid.Parse("66666666-6666-6666-6666-666666666107");
    public static readonly Guid OwnerSecretaryId = Guid.Parse("66666666-6666-6666-6666-666666666108");

    public static readonly Guid OwnerAbsentee107Id = Guid.Parse("66666666-6666-6666-6666-666666666201");
    public static readonly Guid OwnerAbsentee108Id = Guid.Parse("66666666-6666-6666-6666-666666666202");

    public static readonly Guid Power107To102Id = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa101");
    public static readonly Guid Power108To105Id = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa102");

    public static readonly Guid UserPresidentId = Guid.Parse("77777777-7777-7777-7777-777777777101");
    public static readonly Guid UserSecretaryId = Guid.Parse("77777777-7777-7777-7777-777777777102");
    public static readonly Guid UserOwner101Id = Guid.Parse("77777777-7777-7777-7777-777777777103");
    public static readonly Guid UserOwner102Id = Guid.Parse("77777777-7777-7777-7777-777777777104");
    public static readonly Guid UserOwner103Id = Guid.Parse("77777777-7777-7777-7777-777777777105");
    public static readonly Guid UserOwner104Id = Guid.Parse("77777777-7777-7777-7777-777777777106");
    public static readonly Guid UserOwner105Id = Guid.Parse("77777777-7777-7777-7777-777777777107");
    public static readonly Guid UserOwner106Id = Guid.Parse("77777777-7777-7777-7777-777777777108");
    public static readonly Guid UserPhAdminId = Guid.Parse("77777777-7777-7777-7777-777777777109");

    public static readonly Guid Agenda01Id = Guid.Parse("88888888-8888-8888-8888-888888888801");
    public static readonly Guid Agenda02Id = Guid.Parse("88888888-8888-8888-8888-888888888802");
    public static readonly Guid Agenda03Id = Guid.Parse("88888888-8888-8888-8888-888888888803");
    public static readonly Guid Agenda04Id = Guid.Parse("88888888-8888-8888-8888-888888888804");

    public static readonly Guid Motion001Id = Guid.Parse("99999999-9999-9999-9999-999999999001");

    public const string PermissionClaimType = "permission";

    public static readonly (string Code, decimal Coefficient, Guid Id)[] OceanUnits =
    [
        ("101", 14.00m, Unit101Id),
        ("102", 14.00m, Unit102Id),
        ("103", 14.00m, Unit103Id),
        ("104", 14.00m, Unit104Id),
        ("105", 14.00m, Unit105Id),
        ("106", 14.00m, Unit106Id),
        ("107", 8.00m, Unit107Id),
        ("108", 8.00m, Unit108Id)
    ];
}
