/**
 * State-driven primary actions — unambiguous labels (no "Entrar").
 * Maps existing AssemblyStatus domain states.
 */
import { primaryCtaForStatus } from "./room-state.js";
import { assemblyLabel } from "./assembly-labels.js";

const STATUS_LABELS = {
  Draft: "Borrador",
  Scheduled: "Programada",
  CheckIn: "Presencia abierta",
  InProgress: "En curso",
  Paused: "En pausa",
  Completed: "Finalizada",
  Cancelled: "Cancelada"
};

/**
 * @returns {{
 *   key: string,
 *   label: string,
 *   description: string,
 *   href?: string,
 *   needsPost?: "start-checkin"|"start"|null
 * }}
 */
export function resolvePrimaryAction(assembly, { assemblyId } = {}) {
  const id = assemblyId || assembly?.id || assembly?.assemblyId;
  const status = String(assembly?.status || "Scheduled");
  const key = primaryCtaForStatus(status);

  switch (status) {
    case "Draft":
      return {
        key: "prepare",
        label: "Completar configuración",
        description: "Define agenda, documentos y participantes antes de programar.",
        href: `/calendar.html?assemblyId=${encodeURIComponent(id)}`,
        needsPost: null
      };
    case "Scheduled":
      return {
        key: "startCheckin",
        label: "Abrir mesa",
        description:
          "Abre la mesa para que los convocados puedan entrar y constituir quórum. No requiere estar admitido en la sala.",
        href: `/checkin.html?assemblyId=${encodeURIComponent(id)}`,
        needsPost: "start-checkin",
        secondary: {
          key: "prepareRoom",
          label: "Entrar a preparar sala",
          description: "Prueba cámara y micrófono sin registrar asistencia ni abrir la reunión.",
          href: `/lobby.html?assemblyId=${encodeURIComponent(id)}`,
          needsPost: null
        }
      };
    case "CheckIn":
      return {
        key: "startAssembly",
        label: "Iniciar asamblea",
        description: "Cuando el quórum esté validado, constituya la sesión en vivo.",
        href: `/lobby.html?assemblyId=${encodeURIComponent(id)}`,
        needsPost: "start",
        secondary: {
          key: "participants",
          label: "Ver participantes",
          description: "La mesa está abierta. Supervise convocados y quórum.",
          href: `/checkin.html?assemblyId=${encodeURIComponent(id)}`,
          needsPost: null
        }
      };
    case "InProgress":
    case "Paused":
      return {
        key: "continue",
        label: "Entrar a la sala",
        description: "Continúa la sesión en vivo de la asamblea.",
        href: `/lobby.html?assemblyId=${encodeURIComponent(id)}`,
        needsPost: null
      };
    case "Completed":
      return {
        key: "results",
        label: "Ver expediente",
        description: "Consulta el acta, resultados y evidencias en modo histórico.",
        href: `/dashboard.html?assemblyId=${encodeURIComponent(id)}&mode=historical`,
        needsPost: null
      };
    case "Cancelled":
      return {
        key: "results",
        label: "Ver detalles",
        description: "Consulta el expediente de la asamblea cancelada.",
        href: `/dashboard.html?assemblyId=${encodeURIComponent(id)}&mode=historical`,
        needsPost: null
      };
    default:
      return {
        key,
        label: "Ver asamblea",
        description: "",
        href: `/dashboard.html?assemblyId=${encodeURIComponent(id)}`,
        needsPost: null
      };
  }
}

/** Preparation and communication action. Does not replace the legal assembly status. */
export function preparationAction(assembly) {
  const id = assembly?.assemblyId || assembly?.id;
  const status = String(assembly?.convocationStatus || "");
  const base = `/preparar.html?assemblyId=${encodeURIComponent(id || "")}`;
  if (status === "Partial" || status === "Failed") {
    return { pending: true, label: "Revisar entregas", href: `/convocation.html?assemblyId=${encodeURIComponent(id || "")}` };
  }
  if (status === "Sent" || status === "Sending") {
    return { pending: false, label: "Ver convocatoria", href: `${base}&step=4` };
  }
  if (status === "Ready" || status === "Approved" || status === "Scheduled") {
    return { pending: true, label: "Revisar y enviar", href: `${base}&step=4` };
  }
  return { pending: true, label: "Continuar preparación", href: base };
}

export function statusLabelEs(status) {
  return STATUS_LABELS[status] || assemblyLabel(status);
}

/** Filter bucket for PH assemblies list. */
export function assemblyListBucket(status) {
  switch (status) {
    case "Draft":
    case "Scheduled":
      return "upcoming";
    case "CheckIn":
    case "InProgress":
    case "Paused":
      return "live";
    case "Completed":
      return "done";
    case "Cancelled":
      return "cancelled";
    default:
      return "upcoming";
  }
}
