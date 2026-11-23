namespace Asambleas.Application.Attendance;

/// <summary>
/// Distinct units of convocated owners. A unit shared by two holders counts once.
/// </summary>
public static class ConvokedUnitRoster
{
    public static IReadOnlyList<string> DistinctCodes(IEnumerable<IEnumerable<string?>?> groups)
    {
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var ordered = new List<string>();
        foreach (var group in groups)
        {
            if (group is null)
            {
                continue;
            }

            foreach (var code in group)
            {
                var trimmed = code?.Trim();
                if (string.IsNullOrEmpty(trimmed))
                {
                    continue;
                }

                if (seen.Add(trimmed))
                {
                    ordered.Add(trimmed);
                }
            }
        }

        return ordered;
    }
}
