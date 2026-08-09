namespace Asambleas.Application.Common;

using System.Text.Json;
using Asambleas.Application.Abstractions;
using Asambleas.Contracts.Assemblies;
using Asambleas.Contracts.Quorum;
using Asambleas.Domain.Entities;
using Asambleas.Domain.Enums;
using Microsoft.EntityFrameworkCore;
using AssemblyEntity = Asambleas.Domain.Entities.Assembly;

internal static class Mapping
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public static string ToJson(object? metadata) =>
        metadata is null ? "{}" : JsonSerializer.Serialize(metadata, JsonOptions);

    public static AssemblySummaryDto ToSummary(AssemblyEntity assembly) =>
        new(
            assembly.Id,
            assembly.TenantId,
            assembly.PropertyHorizontalId,
            assembly.Title,
            assembly.Modality,
            assembly.Status.ToString(),
            assembly.ScheduledAtUtc,
            assembly.RequiredQuorumPercent,
            assembly.ActiveAgendaItemId);

    public static AssemblyParticipantDto ToParticipantDto(
        AssemblyParticipant participant,
        string? unitCode = null,
        decimal? coefficientPercent = null,
        int representationCount = 0) =>
        new(
            participant.Id,
            participant.AssemblyId,
            participant.UserId,
            participant.UnitId,
            unitCode,
            coefficientPercent ?? (participant.IsAccredited ? participant.EffectiveCoefficientPercent : null),
            participant.DisplayName,
            participant.RoleCode,
            participant.AttendanceStatus.ToString(),
            participant.CheckedInAtUtc,
            participant.IsAccredited,
            participant.EffectiveCoefficientPercent,
            participant.AccreditedAtUtc,
            representationCount,
            participant.PresenceType?.ToString());

    public static QuorumStateDto ToQuorumState(
        Guid assemblyId,
        decimal currentCoefficient,
        decimal requiredCoefficient,
        decimal requiredPercent,
        bool quorumReached,
        int presentUnits,
        int eligibleUnits,
        DateTimeOffset calculatedAtUtc) =>
        new(
            assemblyId,
            currentCoefficient,
            requiredCoefficient,
            requiredPercent,
            quorumReached,
            presentUnits,
            eligibleUnits,
            calculatedAtUtc,
            MissingCoefficient: quorumReached
                ? 0m
                : Math.Max(0m, Math.Round(requiredCoefficient - currentCoefficient, 4, MidpointRounding.AwayFromZero)));

    public static async Task<string?> ResolveUnitCodeAsync(
        IAsambleasDbContext db,
        Guid? unitId,
        CancellationToken cancellationToken)
    {
        if (unitId is null)
        {
            return null;
        }

        return await db.Units
            .AsNoTracking()
            .Where(u => u.Id == unitId.Value)
            .Select(u => u.Code)
            .FirstOrDefaultAsync(cancellationToken);
    }

    public static bool CountsTowardQuorum(AttendanceStatus status) =>
        status is AttendanceStatus.CheckedIn
            or AttendanceStatus.Present
            or AttendanceStatus.TemporarilyDisconnected;

    /// <summary>Accredited + present-ish statuses contribute to quorum.</summary>
    public static bool ContributesToQuorum(AssemblyParticipant participant) =>
        participant.IsAccredited && CountsTowardQuorum(participant.AttendanceStatus);
}
