namespace Asambleas.Application.Documents;

using System.Globalization;

/// <summary>Presentation mapping for human documents. Never mutates domain enums.</summary>
public static class DocumentLabels
{
    private static readonly CultureInfo EsPa = CultureInfo.GetCultureInfo("es-PA");

    public static string AssemblyStatus(string? status) => status switch
    {
        "Draft" => "Borrador",
        "Scheduled" => "Programada",
        "CheckIn" => "Mesa abierta / recepción",
        "InProgress" => "En curso",
        "Paused" => "Pausada",
        "Completed" => "Finalizada",
        "Cancelled" => "Cancelada",
        "Archived" => "Archivada",
        _ => "—"
    };

    public static string Modality(string? modality) => modality switch
    {
        "Virtual" or "VIRTUAL" => "Virtual",
        "InPerson" or "In-Person" or "Presencial" => "Presencial",
        "Hybrid" or "HYBRID" => "Híbrida",
        _ => "—"
    };

    public static string Role(string? role) => role switch
    {
        "Owner" => "Propietario",
        "PHAdmin" or "PhAdmin" => "Administrador del PH",
        "President" or "AssemblyPresident" => "Presidente",
        "Secretary" or "AssemblySecretary" => "Secretario",
        "Operator" or "AssemblyOperator" => "Operador",
        "Auditor" or "AssemblyAuditor" => "Auditor",
        "Board" or "BoardMember" => "Junta Directiva",
        "Proxy" or "Representative" => "Representante",
        _ => "Participante"
    };

    public static string AttendanceStatus(string? status) => status switch
    {
        "Invited" => "Invitado",
        "Registered" => "Registrado",
        "CheckedIn" => "Presente (check-in)",
        "Present" => "Presente",
        "TemporarilyDisconnected" => "Desconectado temporalmente",
        "Absent" => "Ausente",
        "Left" => "Salió",
        "Reingreso" => "Entró nuevamente",
        _ => string.IsNullOrWhiteSpace(status) ? "—" : "—"
    };

    /// <summary>Deprecated field label. Prefer presence status for live assemblies.</summary>
    public static string Accreditation(bool accredited) =>
        accredited ? "Histórico: acreditado" : "—";

    public static string PresenceLabel(string? attendanceStatus, bool legacyAccredited) =>
        attendanceStatus switch
        {
            "Present" or "CheckedIn" => "Presente",
            "TemporarilyDisconnected" => "Desconectado (breve)",
            "Left" => "Salió",
            "Reingreso" => "Entró nuevamente",
            "Registered" when legacyAccredited => "Histórico: acreditado (sin presencia)",
            "Registered" => "Convocado",
            _ => string.IsNullOrWhiteSpace(attendanceStatus) ? "—" : "—"
        };

    public static string RepresentationSource(string? source) => source switch
    {
        "Power" or "Proxy" => "Poder de representación",
        "Owner" or "Ownership" => "Titularidad / propietario",
        "Board" => "Junta Directiva",
        "Convocation" => "Convocatoria",
        _ => "—"
    };

    public static string QuorumStatus(string? status, bool? reached = null)
    {
        if (reached == true) return "QUÓRUM ALCANZADO";
        if (reached == false) return "QUÓRUM NO ALCANZADO";
        return status switch
        {
            "Reached" or "Met" => "QUÓRUM ALCANZADO",
            "NotReached" or "Below" => "QUÓRUM NO ALCANZADO",
            "TemporarilyDisconnected" => "Participantes desconectados temporalmente",
            _ => "—"
        };
    }

    /// <summary>
    /// Presence event on the quorum timeline. Operational codes are omitted.
    /// </summary>
    public static string QuorumPresenceEvent(string? reason)
    {
        if (string.IsNullOrWhiteSpace(reason)) return "";
        return reason.Trim() switch
        {
            "Present" or "CheckedIn" => "Presente",
            "Left" => "Salió",
            "Reingreso" => "Entró nuevamente",
            "TemporarilyDisconnected" => "Se desconectó",
            "Registered" or "Invited" => "Convocado",
            "NotReached" or "Reached" or "Met" or "NotMet" or "Below"
                or "AssemblyEnd" or "AssemblyStart" or "VotingOpen" or "VotingClose"
                or "ThresholdReached" or "ThresholdLost" => "",
            _ => ""
        };
    }

    public static string QuorumTimeline(string? status, string? reason)
    {
        var state = QuorumStatus(status);
        var presence = QuorumPresenceEvent(reason);
        if (string.IsNullOrWhiteSpace(presence) || state == "—") return string.IsNullOrWhiteSpace(presence) ? state : presence;
        return $"{state} · {presence}";
    }

    public static string DocumentLifecycle(string? assemblyStatus)
    {
        return assemblyStatus switch
        {
            "Completed" or "Archived" => "FINAL",
            "Cancelled" => "CANCELADO",
            "InProgress" or "Paused" or "CheckIn" => "DOCUMENTO EN CURSO",
            _ => "BORRADOR"
        };
    }

    public static bool IsDraftLifecycle(string? assemblyStatus) =>
        assemblyStatus is not ("Completed" or "Archived");

    public static string Coefficient(decimal value) =>
        string.Format(EsPa, "{0:0.00} %", value);

    public static string YesNo(bool value) => value ? "Sí" : "No";

    public static string VotingSessionStatus(string? status) => status switch
    {
        "Open" => "Abierta",
        "Closed" => "Cerrada",
        "Cancelled" => "Anulada",
        "Draft" => "Borrador",
        "Locked" => "Cerrada",
        _ => "—"
    };

    public static string DecisionStatus(string? status) => status switch
    {
        "Approved" or "Aprobado" => "Aprobada",
        "Rejected" or "Rechazado" => "Rechazada",
        "NoValidDecision" => "Sin decisión válida",
        "Tied" => "Empate",
        "Cancelled" => "Anulada",
        _ => "—"
    };
}
