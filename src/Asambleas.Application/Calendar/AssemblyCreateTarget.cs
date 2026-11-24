namespace Asambleas.Application.Calendar;

using Asambleas.Domain.Common;

/// <summary>
/// Chooses the PH that will own a new assembly.
/// An explicit destination is kept when the caller may schedule it.
/// An empty destination uses the active PH. A scoped user cannot
/// silently land on a different PH than the one they sent.
/// </summary>
public static class AssemblyCreateTarget
{
    public static Guid Resolve(Guid requestedPropertyHorizontalId, Guid? activePropertyHorizontalId, bool mayScheduleExplicitPh)
    {
        var active = activePropertyHorizontalId is Guid id && id != Guid.Empty ? id : Guid.Empty;
        if (requestedPropertyHorizontalId != Guid.Empty)
        {
            if (active != Guid.Empty
                && requestedPropertyHorizontalId != active
                && !mayScheduleExplicitPh)
            {
                throw new DomainException(
                    "PH_CONTEXT_MISMATCH",
                    "La asamblea debe crearse en el PH activo. Cambia de PH e inténtalo de nuevo.");
            }

            return requestedPropertyHorizontalId;
        }

        if (active == Guid.Empty)
        {
            throw new DomainException(
                "PH_REQUIRED",
                "Selecciona un PH para crear la asamblea.");
        }

        return active;
    }
}
