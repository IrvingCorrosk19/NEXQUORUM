/**
 * Centralized contextual guidance for assembly room (and reusable elsewhere).
 * Pure resolve + DOM render. Driven by real client state — never invents success.
 */
import { escapeHtml } from "./ui.js";
import { hasPermission } from "./auth.js";
import { t } from "../i18n/i18n.js";

/**
 * @typedef {{
 *   id: string,
 *   severity: "info"|"success"|"warning"|"danger",
 *   title: string,
 *   explanation: string,
 *   steps?: string[],
 *   responsible: string,
 *   nextActionLabel?: string|null,
 *   actionId?: string|null,
 *   actionHref?: string|null,
 *   facts: { label: string, value: string, tone?: string }[]
 * }} GuideSnapshot
 */

function statusLabel(status) {
  const map = {
    Draft: "Borrador",
    Scheduled: "Programada",
    CheckIn: "Mesa de acreditación",
    InProgress: "En curso",
    Paused: "En receso",
    Completed: "Finalizada",
    Cancelled: "Cancelada"
  };
  return map[status] || status || "—";
}

function motionLabel(motion, session) {
  if (!motion) return "Sin pregunta activa";
  const open = session?.status === "Open" || session?.Status === "Open";
  if (open && (session?.motionId === motion.id || session?.MotionId === motion.id)) {
    return "Votación abierta";
  }
  if (motion.status === "Presented") return "Presentada — falta abrir votación";
  if (motion.status === "Draft") return "Borrador — falta presentar";
  if (motion.status === "Voting") return "En votación";
  if (motion.status === "Approved" || motion.status === "Rejected") return "Respondida";
  return motion.status || "—";
}

function quorumLabel(quorum) {
  if (!quorum) return "Sin cálculo aún";
  if (quorum.coefficientConfigurationInvalid) {
    return "Padrón inválido (coeficientes ≠ 100%)";
  }
  if (quorum.quorumReached) return "Quórum alcanzado";
  const cur = Number(quorum.currentCoefficient ?? 0).toFixed(2);
  const req = Number(quorum.requiredCoefficient ?? 0).toFixed(2);
  return `${cur}% / ${req}% requerido`;
}

function accreditationLabel(self, participants, operator) {
  if (operator) return "Personal de mesa (no vota como propietario)";
  if (!self && !participants?.length) return "Sin datos de acreditación";
  const me = self;
  if (me?.isAccredited) return "Acreditado";
  if (me?.attendanceStatus === "Registered") return "Inscrito — pendiente de acreditación";
  if (me) return me.attendanceStatus || "Sin acreditar";
  return "Verifique su acreditación con la mesa";
}

function connectionLabel(connection) {
  if (connection === "connected") return "Conectado";
  if (connection === "reconnecting") return "Reconectando…";
  if (connection === "disconnected") return "Desconectado";
  return "Verificando conexión…";
}

/**
 * @param {{
 *   role: "Operator"|"Owner"|"Auditor",
 *   user: object|null,
 *   assembly: object|null,
 *   motion: object|null,
 *   motions?: object[],
 *   session: object|null,
 *   quorum: object|null,
 *   self: object|null,
 *   participants?: object[],
 *   myVote?: object|null,
 *   myVoteStatus?: object|null,
 *   connection?: string,
 *   assemblyId: string,
 *   phId?: string|null
 * }} ctx
 * @returns {GuideSnapshot}
 */
