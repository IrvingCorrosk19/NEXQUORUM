namespace Asambleas.Web.Controllers;

using Asambleas.Application.Attendance;
using Asambleas.Application.Security;
using Asambleas.Contracts.Assemblies;
using Asambleas.Contracts.Representation;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

[ApiController]
[Authorize]
[Route("api/assemblies/{assemblyId:guid}/attendance")]
public sealed class AttendanceController : ControllerBase
{
    private readonly AttendanceService _attendance;

    public AttendanceController(AttendanceService attendance)
    {
        _attendance = attendance;
    }

    [HttpGet("participants")]
    [Authorize(Policy = Permissions.AttendanceView)]
    public Task<IReadOnlyList<AssemblyParticipantDto>> Participants(
        Guid assemblyId,
        CancellationToken cancellationToken) =>
        _attendance.ListParticipantsAsync(assemblyId, cancellationToken);

    [HttpGet("participants/{userId:guid}/preview")]
    [Authorize(Policy = Permissions.AttendanceView)]
    public Task<RepresentationPreviewDto> Preview(
        Guid assemblyId,
        Guid userId,
        CancellationToken cancellationToken) =>
        _attendance.PreviewAsync(assemblyId, userId, cancellationToken);

    [HttpPost("check-in")]
    [Authorize(Policy = Permissions.AttendanceView)]
    public async Task<CheckInResponse> CheckIn(
        Guid assemblyId,
        [FromBody] CheckInRequest request,
        CancellationToken cancellationToken)
    {
        var result = await _attendance.CheckInAsync(assemblyId, request, cancellationToken);
        return new CheckInResponse(
            result.ParticipantId,
            result.AttendanceStatus,
            result.CheckedInAtUtc,
            result.IsAccredited,
            result.EffectiveCoefficientPercent,
            result.IdempotentReplay);
    }

    [HttpPost("participants/{userId:guid}/accredit")]
    [Authorize(Policy = Permissions.AttendanceManage)]
    public Task<AccreditResponse> Accredit(
        Guid assemblyId,
        Guid userId,
        [FromBody] AccreditRequest request,
        CancellationToken cancellationToken) =>
        _attendance.AccreditAsync(assemblyId, userId, request, cancellationToken);
}
