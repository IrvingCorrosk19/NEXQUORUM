namespace Asambleas.Application.Evidence;

/// <summary>
/// Document completeness is not the assembly lifecycle.
/// A closed assembly stays closed even when it has notes.
/// WARNING means the file is still being prepared.
/// </summary>
public static class EvidenceCompletenessRules
{
    public static string StatusLabel(bool isClosed, int noteCount, bool hasAttendance, bool hasAgenda, bool minutesSealed = false)
    {
        if (minutesSealed)
        {
            return "COMPLETE";
        }

        if (isClosed)
        {
            return "UNSEALED";
        }

        if (noteCount == 0)
        {
            return "WARNING";
        }

        return hasAttendance && hasAgenda ? "WARNING" : "INCOMPLETE";
    }
}
