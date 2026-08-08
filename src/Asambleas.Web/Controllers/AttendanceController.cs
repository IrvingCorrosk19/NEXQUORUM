namespace Asambleas.Web.Controllers;

using Asambleas.Application.Attendance;
using Asambleas.Application.Security;
using Asambleas.Contracts.Assemblies;
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

    [HttpPost("check-in")]
    [Authorize(Policy = Permissions.AttendanceView)]
    public Task<CheckInResponse> CheckIn(
        Guid assemblyId,
        [FromBody] CheckInRequest request,
        CancellationToken cancellationToken) =>
        _attendance.CheckInAsync(assemblyId, request, cancellationToken);
}
