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
        bool EmailChannelReady,
        int OwnerParticipantCount = 0,
        int SentConvocationCount = 0,
        bool VotingSessionExists = false,
        int OwnerAccreditedCount = 0);

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

        var convocationStatuses = await db.Convocations
            .AsNoTracking()
            .Where(c => c.AssemblyId == assemblyId)
            .Select(c => c.Status)
            .ToListAsync(cancellationToken);
        var convocationCount = convocationStatuses.Count;
        var sentConvocationCount = convocationStatuses.Count(s =>
            s is ConvocationStatus.Sent or ConvocationStatus.Partial or ConvocationStatus.Sending);

        var roster = await db.AssemblyParticipants
            .AsNoTracking()
            .Where(p => p.AssemblyId == assemblyId)
            .Select(p => new { p.RoleCode, p.AttendanceStatus })
            .ToListAsync(cancellationToken);
        var ownerParticipantCount = roster.Count(p => !DeskStaffRoles.IsDeskStaff(p.RoleCode));
        var ownerAccreditedCount = roster.Count(p =>
            !DeskStaffRoles.IsDeskStaff(p.RoleCode)
            && p.AttendanceStatus is AttendanceStatus.Present
                or AttendanceStatus.CheckedIn
                or AttendanceStatus.TemporarilyDisconnected);

        var votingSessionExists = await db.VotingSessions
            .AsNoTracking()
            .AnyAsync(s => s.AssemblyId == assemblyId, cancellationToken);

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
            emailChannelReady,
            ownerParticipantCount,
            sentConvocationCount,
            votingSessionExists,
            ownerAccreditedCount);
    }
}

public static class DeskStaffRoles
{
    public static bool IsDeskStaff(string? roleCode)
    {
        if (string.IsNullOrWhiteSpace(roleCode))
        {
            return false;
        }

        return roleCode.Contains("President", StringComparison.OrdinalIgnoreCase)
            || roleCode.Contains("Secretary", StringComparison.OrdinalIgnoreCase)
            || roleCode.Contains("Operator", StringComparison.OrdinalIgnoreCase)
            || roleCode.Contains("PHAdmin", StringComparison.OrdinalIgnoreCase)
            || roleCode.Contains("TenantAdmin", StringComparison.OrdinalIgnoreCase)
            || roleCode.Contains("PlatformAdmin", StringComparison.OrdinalIgnoreCase);
    }
}
