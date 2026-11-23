using Asambleas.Domain.Enums;

namespace Asambleas.Application.Attendance;

/// <summary>
/// A data connection must not undo an explicit leave. Re-entry is a later room entry.
/// </summary>
public static class PresenceJoinPolicy
{
    public static bool AllowsPresent(
        AttendanceStatus freshStatus,
        bool explicitRoomEntry,
        DateTimeOffset observedUpdatedAt,
        DateTimeOffset freshUpdatedAt)
    {
        if (freshStatus != AttendanceStatus.Left)
        {
            return true;
        }

        if (!explicitRoomEntry)
        {
            return false;
        }

        return freshUpdatedAt == observedUpdatedAt;
    }
}
