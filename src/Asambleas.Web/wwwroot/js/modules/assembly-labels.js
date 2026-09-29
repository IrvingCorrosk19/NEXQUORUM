/**
 * Visible Spanish labels for assembly enums and audit codes.
 * Internal values stay on the wire; only the screen text changes.
 */

const LABELS = {
  Present: "Presente",
  Left: "Salió",
  Reingreso: "Entró nuevamente",
  TemporarilyDisconnected: "Desconectado",
  CheckedIn: "Presente",
  Registered: "Convocado",
  Invited: "Invitado",
  Absent: "Ausente",
  NotReached: "Sin quórum",
  Reached: "Quórum alcanzado",
  Met: "Quórum alcanzado",
  NotMet: "Sin quórum",
  Below: "Sin quórum",
  Draft: "Borrador",
  Scheduled: "Programada",
  CheckIn: "Presencia",
  InProgress: "En curso",
  Paused: "Pausada",
  Completed: "Finalizada",
  Cancelled: "Cancelada",
  Archived: "Archivada",
  Presented: "Presentada",
  Voting: "En votación",
  Approved: "Aprobada",
  Rejected: "Rechazada",
  NoValidDecision: "Sin decisión válida",
  Open: "Abierta",
  Closed: "Cerrada",
  Locked: "Cerrada",
  Tied: "Empate",
  Published: "Publicada",
  Ready: "Lista",
  Pending: "Pendiente",
  Active: "Activo",
  Inactive: "Inactivo",
  Suspended: "Suspendido",
  Sending: "Enviando",
  Partial: "Parcial",
  Queued: "En cola",
  Delivered: "Entregada",
  Bounced: "Rebotada",
  NotSent: "No enviada",
  Processing: "Procesando",
  Failed: "Fallida",
  Recording: "Grabando",
  Requested: "En espera",
  Granted: "En uso de la palabra",
  Skipped: "Omitida",
  Virtual: "Virtual",
  InPerson: "Presencial",
  Hybrid: "Híbrida",
  Owner: "Propietario",
  President: "Presidente",
  Secretary: "Secretario",
  Operator: "Operador",
  Administrator: "Administrador",
  Observer: "Observador",
  Board: "Junta directiva",
  Power: "Poder",
  Proxy: "Poder",
  Convocation: "Convocatoria",
  Ownership: "Titularidad",
  COMPLETE: "Completo",
  INCOMPLETE: "Incompleto",
  PARTIAL: "Parcial",
  LIVE: "En vivo",
  READY: "Lista",
  DRAFT: "Borrador",
  COMPLETED: "Finalizada",
  CANCELLED: "Cancelada",
  RESCHEDULED: "Reprogramada",
  SCHEDULED: "Programada",
  CONVOKED: "Convocada",
  CONVOCATION_PENDING: "Convocatoria pendiente",
  Sent: "Enviada",
  AssemblyStart: "Inicio de la asamblea",
  AssemblyEnd: "Cierre de la asamblea",
  VotingOpen: "Apertura de votación",
  VotingClose: "Cierre de votación",
  ThresholdReached: "Quórum alcanzado",
  ThresholdLost: "Quórum perdido"
};

const HIDDEN_PRESENCE_REASONS = new Set([
  "NotReached",
  "Reached",
  "Met",
  "NotMet",
  "Below",
  "AssemblyEnd",
  "AssemblyStart",
  "VotingOpen",
  "VotingClose",
  "ThresholdReached",
  "ThresholdLost"
]);

