namespace Asambleas.Application.Abstractions;

/// <summary>
/// Short-lived server-side proof that the user redeemed a personal join link for a specific assembly.
/// Not an authorization by itself — check-in still validates desk, eligibility, tenant, PH.
/// </summary>
public interface IVerifiedJoinProofService
{
    void Issue(Guid tenantId, Guid propertyHorizontalId, Guid assemblyId, Guid userId, Guid? accessLinkId, TimeSpan? ttl = null);

    /// <summary>
    /// Atomically consumes a proof for (tenant, assembly, user). Returns false if missing/expired/wrong scope.
    /// </summary>
    bool TryConsume(Guid tenantId, Guid assemblyId, Guid userId, out Guid? accessLinkId);

    void InvalidateUser(Guid userId);

    void InvalidateAssemblyUser(Guid assemblyId, Guid userId);

    bool Peek(Guid tenantId, Guid assemblyId, Guid userId);
}