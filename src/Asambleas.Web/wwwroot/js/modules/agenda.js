import { api } from "./api.js";
import { t } from "../i18n/i18n.js?v=labels-es1";
import { escapeHtml } from "./ui.js";

const FINISHED_MOTION = new Set(["Approved", "Rejected", "Cancelled", "NoValidDecision"]);

export async function setActiveAgendaItem(assemblyId, agendaItemId) {
  return api(`/api/assemblies/${assemblyId}/agenda/active`, {
    method: "POST",
    body: { agendaItemId }
  });
}

export async function completeActiveAgendaItem(assemblyId) {
  return api(`/api/assemblies/${assemblyId}/agenda/complete`, { method: "POST" });
}

/**
 * Agenda with FINALIZADO / ACTIVE / PENDING states.
 * A point is FINALIZADO only after the operator finishes it.
 */
export function renderAgenda(root, agenda, options = {}) {
  const { canManage, onActivate, onComplete, motions = [], votingOpen = false, compact = false } = options;
  if (!root) {
    return;
  }

  if (!agenda?.items?.length) {
    root.innerHTML = `<div class="empty-state panel-compact-empty">${escapeHtml(t("assembly.noAgenda") || "Sin ítems de agenda.")}</div>`;
    return;
  }

  const items = [...agenda.items].sort((a, b) => (a.ordinal ?? 0) - (b.ordinal ?? 0));
  const activeIndex = items.findIndex((item) => item.isActive || item.id === agenda.activeAgendaItemId);
  const progressLabel =
    activeIndex >= 0 ? `${String(activeIndex + 1).padStart(2, "0")} / ${String(items.length).padStart(2, "0")}` : `— / ${items.length}`;
  const active = items.find((item) => item.isActive) || (activeIndex >= 0 ? items[activeIndex] : null);
  const firstPending = items.find((item) => resolveAgendaState(item, active) === "pending");

  if (compact) {
    root.innerHTML = active
      ? `
        <div class="agenda-current">
          <p class="muted">${escapeHtml(t("assembly.currentItem") || "Punto actual")}</p>
          <p class="metric-number">${escapeHtml(progressLabel)}</p>
          <p><strong>${escapeHtml(active.code || "")}</strong> ${escapeHtml(active.title)}</p>
        </div>`
      : `<div class="empty-state panel-compact-empty">${escapeHtml(items.every((item) => isCompleted(item)) ? "Agenda finalizada" : (t("assembly.noAgenda") || "Sin punto activo."))}</div>`;
    return;
  }

  root.innerHTML = `
    <div class="agenda-progress muted">${escapeHtml(progressLabel)}</div>
    <ul class="agenda-list">
      ${items
        .map((item, index) => {
          const state = resolveAgendaState(item, active);
          const stateLabel =
            state === "done"
              ? "FINALIZADO"
              : state === "active"
                ? t("assembly.agendaActive") || "Activo"
                : t("assembly.agendaPending") || "Pendiente";
          const badgeClass =
            state === "done" ? "badge-success" : state === "active" ? "badge-live" : "badge-pending";
          const mark = state === "done" ? "✓" : state === "active" ? "●" : "";
          const block = state === "active" ? advanceBlock(item, motions, votingOpen) : null;

          return `
        <li class="${state === "active" ? "active" : ""}" data-state="${state}">
          <div class="agenda-row">
            <span class="agenda-mark" aria-hidden="true">${mark}</span>
            <div class="agenda-text">
              <strong>${escapeHtml(String(item.ordinal ?? index + 1).padStart(2, "0"))}</strong>
              ${escapeHtml(item.title)}
            </div>
            <span class="badge ${badgeClass}">${escapeHtml(stateLabel)}</span>
          </div>
          ${
            canManage && state === "active"
              ? `<button type="button" class="btn btn-secondary" data-complete="1" ${block.blocked ? "disabled" : ""}>Finalizar punto</button>
                 ${block.blocked ? `<p class="muted agenda-finish-hint" style="margin:0.35rem 0 0">Hay preguntas o votaciones pendientes en este punto.</p>` : ""}`
              : ""
          }
          ${
            canManage && !active && firstPending && item.id === firstPending.id
              ? `<button type="button" class="btn btn-secondary" data-activate="${item.id}">Activar punto</button>`
              : ""
          }
        </li>`;
        })
        .join("")}
    </ul>
  `;

  root.querySelector("[data-complete]")?.addEventListener("click", () => onComplete?.());
  root.querySelectorAll("[data-activate]").forEach((btn) => {
    btn.addEventListener("click", () => onActivate?.(btn.getAttribute("data-activate")));
  });
}

function isCompleted(item) {
  return Boolean(item?.isCompleted || item?.completedAtUtc || item?.status === "Done" || item?.isDone);
}

function resolveAgendaState(item, active) {
  if (item.isActive || (active && item.id === active.id)) {
    return "active";
  }
  if (isCompleted(item)) {
    return "done";
  }
  return "pending";
}

function advanceBlock(item, motions, votingOpen) {
  const pending = (motions || []).some((motion) => motionBelongsToItem(motion, item) && isPendingMotion(motion));
  if (votingOpen || pending) {
    return {
      blocked: true,
      reason: "Hay preguntas o votaciones pendientes en este punto."
    };
  }
  return { blocked: false, reason: "" };
}

function motionBelongsToItem(motion, item) {
  const agendaId = String(motion?.agendaItemId || motion?.AgendaItemId || "");
  return agendaId && agendaId === String(item?.id || "");
}

function isPendingMotion(motion) {
  const design = motion?.designStatus || motion?.DesignStatus || "";
  if (design === "Archived") return false;
  const status = String(motion?.status || motion?.Status || "");
  return !FINISHED_MOTION.has(status);
}