const AUDIT = {
  LOGIN: "Inicio de sesión",
  ASSEMBLY_JOIN: "Ingreso a la asamblea",
  CHECK_IN: "Presencia",
  PARTICIPANT_ACCREDITED: "Participante acreditado",
  PARTICIPANT_DEACCREDITED: "Acreditación retirada",
  PARTICIPANT_REJECTED: "Participante rechazado",
  PARTICIPANT_LEFT: "Salió",
  PARTICIPANT_RETURNED: "Entró nuevamente",
  PARTICIPANT_CONNECTED: "Se conectó",
  PARTICIPANT_DISCONNECTED: "Se desconectó",
  PARTICIPANT_JOIN_SUMMONED: "Llamado a la sala",
  QUORUM_REACHED: "Quórum alcanzado",
  QUORUM_LOST: "Quórum perdido",
  QUORUM_CHANGED: "Quórum actualizado",
  ASSEMBLY_STARTED: "Asamblea iniciada",
  ASSEMBLY_PAUSED: "Asamblea pausada",
  ASSEMBLY_RESUMED: "Asamblea reanudada",
  ASSEMBLY_COMPLETED: "Asamblea finalizada",
  ASSEMBLY_CREATED: "Asamblea creada",
  ASSEMBLY_SCHEDULED: "Asamblea programada",
  ASSEMBLY_UPDATED: "Asamblea actualizada",
  ASSEMBLY_RESCHEDULED: "Asamblea reprogramada",
  ASSEMBLY_CANCELLED: "Asamblea cancelada",
  AGENDA_CHANGED: "Agenda actualizada",
  MOTION_PRESENTED: "Moción presentada",
  MOTION_CREATED: "Moción creada",
  MOTION_UPDATED: "Moción actualizada",
  MOTION_PUBLISHED: "Moción publicada",
  MOTION_ARCHIVED: "Moción archivada",
  VOTING_OPENED: "Votación abierta",
  VOTING_CLOSED: "Votación cerrada",
  VOTE_CAST: "Voto emitido",
  VOTE_ACCEPTED: "Voto aceptado",
  RESULT_CALCULATED: "Resultado calculado",
  DECISION_CREATED: "Decisión registrada",
  VOTING_CANCELLED: "Votación anulada",
  RECORDING_STARTED: "Grabación iniciada",
  RECORDING_STOPPED: "Grabación detenida",
  RECORDING_READY: "Grabación lista",
  RECORDING_FAILED: "Grabación fallida",
  EVIDENCE_PACKAGE_GENERATED: "Paquete de evidencias generado",
  EVIDENCE_PACKAGE_DOWNLOADED: "Paquete de evidencias descargado"
};

function looksInternal(value) {
  if (!value || value.includes(" ")) return false;
  if (value.includes(".") || value.includes("_")) return true;
  if (/^[A-Z0-9]+$/.test(value) && value.length > 2) return true;
  return /[a-z]/.test(value) && /[A-Z]/.test(value);
}

export function assemblyLabel(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "—";
  if (Object.prototype.hasOwnProperty.call(LABELS, raw)) return LABELS[raw];
  if (Object.prototype.hasOwnProperty.call(AUDIT, raw)) return AUDIT[raw];
  if (looksInternal(raw)) return "—";
  return raw;
}

export function quorumStatusLabel(status) {
  const raw = String(status ?? "").trim();
  if (!raw) return "";
  if (raw === "Reached" || raw === "Met") return "Quórum alcanzado";
  if (raw === "NotReached" || raw === "NotMet" || raw === "Below") return "Sin quórum";
  return assemblyLabel(raw);
}

/** Presence wording for the quorum timeline. Operational codes stay off this line. */
export function quorumPresenceLabel(reason) {
  const raw = String(reason ?? "").trim();
  if (!raw || HIDDEN_PRESENCE_REASONS.has(raw)) return "";
  if (raw === "Present" || raw === "CheckedIn") return "Presente";
  if (raw === "Left") return "Salió";
  if (raw === "Reingreso") return "Entró nuevamente";
  if (raw === "TemporarilyDisconnected") return "Se desconectó";
  if (raw === "Registered" || raw === "Invited") return "Convocado";
  if (looksInternal(raw)) return "";
  return raw;
}

export function quorumTimelineText(status, reason) {
  return [quorumStatusLabel(status), quorumPresenceLabel(reason)].filter(Boolean).join(" · ");
}