export function resolveContextualGuide(ctx) {
  const operator = ctx.role === "Operator";
  const status = ctx.assembly?.status || "—";
  const sessionOpen = ctx.session?.status === "Open" || ctx.session?.Status === "Open";
  const sessionClosed = ctx.session?.status === "Closed" || ctx.session?.Status === "Closed";
  const motion = ctx.motion;
  const quorumInvalid = Boolean(ctx.quorum?.coefficientConfigurationInvalid);
  const canStart = hasPermission(ctx.user, "assembly:start");
  const canOpen = hasPermission(ctx.user, "vote:open");
  const canPresent = hasPermission(ctx.user, "motion:create") || hasPermission(ctx.user, "vote:open");
  const canManageAttendance = hasPermission(ctx.user, "attendance:manage");
  const voteStatus = String(ctx.myVoteStatus?.status || ctx.myVoteStatus?.Status || "").toUpperCase();
  const alreadyVoted = Boolean(ctx.myVote?.evidenceId) || voteStatus === "ALREADY_VOTED";

  const facts = [
    { label: "Asamblea", value: statusLabel(status) },
    { label: "Acreditación", value: accreditationLabel(ctx.self, ctx.participants, operator) },
    { label: "Quórum", value: quorumLabel(ctx.quorum), tone: quorumInvalid ? "danger" : undefined },
    { label: "Pregunta", value: motionLabel(motion, ctx.session) },
    {
      label: "Votación",
      value: sessionOpen ? "Abierta" : sessionClosed ? "Cerrada" : "No abierta"
    },
    { label: "Conexión", value: connectionLabel(ctx.connection) }
  ];

  const base = (partial) => ({
    severity: "info",
    steps: [],
    nextActionLabel: null,
    actionId: null,
    actionHref: null,
    facts,
    responsible: operator ? "Mesa (presidente/operador)" : "Usted / mesa",
    ...partial
  });

  if (ctx.connection === "disconnected") {
    return base({
      id: "connection-lost",
      severity: "danger",
      title: "Sin conexión en tiempo real",
      explanation:
        "Se perdió la conexión SignalR. La sala intentará reconectar. No cierre la pestaña; al recuperar, el estado se actualizará solo.",
      steps: ["Espere la reconexión automática", "Si persiste, recargue la página"],
      responsible: "Sistema / usted",
      nextActionLabel: "Reintentar ahora",
      actionId: "reload"
    });
  }

  if (ctx.connection === "reconnecting") {
    return base({
      id: "connection-reconnecting",
      severity: "warning",
      title: "Reconectando…",
      explanation: "Estamos restableciendo la conexión. Espere unos segundos; no vuelva a enviar votos hasta ver “Conectado”.",
      responsible: "Sistema"
    });
  }

  if (quorumInvalid && (status === "InProgress" || status === "CheckIn" || status === "Scheduled")) {
    const sum = ctx.quorum?.eligibleCoefficientTotal;
    const sumTxt = sum != null ? `${Number(sum).toFixed(2)}%` : "≠ 100%";
    return base({
      id: "coeff-invalid",
      severity: "danger",
      title: "No se puede avanzar: padrón de coeficientes inválido",
      explanation: `La suma de coeficientes del PH es ${sumTxt}. Debe corregirse a 100.00% antes de abrir votaciones (y, en muchos casos, antes de iniciar).`,
      steps: [
        "Abra el diagnóstico de unidades / coeficientes",
        "Corrija duplicados o coeficientes hasta sumar 100%",
        "Vuelva a la sala e intente de nuevo"
      ],
      responsible: "Administración del PH / mesa",
      nextActionLabel: "Ver diagnóstico del padrón",
      actionHref: `/api/assemblies/${ctx.assemblyId}/quorum/padron-diagnostic`,
      actionId: "padron-diagnostic"
    });
  }

  if (status === "Draft" || status === "Scheduled") {
    if (operator) {
      const drafts = (ctx.motions || []).filter((m) => m.status === "Draft" && m.designStatus !== "Archived");
      if (drafts.length && canStart) {
        return base({
          id: "draft-before-start",
          severity: "warning",
          title: "Pregunta guardada como borrador",
          explanation:
            "La asamblea todavía no ha sido iniciada. Para permitir que los participantes voten:",
          steps: ["Inicie la asamblea", "Presente la pregunta", "Abra la votación"],
          responsible: "Mesa (presidente)",
          nextActionLabel: "Iniciar asamblea",
          actionId: "start-assembly"
        });
      }
      return base({
        id: "prep-start-desk",
        severity: "info",
        title: status === "Draft" ? "Asamblea en borrador" : "Asamblea programada",
        explanation:
          "Todavía no hay mesa abierta ni asamblea en curso. Los participantes no pueden votar hasta que inicie el flujo oficial.",
        steps: canManageAttendance
          ? ["Abra la mesa de acreditación", "Acredite propietarios", "Inicie la asamblea", "Presente y abra cada votación"]
          : ["Pida a quien gestione acreditación abrir la mesa", "Cuando haya quórum/asistencia, inicie la asamblea"],
        responsible: "Mesa",
        nextActionLabel: canManageAttendance ? "Ir a acreditación" : canStart ? "Iniciar asamblea" : null,
        actionId: canManageAttendance ? "go-checkin" : canStart ? "start-assembly" : null,
        actionHref: canManageAttendance ? `/checkin.html?assemblyId=${ctx.assemblyId}` : null
      });
    }
    return base({
      id: "owner-waiting-scheduled",
      severity: "info",
      title: "Esperando a que la mesa prepare la asamblea",
      explanation:
        "Usted ya está en la sala, pero la asamblea aún no ha comenzado. No hay votación disponible todavía.",
      steps: ["Permanezca en la sala", "Espere el inicio anunciado por la mesa"],
      responsible: "Mesa (presidente)",
      nextActionLabel: null
    });
  }

  if (status === "CheckIn") {
    if (operator) {
      return base({
        id: "checkin-open",
        severity: "info",
        title: "Mesa de acreditación abierta",
        explanation:
          "Los propietarios deben acreditarse antes de votar. Cuando esté listo, inicie la asamblea y luego presente/abra cada pregunta.",
        steps: [
          "Acredite a los propietarios en la mesa",
          "Inicie la asamblea",
          "Presente la pregunta",
          "Abra la votación"
        ],
        responsible: "Mesa",
        nextActionLabel: canStart ? "Iniciar asamblea" : "Ir a acreditación",
        actionId: canStart ? "start-assembly" : "go-checkin",
        actionHref: canStart ? null : `/checkin.html?assemblyId=${ctx.assemblyId}`
      });
    }
    const accredited = Boolean(ctx.self?.isAccredited);
    return base({
      id: "owner-checkin",
      severity: accredited ? "success" : "warning",
      title: accredited ? "Ya está acreditado — espere el inicio" : "Participación pendiente de validación",
      explanation: accredited
        ? "Su acreditación está aprobada. La asamblea aún no ha iniciado. Cuando se inicie y abra una votación, podrá emitir su voto aquí."
        : "Su participación está pendiente de validación por la administración. No necesita realizar ninguna acción. Esta pantalla se actualizará automáticamente.",
      steps: accredited
        ? ["Espere a que la mesa inicie la asamblea"]
        : ["Espere la validación de la mesa"],
      responsible: "Mesa",
      nextActionLabel: null,
      actionId: null,
      actionHref: null
    });
  }

  if (status === "Paused") {
    return base({
      id: "paused",
      severity: "warning",
      title: "Asamblea en receso",
      explanation: operator
        ? "La asamblea está pausada. Reanude cuando desee continuar con presentaciones o votaciones."
        : "La mesa puso la asamblea en receso. Espere a que se reanude.",
      steps: operator ? ["Reanudar asamblea", "Continuar con la pregunta o votación"] : ["Espere en la sala"],
      responsible: "Mesa",
      nextActionLabel: operator && hasPermission(ctx.user, "assembly:manage") ? "Reanudar" : null,
      actionId: operator ? "resume-assembly" : null
    });
  }

  // InProgress
  if (sessionOpen) {
    if (operator) {
      return base({
        id: "voting-open-ops",
        severity: "success",
        title: "Votación abierta — recibiendo votos",
        explanation:
          "Los participantes acreditados y elegibles pueden votar ahora. Al terminar, cierre la votación para fijar el resultado.",
        steps: ["Supervise la participación", "Cierre la votación cuando corresponda"],
        responsible: "Participantes (voto) / Mesa (cierre)",
        nextActionLabel: hasPermission(ctx.user, "vote:close") ? "Cerrar votación" : null,
        actionId: "close-voting"
      });
    }
    if (alreadyVoted) {
      return base({
        id: "owner-voted",
        severity: "success",
        title: "Su voto ya fue registrado",
        explanation: "No necesita votar de nuevo. Espere el cierre de la votación o la siguiente pregunta.",
        responsible: "Mesa",
        nextActionLabel: null
      });
    }
    if (voteStatus === "NOT_ACCREDITED") {
      return base({
        id: "owner-not-accredited-live",
        severity: "danger",
        title: "Participación pendiente de validación",
        explanation:
          "Hay una votación abierta, pero su participación todavía está pendiente de validación administrativa. No necesita realizar ninguna acción; esta pantalla se actualizará automáticamente.",
        steps: ["Espere la acreditación de la mesa"],
        responsible: "Mesa",
        nextActionLabel: null,
        actionId: null,
        actionHref: null
      });
    }
    if (voteStatus === "NOT_ELIGIBLE" || voteStatus === "NOT_PARTICIPANT") {
      return base({
        id: "owner-not-eligible",
        severity: "warning",
        title: "No está habilitado para esta votación",
        explanation:
          "Puede estar en la sala, pero no figura como votante elegible de esta ronda (sin representación/coeficiente en el padrón de elegibles).",
        responsible: "Mesa",
        nextActionLabel: null
      });
    }
    return base({
      id: "owner-can-vote",
      severity: "success",
      title: "Puede votar ahora",
      explanation: "La mesa abrió la votación. Elija una opción y confirme. Solo se registra el voto tras confirmación del servidor.",
      steps: ["Revise la pregunta", "Elija una opción", "Confirme su voto"],
      responsible: "Usted",
      nextActionLabel: "Ir a votar",
      actionId: "focus-vote"
    });
  }

  // InProgress, no open session
  if (!motion) {
    if (operator) {
      const drafts = (ctx.motions || []).filter((m) => m.status === "Draft" && m.designStatus !== "Archived");
      if (drafts.length) {
        return base({
          id: "draft-exists",
          severity: "warning",
          title: "Hay preguntas en borrador",
          explanation:
            "Guardar una pregunta no abre la votación. Debe presentarla y luego abrir la votación para que los participantes puedan votar.",
          steps: ["Presente la pregunta", "Abra la votación"],
          responsible: "Mesa",
          nextActionLabel: canPresent ? "Presentar pregunta" : null,
          actionId: "present-motion"
        });
      }
      return base({
        id: "no-motion",
        severity: "info",
        title: "Asamblea en curso — sin pregunta activa",
        explanation: "Agregue o seleccione una pregunta, preséntela y abra la votación cuando desee que voten.",
        steps: ["Agregar / usar pregunta", "Presentar", "Abrir votación"],
        responsible: "Mesa",
        nextActionLabel: canPresent ? "Agregar pregunta" : null,
        actionId: "quick-question"
      });
    }
    return base({
      id: "owner-no-motion",
      severity: "info",
      title: "Todavía no hay votación abierta",
      explanation: "La asamblea está en curso. Cuando la mesa presente una pregunta y abra la votación, podrá votar aquí.",
      responsible: "Mesa",
      nextActionLabel: null
    });
  }

  if (motion.status === "Draft") {
    if (operator) {
      return base({
        id: "motion-draft",
        severity: "warning",
        title: "Pregunta guardada como borrador",
        explanation:
          "La pregunta aún no está presentada. Los participantes no pueden verla como votación activa ni votar.",
        steps: ["Presente la pregunta", "Abra la votación"],
        responsible: "Mesa",
        nextActionLabel: canPresent ? "Presentar pregunta" : null,
        actionId: "present-motion"
      });
    }
    return base({
      id: "owner-motion-draft",
      severity: "info",
      title: "La mesa está preparando la pregunta",
      explanation: "Aún no hay votación abierta. Espere a que presenten y abran la votación.",
      responsible: "Mesa"
    });
  }

  if (motion.status === "Presented" && !sessionOpen) {
    if (operator) {
      return base({
        id: "motion-presented",
        severity: "warning",
        title: "Pregunta presentada — falta abrir la votación",
        explanation:
          "Los participantes ya pueden ver la pregunta, pero todavía no pueden votar hasta que abra la sesión de votación.",
        steps: ["Abra la votación", "Espere los votos", "Cierre cuando corresponda"],
        responsible: "Mesa",
        nextActionLabel: canOpen ? "Abrir votación" : null,
        actionId: "open-voting"
      });
    }
    return base({
      id: "owner-presented-wait",
      severity: "info",
      title: "Pregunta presentada — esperando apertura",
      explanation: "La mesa presentó la pregunta. En cuanto abran la votación, aparecerá el formulario para votar.",
      responsible: "Mesa"
    });
  }

  if (sessionClosed) {
    return base({
      id: "voting-closed",
      severity: "info",
      title: "Votación cerrada",
      explanation: operator
        ? "Puede presentar otra pregunta o abrir una nueva votación cuando corresponda."
        : "Esta ronda terminó. Espere la siguiente pregunta o el cierre de la asamblea.",
      responsible: "Mesa",
      nextActionLabel: operator && canPresent ? "Siguiente pregunta" : null,
      actionId: operator ? "quick-question" : null
    });
  }

  return base({
    id: "default",
    severity: "info",
    title: "Sala lista",
    explanation: "Revise el estado abajo. Si un botón no aparece, es porque falta un requisito previo.",
    responsible: operator ? "Mesa" : "Mesa / usted"
  });
}

