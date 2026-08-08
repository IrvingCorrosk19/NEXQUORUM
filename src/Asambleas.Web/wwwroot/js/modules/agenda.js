import { api } from "./api.js";
import { t } from "../i18n/i18n.js";
import { escapeHtml } from "./ui.js";

export async function setActiveAgendaItem(assemblyId, agendaItemId) {
  return api(`/api/assemblies/${assemblyId}/agenda/active`, {
    method: "POST",
    body: { agendaItemId }
  });
}

/**
 * Agenda with DONE / ACTIVE / PENDING visual states.
 * Items before the active one (by ordinal) are treated as DONE when isDone not provided.
 */
export function renderAgenda(root, agenda, { canManage, onActivate, compact = false } = {}) {
  if (!root) {
    return;
  }

  if (!agenda?.items?.length) {
    root.innerHTML = `<div class="empty-state panel-compact-empty">${escapeHtml(t("assembly.noAgenda"))}</div>`;
    return;
  }

  const items = [...agenda.items].sort((a, b) => (a.ordinal ?? 0) - (b.ordinal ?? 0));
  const activeIndex = items.findIndex((item) => item.isActive || item.id === agenda.activeAgendaItemId);
  const progressLabel =
    activeIndex >= 0 ? `${String(activeIndex + 1).padStart(2, "0")} / ${String(items.length).padStart(2, "0")}` : `— / ${items.length}`;

  if (compact) {
    const active = items.find((i) => i.isActive) || (activeIndex >= 0 ? items[activeIndex] : null);
    root.innerHTML = active
      ? `
        <div class="agenda-current">
          <p class="muted">${escapeHtml(t("assembly.currentItem"))}</p>
          <p class="metric-number">${escapeHtml(progressLabel)}</p>
          <p><strong>${escapeHtml(active.code || "")}</strong> ${escapeHtml(active.title)}</p>
        </div>`
      : `<div class="empty-state panel-compact-empty">${escapeHtml(t("loading"))}</div>`;
    return;
  }

  root.innerHTML = `
    <div class="agenda-progress muted">${escapeHtml(progressLabel)}</div>
    <ul class="agenda-list">
      ${items
        .map((item, index) => {
          const state = resolveAgendaState(item, index, activeIndex);
          const stateLabel =
            state === "done"
              ? t("assembly.agendaDone")
              : state === "active"
                ? t("assembly.agendaActive")
                : t("assembly.agendaPending");
          const badgeClass =
            state === "done" ? "badge-success" : state === "active" ? "badge-live" : "badge-pending";
          const mark = state === "done" ? "✓" : state === "active" ? "●" : "";

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
            canManage && state === "pending"
              ? `<button type="button" class="btn btn-secondary" data-activate="${item.id}">${escapeHtml(t("assembly.nextItem"))}</button>`
              : ""
          }
        </li>`;
        })
        .join("")}
    </ul>
  `;

  root.querySelectorAll("[data-activate]").forEach((btn) => {
    btn.addEventListener("click", () => onActivate?.(btn.getAttribute("data-activate")));
  });
}

function resolveAgendaState(item, index, activeIndex) {
  if (item.status === "Done" || item.isDone) {
    return "done";
  }
  if (item.isActive || (activeIndex >= 0 && index === activeIndex)) {
    return "active";
  }
  if (activeIndex >= 0 && index < activeIndex) {
    return "done";
  }
  return "pending";
}
