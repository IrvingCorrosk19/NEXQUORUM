namespace Asambleas.Web.Controllers;

using Asambleas.Application.Calendar;
using Asambleas.Application.Security;
using Asambleas.Contracts.Assemblies;
using Asambleas.Contracts.Calendar;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

[ApiController]
[Authorize]
[Route("api/calendar")]
public sealed class CalendarController : ControllerBase
{
    private readonly CalendarSchedulingService _calendar;

    public CalendarController(CalendarSchedulingService calendar) => _calendar = calendar;

    [HttpGet("events")]
    [Authorize(Policy = Permissions.CalendarView)]
    public Task<CalendarListResponse> Events(
        [FromQuery] DateTimeOffset from,
        [FromQuery] DateTimeOffset to,
        [FromQuery] Guid? propertyHorizontalId,
        [FromQuery] string? status,
        [FromQuery] string? modality,
        CancellationToken cancellationToken) =>
        _calendar.ListEventsAsync(from, to, propertyHorizontalId, status, modality, cancellationToken);

    [HttpGet("next")]
    [Authorize(Policy = Permissions.CalendarView)]
    public Task<NextAssemblyDto> Next(CancellationToken cancellationToken) =>
        _calendar.GetNextAsync(cancellationToken);

    [HttpGet("events/{assemblyId:guid}")]
    [Authorize(Policy = Permissions.CalendarView)]
    public Task<CalendarEventDto> Event(Guid assemblyId, CancellationToken cancellationToken) =>
        _calendar.GetEventAsync(assemblyId, cancellationToken);
}

[ApiController]
[Authorize]
[Route("api/assemblies")]
public sealed class AssemblySchedulingController : ControllerBase
{
    private readonly CalendarSchedulingService _calendar;

    public AssemblySchedulingController(CalendarSchedulingService calendar) => _calendar = calendar;

    [HttpPost]
    [Authorize(Policy = Permissions.AssemblySchedule)]
    public Task<AssemblyDetailDto> Create([FromBody] ScheduleAssemblyRequest request, CancellationToken cancellationToken) =>
        _calendar.CreateAndScheduleAsync(request, cancellationToken);

    [HttpGet("{assemblyId:guid}/reschedule/impact")]
    [Authorize(Policy = Permissions.AssemblyReschedule)]
    public Task<RescheduleImpactDto> Impact(
        Guid assemblyId,
        [FromQuery] DateTimeOffset newScheduledAtUtc,
        [FromQuery] DateTimeOffset? newEstimatedEndAtUtc,
        CancellationToken cancellationToken) =>
        _calendar.PreviewRescheduleAsync(assemblyId, newScheduledAtUtc, newEstimatedEndAtUtc, cancellationToken);

    [HttpPost("{assemblyId:guid}/reschedule")]
    [Authorize(Policy = Permissions.AssemblyReschedule)]
    public Task<CalendarEventDto> Reschedule(
        Guid assemblyId,
        [FromBody] RescheduleAssemblyRequest request,
        CancellationToken cancellationToken) =>
        _calendar.RescheduleAsync(assemblyId, request, cancellationToken);

    [HttpPost("{assemblyId:guid}/cancel")]
    [Authorize(Policy = Permissions.AssemblyCancel)]
    public Task<CalendarEventDto> Cancel(
        Guid assemblyId,
        [FromBody] CancelAssemblyRequest request,
        CancellationToken cancellationToken) =>
        _calendar.CancelAsync(assemblyId, request, cancellationToken);

    [HttpGet("{assemblyId:guid}/schedule-history")]
    [Authorize(Policy = Permissions.AssemblyView)]
    public Task<IReadOnlyList<ScheduleChangeDto>> History(Guid assemblyId, CancellationToken cancellationToken) =>
        _calendar.GetHistoryAsync(assemblyId, cancellationToken);

    [HttpGet("{assemblyId:guid}/calendar.ics")]
    [Authorize(Policy = Permissions.CalendarView)]
    public async Task<IActionResult> Ics(Guid assemblyId, CancellationToken cancellationToken)
    {
        var (fileName, content) = await _calendar.BuildIcsAsync(assemblyId, cancellationToken);
        return File(System.Text.Encoding.UTF8.GetBytes(content), "text/calendar; charset=utf-8", fileName);
    }

    [HttpGet("{assemblyId:guid}/calendar-links")]
    [Authorize(Policy = Permissions.CalendarView)]
    public Task<AssemblyIcsLinksDto> Links(Guid assemblyId, CancellationToken cancellationToken)
    {
        var origin = $"{Request.Scheme}://{Request.Host}";
        return _calendar.GetCalendarLinksAsync(assemblyId, origin, cancellationToken);
    }
}