/**
 * Human explanation for API / domain codes (participant-safe).
 * @param {string} code
 * @param {string} [fallbackMessage]
 */
export function explainBlockCode(code, fallbackMessage = "") {
  const c = String(code || "").toUpperCase();
  const catalog = {
    MOTION_NOT_PRESENTED: {
      title: "La pregunta no está presentada",
      explanation: "Debe presentar la pregunta antes de abrir la votación.",
      next: "Presente la pregunta y luego abra la votación."
    },
    MOTION_INVALID: {
      title: "Estado de pregunta inválido",
      explanation: fallbackMessage || "La pregunta no está en un estado válido para esta operación.",
      next: "Revise si está en borrador; preséntela primero."
    },
    VOTING_NOT_OPEN: {
      title: "Sin votación abierta",
      explanation: "No existe una votación abierta en este momento.",
      next: "Espere a que la mesa abra la votación."
    },
    VOTING_CLOSED: {
      title: "Votación cerrada",
      explanation: "Esta votación ya fue cerrada.",
      next: "Espere la siguiente pregunta."
    },
    NOT_ACCREDITED: {
      title: "Participación pendiente de validación",
      explanation: "Su participación todavía está pendiente de validación administrativa.",
      next: "No necesita realizar ninguna acción. Esta pantalla se actualizará automáticamente."
    },
    NOT_ELIGIBLE: {
      title: "Sin derecho a voto",
      explanation: "No tiene derecho a voto para esta moción.",
      next: "Consulte a la mesa si cree que es un error."
    },
    ALREADY_VOTED: {
      title: "Voto registrado",
      explanation: "Su voto ya fue registrado.",
      next: "Espere el resultado o la siguiente pregunta."
    },
    COEFFICIENT_CONFIGURATION_INVALID: {
      title: "Padrón de coeficientes inválido",
      explanation:
        fallbackMessage ||
        "La suma de coeficientes del PH no es 100%. No se puede abrir la votación hasta corregirlo.",
      next: "Corrija el padrón (diagnóstico de unidades) y reintente."
    },
    ASSEMBLY_NOT_ACTIVE: {
      title: "La asamblea no está en curso",
      explanation: "Debe iniciar la asamblea antes de abrir votaciones.",
      next: "Inicie la asamblea y luego abra la votación."
    },
    OPEN_VOTING_EXISTS: {
      title: "Ya hay una votación abierta",
      explanation: "Cierre la votación actual antes de abrir otra.",
      next: "Cierre la votación abierta."
    }
  };
  return (
    catalog[c] || {
      title: "No se pudo completar la acción",
      explanation: fallbackMessage || "Revise el estado de la asamblea e intente de nuevo.",
      next: "Siga la guía “Estado y siguiente paso”."
    }
  );
}

