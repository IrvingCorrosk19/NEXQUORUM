using Asambleas.Contracts.Representation;
using Asambleas.Infrastructure.Seed;

namespace Asambleas.IntegrationTests.Infrastructure;

/// <summary>
/// Admin-only accreditation helpers. Owners never self-accredit in production or tests.
/// </summary>
public static class AttendanceTestHelpers
{
    public static async Task AccreditAsync(
        AuthenticatedClient operatorClient,
        Guid assemblyId,
        Guid userId,
        string presenceType = "Virtual")
    {
        var response = await operatorClient.PostJsonAsync(
            $"/api/assemblies/{assemblyId}/attendance/participants/{userId}/accredit",
            new AccreditRequest(presenceType, "OperatorCheckIn"));
        response.EnsureSuccessStatusCode();
    }

    /// <summary>Marks the authenticated user Present (requires prior accreditation).</summary>
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
        await AccreditAsync(operatorClient, assemblyId, userId, presenceType);
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
