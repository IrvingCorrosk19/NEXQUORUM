/**
 * Renders assembly readiness checklist + next action from server DTO.
 */
import { escapeHtml } from "./ui.js";
import { resolveDestination } from "./return-context.js";
import { resolvePrimaryAction } from "./ia-actions.js";
import { hasPermission } from "./auth.js";
import { isOperator } from "./roles.js";

function statusMeta(check) {
  if (check.status === "Ready") {
    return { icon: "✓", label: "Listo", cls: "is-ready", aria: "Completo" };
  }
  if (check.severity === "Warning" || check.status === "Optional") {
    return { icon: "○", label: "Recomendado", cls: "is-optional", aria: "Recomendado" };
  }
  return { icon: "⚠", label: "Requiere atención", cls: "is-attention", aria: "Requiere atención" };
}

/**
 * @param {HTMLElement} panel
 * @param {object|null} readiness
 * @param {{ assemblyId: string, phId?: string|null }} ctx
 */
export function renderReadinessPanel(panel, readiness, ctx) {
  if (!readiness) {
    panel.innerHTML = `<div class="empty-state">La lista de preparación no está disponible todavía.</div>`;
    return;
  }

  const checks = readiness.checks || [];
  const completed = readiness.completedChecks ?? checks.filter((c) => c.status === "Ready").length;
  const total = readiness.totalChecks ?? checks.length;
  const blockingOpen = readiness.blockingOpenCount ?? 0;
  const overall = readiness.overallStatus || (readiness.readyToStart ? "Ready" : "Blocking");

  const progressHtml =
    total > 0
      ? `<p class="readiness-progress" role="status">${completed} de ${total} requisitos completados</p>`
      : "";

  const rowsHtml = checks
    .map((check) => {
      const meta = statusMeta(check);
      const canNavigate = Boolean(check.canAct && check.destinationKey && check.status !== "Ready");
      const href = canNavigate ? resolveDestination(check.destinationKey, ctx) : null;
      const tag = canNavigate ? "a" : "div";
      const attrs = canNavigate
        ? `href="${href}" class="readiness-card ${meta.cls} is-actionable" role="listitem"`
        : `class="readiness-card ${meta.cls}" role="listitem"`;
      const actionBtn =
        canNavigate && check.actionLabel
          ? `<span class="readiness-card__action">${escapeHtml(check.actionLabel)} →</span>`
          : "";

      return `
      <${tag} ${attrs} ${canNavigate ? 'tabindex="0"' : ""} aria-label="${escapeHtml(check.title)}: ${meta.aria}">
        <div class="readiness-card__head">
          <span class="readiness-card__icon" aria-hidden="true">${meta.icon}</span>
          <div class="readiness-card__titles">
            <strong>${escapeHtml(check.title)}</strong>
            <span class="readiness-card__status">${escapeHtml(meta.label)}</span>
          </div>
        </div>
        <p class="readiness-card__desc">${escapeHtml(check.description || "")}</p>
        ${check.detail ? `<p class="readiness-card__detail muted">${escapeHtml(String(check.detail))}</p>` : ""}
        ${actionBtn}
      </${tag}>`;
    })
    .join("");

  const summary =
    overall === "Ready"
      ? `<div class="readiness-summary ready" role="status">✓ Preparación completa — requisitos obligatorios listos</div>`
      : blockingOpen > 0
        ? `<div class="readiness-summary blocked" role="status">⚠ ${blockingOpen} requisito(s) obligatorio(s) pendiente(s)</div>`
        : `<div class="readiness-summary warning" role="status">Preparación usable — revise recomendaciones opcionales</div>`;

  panel.innerHTML = `
    ${progressHtml}
    <div class="readiness-cards" role="list" aria-labelledby="readiness-heading">${rowsHtml}</div>
    ${summary}
  `;
}

/**
 * @param {HTMLElement} host
 * @param {object|null} readiness
 * @param {object} assembly
 * @param {{ assemblyId: string, operator?: boolean }} ctx
 * @param {(action: object) => void} onRun
 */
