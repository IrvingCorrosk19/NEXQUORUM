namespace Asambleas.Application.Evidence;

using Asambleas.Contracts.Assemblies;
using Asambleas.Contracts.Evidence;
using Asambleas.Domain.Enums;

/// <summary>
/// A present owner's own unit is not an absent holding.
/// A power stays, even when its unit code also appears on someone who is present.
/// An ownership stays when that representative is not among the people present.
/// </summary>
public static class AbsentHolderRules
{
    public static IReadOnlyList<RepresentationEvidenceDto> Select(
        IReadOnlyList<AssemblyParticipantDto> present,
        IReadOnlyList<RepresentationEvidenceDto> representations)
    {
        var presentUsers = present.Select(p => p.UserId).ToHashSet();
        return representations
            .Where(row =>
            {
                var proxy = string.Equals(row.Source, nameof(RepresentationSource.Power), StringComparison.OrdinalIgnoreCase)
                    || row.PowerId is not null;
                if (proxy)
                {
                    return true;
                }

                return !presentUsers.Contains(row.RepresentativeUserId);
            })
            .ToList();
    }
}
