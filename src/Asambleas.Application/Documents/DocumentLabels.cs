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
        "CheckIn" => "En acreditación",
        "InProgress" => "En curso",
        "Paused" => "Pausada",
        "Completed" => "Finalizada",
        "Cancelled" => "Cancelada",
        "Archived" => "Archivada",
        _ => string.IsNullOrWhiteSpace(status) ? "—" : status
    };

    public static string Modality(string? modality) => modality switch
    {
        "Virtual" or "VIRTUAL" => "Virtual",
        "InPerson" or "In-Person" or "Presencial" => "Presencial",
        "Hybrid" or "HYBRID" => "Híbrida",
        _ => string.IsNullOrWhiteSpace(modality) ? "—" : modality
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
        _ => string.IsNullOrWhiteSpace(role) ? "Participante" : role
    };

    public static string AttendanceStatus(string? status) => status switch
    {
        "Invited" => "Invitado",
        "Registered" => "Registrado",
        "CheckedIn" => "Presente (check-in)",
        "Present" => "Presente",
        "TemporarilyDisconnected" => "Desconectado temporalmente",
        "Absent" => "Ausente",
        "Left" => "Se retiró",
        _ => string.IsNullOrWhiteSpace(status) ? "—" : status
    };

    public static string Accreditation(bool accredited) => accredited ? "Acreditado" : "No acreditado";

    public static string RepresentationSource(string? source) => source switch
    {
        "Power" or "Proxy" => "Poder de representación",
        "Owner" or "Ownership" => "Titularidad / propietario",
        "Board" => "Junta Directiva",
        _ => string.IsNullOrWhiteSpace(source) ? "—" : source
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
            _ => string.IsNullOrWhiteSpace(status) ? "—" : status
        };
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
        _ => string.IsNullOrWhiteSpace(status) ? "—" : status
    };

    public static string DecisionStatus(string? status) => status switch
    {
        "Approved" or "Aprobado" => "Aprobada",
        "Rejected" or "Rechazado" => "Rechazada",
        "Tied" => "Empate",
        "Cancelled" => "Anulada",
        _ => string.IsNullOrWhiteSpace(status) ? "—" : status
    };
}
