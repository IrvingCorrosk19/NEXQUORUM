namespace Asambleas.Web.Controllers;

using Asambleas.Application.Attendance;
using Asambleas.Application.Communications;
using Asambleas.Application.Security;
using Asambleas.Contracts.Assemblies;
using Asambleas.Contracts.Realtime;
using Asambleas.Contracts.Representation;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

[ApiController]
[Authorize]
[Route("api/assemblies/{assemblyId:guid}/attendance")]
public sealed class AttendanceController : ControllerBase
{
    private readonly AttendanceService _attendance;
    private readonly AssemblySummonService _summon;
    private readonly LobbyAdmissionService _lobby;
    private readonly ConvocationService _convocations;

    public AttendanceController(
        AttendanceService attendance,
        AssemblySummonService summon,
        LobbyAdmissionService lobby,
        ConvocationService convocations)
    {
        _attendance = attendance;
        _summon = summon;
        _lobby = lobby;
        _convocations = convocations;
    }

    [HttpGet("participants")]
    [Authorize(Policy = Permissions.AttendanceView)]
    public async Task<ActionResult<object>> Participants(
        Guid assemblyId,
        [FromQuery] int? skip,
        [FromQuery] int? take,
        [FromQuery] string? q,
        [FromQuery] string? status,
        CancellationToken cancellationToken)
    {
        // Heal roster: convocated owners without login were previously skipped.
        await _convocations.SyncAssemblyParticipantsAsync(assemblyId, cancellationToken);

        if (skip is null && take is null && string.IsNullOrWhiteSpace(q) && string.IsNullOrWhiteSpace(status))
        {
            // Backward-compatible full list for existing clients.
            var all = await _attendance.ListParticipantsAsync(assemblyId, cancellationToken);
            return Ok(all);
        }

        var page = await _attendance.ListParticipantsPageAsync(
            assemblyId,
            skip ?? 0,
            take ?? 100,
            q,
            status,
            cancellationToken);
        return Ok(page);
    }

    [HttpGet("verified-join-status")]
    [Authorize(Policy = Permissions.AttendanceView)]
    public ActionResult<object> VerifiedJoinStatus(Guid assemblyId) =>
        Ok(_attendance.GetVerifiedJoinStatus(assemblyId));

    [HttpGet("participant-ids")]
    [Authorize(Policy = Permissions.AttendanceView)]
    public Task<IReadOnlyList<Guid>> ParticipantIds(
        Guid assemblyId,
        [FromQuery] string? q,
        [FromQuery] string? status,
        CancellationToken cancellationToken) =>
        _attendance.ListParticipantUserIdsAsync(assemblyId, q, status, cancellationToken);

    [HttpGet("exceptions")]
    [Authorize(Policy = Permissions.AttendanceManage)]
    public Task<IReadOnlyList<AttendanceExceptionItemDto>> Exceptions(
        Guid assemblyId,
        CancellationToken cancellationToken) =>
        _attendance.ListExceptionsAsync(assemblyId, cancellationToken);

    [HttpPost("exceptions/{userId:guid}/resolve")]
    [Authorize(Policy = Permissions.AttendanceManage)]
    public Task<AttendanceExceptionItemDto> ResolveException(
        Guid assemblyId,
        Guid userId,
        [FromBody] ResolveAttendanceExceptionRequest request,
        CancellationToken cancellationToken) =>
        _attendance.ResolveExceptionAsync(assemblyId, userId, request, cancellationToken);

    [HttpGet("participants/{userId:guid}/preview")]
    [Authorize(Policy = Permissions.AttendanceView)]
    public Task<RepresentationPreviewDto> Preview(
        Guid assemblyId,
        Guid userId,
        CancellationToken cancellationToken) =>
        _attendance.PreviewAsync(assemblyId, userId, cancellationToken);

    [HttpPost("check-in")]
    [Authorize(Policy = Permissions.AttendanceManage)]
    public async Task<ActionResult<CheckInResponse>> CheckIn(
        Guid assemblyId,
        [FromBody] CheckInRequest request,
        CancellationToken cancellationToken)
    {
        // Defense in depth: owners with attendance:view only receive 403 from the policy.
        // Service also rejects callers without attendance:manage.
        var result = await _attendance.CheckInAsync(assemblyId, request, cancellationToken);
        return Ok(new CheckInResponse(
            result.ParticipantId,
            result.AttendanceStatus,
            result.CheckedInAtUtc,
            result.IsAccredited,
            result.EffectiveCoefficientPercent,
            result.IdempotentReplay));
    }

    /// <summary>
    /// Marks the current user as Present if already accredited. Never accredits.
    /// </summary>
    [HttpPost("presence")]
    [Authorize(Policy = Permissions.AttendanceView)]
    public Task<AssemblyParticipantDto> MarkSelfPresent(
        Guid assemblyId,
        CancellationToken cancellationToken) =>
        _attendance.MarkSelfPresentAsync(assemblyId, cancellationToken);

    [HttpPost("participants/{userId:guid}/accredit")]
    [Authorize(Policy = Permissions.AttendanceManage)]
    public Task<AccreditResponse> Accredit(
        Guid assemblyId,
        Guid userId,
        [FromBody] AccreditRequest request,
        CancellationToken cancellationToken) =>
        _attendance.AccreditAsync(assemblyId, userId, request, cancellationToken);