export function renderNextAction(host, readiness, assembly, ctx, onRun) {
  const next = readiness?.nextAction;
  const allBlockingDone = Boolean(readiness?.readyToStart);

  if (allBlockingDone) {
    const action = resolvePrimaryAction(assembly, ctx);
    host.innerHTML = `
      <div class="ia-primary-action ia-primary-action--ready">
        <h3 class="ia-primary-action__title">Asamblea preparada</h3>
        <p class="ia-primary-action__desc">Todos los requisitos obligatorios están completos.</p>
        <div class="cta-row">
          <button type="button" class="btn btn-primary" data-primary="1">${escapeHtml(action.label)}</button>
        </div>
      </div>`;
    host.querySelector("[data-primary]")?.addEventListener("click", () => onRun(action));
    return;
  }

  if (next?.canAct && next.destinationKey) {
    const href = resolveDestination(next.destinationKey, {
      assemblyId: ctx.assemblyId,
      phId: assembly.propertyHorizontalId
    });
    host.innerHTML = `
      <div class="ia-primary-action">
        <h3 class="ia-primary-action__title">Siguiente paso</h3>
        <p class="ia-primary-action__desc">${escapeHtml(next.description || next.title || "")}</p>
        <div class="cta-row">
          <a class="btn btn-primary" href="${href}">${escapeHtml(next.actionLabel || "Completar")} →</a>
        </div>
      </div>`;
    return;
  }

  if (next) {
    host.innerHTML = `
      <div class="ia-primary-action">
        <h3 class="ia-primary-action__title">Siguiente paso</h3>
        <p class="ia-primary-action__desc">${escapeHtml(next.description || next.title || "")}</p>
        <p class="muted">No tiene permiso para completar este paso. Contacte al administrador de la propiedad.</p>
      </div>`;
    return;
  }

  host.innerHTML = `<p class="muted">Revise la preparación de la asamblea.</p>`;
}

/**
 * @param {HTMLElement} host
 * @param {object} user
 * @param {string} assemblyId
 */
export function renderWorkspaceGroups(host, user, assemblyId) {
  const canComms = hasPermission(user, "communications:view");
  const canVote = hasPermission(user, "motion:create") || hasPermission(user, "vote:open");
  const canExp = hasPermission(user, "expediente:view");
  const canAudit = hasPermission(user, "audit:view");
  const op = isOperator(user);
  const q = `assemblyId=${encodeURIComponent(assemblyId)}`;

  const group = (title, links) =>
    links.length
      ? `<div class="workspace-group"><h3 class="workspace-group__title">${escapeHtml(title)}</h3><div class="cta-row">${links.join("")}</div></div>`
      : "";

  const link = (href, label, target = "") =>
    `<a class="btn btn-secondary" href="${href}"${target ? ` target="${target}" rel="noopener"` : ""}>${escapeHtml(label)}</a>`;

  host.innerHTML = [
    group("Preparación", [
      link(`/agenda.html?${q}`, "Agenda"),
      canComms ? link(`/convocation.html?${q}`, "Convocatoria") : "",
      link(`/checkin.html?${q}`, "Participantes"),
      canVote ? link(`/voting-studio.html?${q}`, "Votaciones") : "",
      canComms ? link(`/convocation.html?${q}`, "Documentos") : ""
    ].filter(Boolean)),
    group("Durante asamblea", [
      link(`/checkin.html?${q}`, "Acreditación"),
      link(`/lobby.html?${q}`, "Sala"),
      op ? link(`/projector.html?${q}`, "Proyector", "_blank") : ""
    ].filter(Boolean)),
    group("Después", [
      link(`/minutes.html?${q}`, "Acta"),
      canAudit ? link(`/evidence.html?${q}`, "Evidencias") : "",
      canExp ? link(`/expediente.html?${q}`, "Expediente") : ""
    ].filter(Boolean))
  ].join("");
}
