namespace Asambleas.Application.Assembly;

using Asambleas.Application.Abstractions;
using Asambleas.Domain.Enums;
using Microsoft.EntityFrameworkCore;

/// <summary>Shared read-only assembly counters used by readiness and dashboard endpoints.</summary>
internal static class AssemblyMetricsLoader
{
    internal sealed record Metrics(
        int ParticipantCount,
        int CheckedInCount,
        int UnitCount,
        decimal CoefficientTotal,
        bool CoefficientsReady,
        int AgendaCount,
        int MotionCount,
        int SurveyCount,
        int ConvocationCount,
        bool EmailChannelReady);

    internal static async Task<Metrics> LoadAsync(
        IAsambleasDbContext db,
        Guid assemblyId,
        Guid propertyHorizontalId,
        CancellationToken cancellationToken)
    {
        // DbContext is not thread-safe — keep queries sequential on the scoped context.
        var participantStats = await db.AssemblyParticipants
            .AsNoTracking()
            .Where(p => p.AssemblyId == assemblyId)
            .GroupBy(_ => 1)
            .Select(g => new
            {
                Total = g.Count(),
                CheckedIn = g.Count(p =>
                    p.AttendanceStatus == AttendanceStatus.CheckedIn
                    || p.AttendanceStatus == AttendanceStatus.Present
                    || p.AttendanceStatus == AttendanceStatus.TemporarilyDisconnected)
            })
            .FirstOrDefaultAsync(cancellationToken);

        var unitStats = await db.Units
            .AsNoTracking()
            .Where(u => u.PropertyHorizontalId == propertyHorizontalId)
            .GroupBy(_ => 1)
            .Select(g => new
            {
                Count = g.Count(),
                Total = g.Sum(u => u.CoefficientPercent),
                Invalid = g.Count(u => u.CoefficientPercent <= 0m)
            })
            .FirstOrDefaultAsync(cancellationToken);

        var agendaCount = await db.AgendaItems
            .AsNoTracking()
            .CountAsync(i => i.AssemblyId == assemblyId, cancellationToken);

        var motionCount = await db.Motions
            .AsNoTracking()
            .CountAsync(m => m.AssemblyId == assemblyId, cancellationToken);

        var surveyCount = await db.SurveyForms
            .AsNoTracking()
            .CountAsync(s => s.AssemblyId == assemblyId, cancellationToken);

        var convocationCount = await db.Convocations
            .AsNoTracking()
            .CountAsync(c => c.AssemblyId == assemblyId, cancellationToken);

        var emailChannel = await db.ChannelConfigurations
            .AsNoTracking()
            .FirstOrDefaultAsync(
                c => c.PropertyHorizontalId == propertyHorizontalId && c.Channel == CommunicationChannel.Email,
                cancellationToken);

        var unitCount = unitStats?.Count ?? 0;
        var coefficientTotal = unitStats?.Total ?? 0m;
        var coefficientsReady = unitCount > 0 && (unitStats?.Invalid ?? 0) == 0;
        var emailChannelReady = emailChannel is not null
                                && emailChannel.IsEnabled
                                && emailChannel.ProviderType != CommunicationProviderType.Mock;

        return new Metrics(
            participantStats?.Total ?? 0,
            participantStats?.CheckedIn ?? 0,
            unitCount,
            coefficientTotal,
            coefficientsReady,
            agendaCount,
            motionCount,
            surveyCount,
            convocationCount,
            emailChannelReady);
    }
}
