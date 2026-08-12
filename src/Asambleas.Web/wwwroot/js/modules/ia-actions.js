/**
 * State-driven primary actions — unambiguous labels (no "Entrar").
 * Maps existing AssemblyStatus domain states.
 */
import { primaryCtaForStatus } from "./room-state.js";

const STATUS_LABELS = {
  Draft: "Borrador",
  Scheduled: "Programada",
  CheckIn: "Acreditación abierta",
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
        label: "Abrir acreditación",
        description:
          "Permite registrar y validar a los participantes antes de constituir formalmente la asamblea.",
        href: `/checkin.html?assemblyId=${encodeURIComponent(id)}`,
        needsPost: "start-checkin"
      };
    case "CheckIn":
      return {
        key: "start",
        label: "Ir a acreditación",
        description: "La ventana de acreditación está abierta. Valida asistencia y quórum.",
        href: `/checkin.html?assemblyId=${encodeURIComponent(id)}`,
        needsPost: null,
        secondary: {
          key: "startAssembly",
          label: "Iniciar asamblea",
          description: "Cuando el quórum esté validado, constituya la sesión en vivo.",
          href: `/lobby.html?assemblyId=${encodeURIComponent(id)}`,
          needsPost: "start"
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
        label: "Ver acta",
        description: "Revisa el acta y los resultados de la asamblea.",
        href: `/minutes.html?assemblyId=${encodeURIComponent(id)}`,
        needsPost: null
      };
    case "Cancelled":
      return {
        key: "results",
        label: "Ver expediente",
        description: "Consulta el expediente de la asamblea cancelada.",
        href: `/expediente.html?assemblyId=${encodeURIComponent(id)}`,
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

export function statusLabelEs(status) {
  return STATUS_LABELS[status] || status || "—";
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
