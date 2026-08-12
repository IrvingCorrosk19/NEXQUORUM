namespace Asambleas.Domain.Services;

using Asambleas.Domain.Common;
using Asambleas.Domain.Enums;

/// <summary>
/// Validates assembly status transitions for EO-001:
/// Draft → Scheduled → CheckIn → InProgress ⇄ Paused → Completed (also Paused → Completed);
/// Cancelled allowed from Draft, Scheduled, or CheckIn.
/// </summary>
public static class AssemblyLifecycle
{
    public static bool CanTransition(AssemblyStatus from, AssemblyStatus to)
    {
        if (from == to)
        {
            return false;
        }

        return to switch
        {
            AssemblyStatus.Scheduled => from == AssemblyStatus.Draft,
            AssemblyStatus.CheckIn => from == AssemblyStatus.Scheduled,
            AssemblyStatus.InProgress => from is AssemblyStatus.CheckIn or AssemblyStatus.Paused,
            AssemblyStatus.Paused => from == AssemblyStatus.InProgress,
            AssemblyStatus.Completed => from is AssemblyStatus.InProgress or AssemblyStatus.Paused,
            AssemblyStatus.Cancelled => from is AssemblyStatus.Draft
                or AssemblyStatus.Scheduled
                or AssemblyStatus.CheckIn,
            _ => false
        };
    }

    public static void EnsureCanTransition(AssemblyStatus from, AssemblyStatus to)
    {
        if (!CanTransition(from, to))
        {
            throw new DomainException(
                $"Invalid assembly status transition from '{from}' to '{to}'.");
        }
    }

    public static AssemblyStatus Transition(AssemblyStatus from, AssemblyStatus to)
    {
        EnsureCanTransition(from, to);
        return to;
    }

    /// <summary>Terminal states: history / cancellation — no operational mutations.</summary>
    public static bool IsTerminal(AssemblyStatus status) =>
        status is AssemblyStatus.Completed or AssemblyStatus.Cancelled;

    /// <summary>Presence, quorum recalculation, live AV, speakers ops, etc.</summary>
    public static bool AllowsOperationalMutation(AssemblyStatus status) => !IsTerminal(status);

    /// <summary>LiveKit publish/join tokens — not Draft/Scheduled lobby-only/terminal.</summary>
    public static bool AllowsMeetingJoinToken(AssemblyStatus status) =>
        status is AssemblyStatus.CheckIn or AssemblyStatus.InProgress or AssemblyStatus.Paused;
}
