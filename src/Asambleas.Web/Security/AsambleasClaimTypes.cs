namespace Asambleas.Web.Security;

/// <summary>
/// Custom claim types used by cookie auth and tenant middleware.
/// </summary>
public static class AsambleasClaimTypes
{
    public const string TenantId = "tenant_id";
    public const string OrganizationId = "organization_id";
    public const string PropertyHorizontalId = "property_horizontal_id";
    public const string Permission = "permission";
    public const string DisplayName = "display_name";
}
