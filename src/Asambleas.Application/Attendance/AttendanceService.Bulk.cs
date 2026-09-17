namespace Asambleas.Application.Attendance;

using Asambleas.Contracts.Representation;
using Asambleas.Domain.Common;

/// <summary>
/// Bulk accreditation / deaccreditation endpoints are retired.
/// Convocation authorizes participation; presence drives quorum.
/// </summary>
public sealed partial class AttendanceService
{
    public const string AbsentConfirmationPhraseRequired = "ACREDITAR AUSENTES";

    public Task<BulkAccreditResponse> AccreditBulkAsync(
        Guid assemblyId,
        BulkAccreditRequest request,
        CancellationToken cancellationToken = default) =>
        Task.FromException<BulkAccreditResponse>(AccreditationRemoved());

    public Task<BulkAccreditPreviewDto> PreviewBulkAsync(
        Guid assemblyId,
        BulkAccreditRequest request,
        CancellationToken cancellationToken = default) =>
        Task.FromException<BulkAccreditPreviewDto>(AccreditationRemoved());

    public Task<BulkDeaccreditPreviewDto> PreviewDeaccreditBulkAsync(
        Guid assemblyId,
        BulkDeaccreditRequest request,
        CancellationToken cancellationToken = default) =>
        Task.FromException<BulkDeaccreditPreviewDto>(AccreditationRemoved());

    public Task<BulkDeaccreditResponse> DeaccreditBulkAsync(
        Guid assemblyId,
        BulkDeaccreditRequest request,
        CancellationToken cancellationToken = default) =>
        Task.FromException<BulkDeaccreditResponse>(AccreditationRemoved());
}