    [HttpPost("accredit-bulk")]
    [Authorize(Policy = Permissions.AttendanceManage)]
    public Task<BulkAccreditResponse> AccreditBulk(
        Guid assemblyId,
        [FromBody] BulkAccreditRequest request,
        CancellationToken cancellationToken) =>
        _attendance.AccreditBulkAsync(assemblyId, request, cancellationToken);

    [HttpPost("accredit-bulk/preview")]
    [Authorize(Policy = Permissions.AttendanceManage)]
    public Task<BulkAccreditPreviewDto> PreviewBulk(
        Guid assemblyId,
        [FromBody] BulkAccreditRequest request,
        CancellationToken cancellationToken) =>
        _attendance.PreviewBulkAsync(assemblyId, request, cancellationToken);

    [HttpPost("deaccredit-bulk/preview")]
    [Authorize(Policy = Permissions.AttendanceManage)]
    public Task<BulkDeaccreditPreviewDto> PreviewDeaccreditBulk(
        Guid assemblyId,
        [FromBody] BulkDeaccreditRequest request,
        CancellationToken cancellationToken) =>
        _attendance.PreviewDeaccreditBulkAsync(assemblyId, request, cancellationToken);

    [HttpPost("deaccredit-bulk")]
    [Authorize(Policy = Permissions.AttendanceManage)]
    public Task<BulkDeaccreditResponse> DeaccreditBulk(
        Guid assemblyId,
        [FromBody] BulkDeaccreditRequest request,
        CancellationToken cancellationToken) =>
        _attendance.DeaccreditBulkAsync(assemblyId, request, cancellationToken);

    [HttpPost("participants/{userId:guid}/deaccredit")]
    [Authorize(Policy = Permissions.AttendanceManage)]
    public Task<DeaccreditResponse> Deaccredit(
        Guid assemblyId,
        Guid userId,
        [FromBody] DeaccreditRequest request,
        CancellationToken cancellationToken) =>
        _attendance.DeaccreditAsync(assemblyId, userId, request, cancellationToken);

    /// <summary>Avisar para unirse — SignalR prompt to an absent participant.</summary>
    [HttpPost("participants/{userId:guid}/summon")]
    [Authorize(Policy = Permissions.AssemblyManage)]
    public Task<JoinSummonResultDto> Summon(
        Guid assemblyId,
        Guid userId,
        CancellationToken cancellationToken) =>
        _summon.SummonOneAsync(assemblyId, userId, cancellationToken);

    [HttpPost("summon-response")]
    public Task<JoinSummonResultDto> SummonResponse(
        Guid assemblyId,
        [FromBody] SummonResponseRequest request,
        CancellationToken cancellationToken) =>
        _summon.ReportResponseAsync(assemblyId, request.Status, cancellationToken);

    [HttpPost("summon-absent")]
    [Authorize(Policy = Permissions.AssemblyManage)]
    public Task<JoinSummonBatchResultDto> SummonAbsent(
        Guid assemblyId,
        CancellationToken cancellationToken) =>
        _summon.SummonAbsentAsync(assemblyId, cancellationToken);

    [HttpGet("lobby/waiting")]
    [Authorize(Policy = Permissions.AttendanceManage)]
    public Task<IReadOnlyList<AssemblyParticipantDto>> Waiting(
        Guid assemblyId,
        CancellationToken cancellationToken) =>
        _lobby.ListWaitingAsync(assemblyId, cancellationToken);

    [HttpPost("lobby/request-entry")]
    public Task<AssemblyParticipantDto> RequestEntry(
        Guid assemblyId,
        CancellationToken cancellationToken) =>
        _lobby.RequestEntryAsync(assemblyId, cancellationToken);

    [HttpPost("lobby/cancel-entry")]
    public Task<AssemblyParticipantDto> CancelEntry(
        Guid assemblyId,
        CancellationToken cancellationToken) =>
        _lobby.CancelEntryRequestAsync(assemblyId, cancellationToken);

    [HttpPost("lobby/admit/{userId:guid}")]
    [Authorize(Policy = Permissions.AttendanceManage)]
    public Task<AssemblyParticipantDto> Admit(
        Guid assemblyId,
        Guid userId,
        CancellationToken cancellationToken) =>
        _lobby.AdmitAsync(assemblyId, userId, cancellationToken);

    [HttpPost("lobby/admit-authorized")]
    [Authorize(Policy = Permissions.AttendanceManage)]
    public Task<IReadOnlyList<AssemblyParticipantDto>> AdmitAuthorized(
        Guid assemblyId,
        CancellationToken cancellationToken) =>
        _lobby.AdmitAllAuthorizedAsync(assemblyId, cancellationToken);

    [HttpPost("lobby/reject/{userId:guid}")]
    [Authorize(Policy = Permissions.AttendanceManage)]
    public Task<AssemblyParticipantDto> Reject(
        Guid assemblyId,
        Guid userId,
        [FromBody] RejectRoomEntryRequest? request,
        CancellationToken cancellationToken) =>
        _lobby.RejectAsync(assemblyId, userId, request?.Reason, cancellationToken);
}

public sealed record RejectRoomEntryRequest(string? Reason);

public sealed record SummonResponseRequest(string Status);