/**
 * @param {HTMLElement|null} root
 * @param {GuideSnapshot} guide
 * @param {{ onAction?: (actionId: string, guide: GuideSnapshot) => void }} [opts]
 */
export function renderContextualGuide(root, guide, opts = {}) {
  if (!root || !guide) return;
  const tone = guide.severity || "info";
  const steps = (guide.steps || [])
    .map((s, i) => `<li><span class="cx-guide__step-n">${i + 1}</span> ${escapeHtml(s)}</li>`)
    .join("");
  const facts = (guide.facts || [])
    .map(
      (f) => `
      <div class="cx-guide__fact${f.tone ? ` is-${escapeHtml(f.tone)}` : ""}">
        <dt>${escapeHtml(f.label)}</dt>
        <dd>${escapeHtml(f.value)}</dd>
      </div>`
    )
    .join("");

  const hasAction = Boolean(guide.actionId || guide.actionHref);
  const actionHtml = hasAction
    ? guide.actionHref && !guide.actionId
      ? `<a class="btn btn-primary cx-guide__cta" href="${escapeHtml(guide.actionHref)}" target="_blank" rel="noopener">${escapeHtml(guide.nextActionLabel || "Continuar")}</a>`
      : `<button type="button" class="btn btn-primary cx-guide__cta" data-cx-action="${escapeHtml(guide.actionId || "")}">${escapeHtml(guide.nextActionLabel || "Continuar")}</button>`
    : "";

  root.hidden = false;
  root.className = `cx-guide cx-guide--${tone}${root.id === "contextual-guide-stage" ? " cx-guide-stage" : ""}`;
  root.setAttribute("role", "region");
  const titleId = `cx-guide-title-${root.id || "main"}`;
  root.setAttribute("aria-labelledby", titleId);
  root.innerHTML = `
    <header class="cx-guide__head">
      <p class="cx-guide__eyebrow">${escapeHtml(t("guide.eyebrow") || "Estado y siguiente paso")}</p>
      <h3 id="${titleId}" class="cx-guide__title">${escapeHtml(guide.title)}</h3>
    </header>
    <p class="cx-guide__explain">${escapeHtml(guide.explanation)}</p>
    ${steps ? `<ol class="cx-guide__steps">${steps}</ol>` : ""}
    <p class="cx-guide__who"><strong>${escapeHtml(t("guide.whoActs") || "Quién actúa")}:</strong> ${escapeHtml(guide.responsible)}</p>
    ${actionHtml}
    <details class="cx-guide__details">
      <summary>${escapeHtml(t("guide.details") || "Ver estado detallado")}</summary>
      <dl class="cx-guide__facts">${facts}</dl>
    </details>
  `;

  const btn = root.querySelector("[data-cx-action]");
  if (btn && opts.onAction) {
    btn.addEventListener("click", () => opts.onAction(btn.getAttribute("data-cx-action") || "", guide));
  }
}

export function hideContextualGuide(root) {
  if (!root) return;
  root.hidden = true;
  root.innerHTML = "";
}