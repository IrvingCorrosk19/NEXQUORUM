using Asambleas.Contracts.Representation;
using Asambleas.Infrastructure.Seed;

namespace Asambleas.IntegrationTests.Infrastructure;

/// <summary>
/// Presence helpers. Accreditation was removed — convocation authorizes; presence drives quorum/vote.
/// </summary>
public static class AttendanceTestHelpers
{
    /// <summary>
    /// Legacy name kept for call sites. No longer hits /accredit (410).
    /// Representation materializes on MarkPresent / SignalR join.
    /// </summary>
    public static Task AccreditAsync(
        AuthenticatedClient operatorClient,
        Guid assemblyId,
        Guid userId,
        string presenceType = "Virtual") =>
        Task.CompletedTask;

    /// <summary>Marks the authenticated user Present (materializes representations on first join).</summary>
    public static async Task MarkPresentAsync(AuthenticatedClient client, Guid assemblyId)
    {
        var response = await client.PostAsync($"/api/assemblies/{assemblyId}/attendance/presence");
        response.EnsureSuccessStatusCode();
    }

    public static async Task AccreditAndPresentAsync(
        AuthenticatedClient operatorClient,
        AuthenticatedClient ownerClient,
        Guid assemblyId,
        Guid userId,
        string presenceType = "Virtual")
    {
        await MarkPresentAsync(ownerClient, assemblyId);
    }

    public static Task AccreditOwner101Async(
        AuthenticatedClient president,
        AuthenticatedClient owner101,
        Guid? assemblyId = null) =>
        AccreditAndPresentAsync(
            president,
            owner101,
            assemblyId ?? DemoSeedConstants.AssemblyOceanId,
            DemoSeedConstants.UserOwner101Id);
}
