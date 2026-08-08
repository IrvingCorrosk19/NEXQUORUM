import { t } from "../i18n/i18n.js";
import { escapeHtml } from "./ui.js";

const lastValues = new WeakMap();

/**
 * Quorum visualization: current %, required %, reached status.
 * Subtle numeric transition when coefficient changes (respects reduced motion).
 */
export function renderQuorum(root, quorum, { compact = false } = {}) {
  if (!root) {
    return;
  }

  if (!quorum) {
    root.innerHTML = `<div class="skeleton" style="height:2.5rem"></div>`;
    return;
  }

  const current = Number(quorum.currentCoefficient ?? 0);
  const required = Number(quorum.requiredCoefficient ?? 0);
  const pctOfRequired = required > 0 ? Math.min(100, Math.round((current / required) * 100)) : 0;
  const trackPct = required > 0 ? Math.min(100, (current / required) * 100) : 0;
  const reached = Boolean(quorum.quorumReached);
  const prev = lastValues.get(root);
  const crossed =
    prev != null && !prev.reached && reached && Number.isFinite(prev.current);
  lastValues.set(root, { current, reached });

  const currentLabel = formatPct(current);
  const requiredLabel = formatPct(required);
  const statusBadge = `
    <span class="badge ${reached ? "badge-live" : "badge-warn"}">
      ${escapeHtml(reached ? t("quorum.reached") : t("quorum.notReached"))}
    </span>`;

  if (compact) {
    root.innerHTML = `
      ${statusBadge}
      <span class="quorum-meter-values">
        <strong class="metric-number" data-quorum-current>${currentLabel}</strong>
        <span> / ${requiredLabel}</span>
      </span>
    `;
    animateIfNeeded(root.querySelector("[data-quorum-current]"), prev?.current, current);
    return;
  }

  root.innerHTML = `
    <div class="quorum-meter ${crossed ? "quorum-just-reached" : ""}" role="group"
      aria-label="${escapeHtml(t("quorum.progress"))}">
      <div class="quorum-meter-header">
        ${statusBadge}
        <span class="quorum-meter-values">
          <strong class="metric-number" data-quorum-current>${currentLabel}</strong>
          <span class="quorum-required"> ${escapeHtml(t("quorum.required"))} ${requiredLabel}</span>
        </span>
      </div>
      <div class="quorum-meter-track" aria-hidden="true">
        <div class="quorum-meter-fill ${reached ? "reached" : ""}" style="width:${trackPct}%"></div>
      </div>
      <meter class="sr-only" min="0" max="${Math.max(required, 100)}" value="${current}">
        ${currentLabel} / ${requiredLabel}
      </meter>
      ${
        quorum.presentUnits != null
          ? `<p class="muted quorum-units">${quorum.presentUnits}${
              quorum.eligibleUnits != null ? ` / ${quorum.eligibleUnits}` : ""
            }</p>`
          : ""
      }
    </div>
  `;

  animateIfNeeded(root.querySelector("[data-quorum-current]"), prev?.current, current);
  void pctOfRequired;
}

function formatPct(n) {
  return `${Number(n).toFixed(2)}%`;
}

function animateIfNeeded(el, from, to) {
  if (!el || from == null || from === to) return;
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  if (reduce) {
    el.textContent = formatPct(to);
    return;
  }
  const start = performance.now();
  const duration = 420;
  const tick = (now) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - (1 - t) * (1 - t);
    const value = from + (to - from) * eased;
    el.textContent = formatPct(value);
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
