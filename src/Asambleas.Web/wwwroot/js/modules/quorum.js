import { t } from "../i18n/i18n.js";
import { escapeHtml } from "./ui.js";

const lastValues = new WeakMap();

/**
 * Quorum visualization: current / required coefficient points of the PH.
 * Values are coefficient percent-points (Σ units ≈ 100), NOT a progress bar percent.
 * When EligibleCoefficientTotal ≠ 100, surfaces CoefficientConfigurationInvalid.
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
  const requiredPct = Number(quorum.requiredPercent ?? 0);
  const eligibleTotal = Number(quorum.eligibleCoefficientTotal ?? 0);
  const configInvalid = Boolean(quorum.coefficientConfigurationInvalid);
  const trackPct = required > 0 ? Math.min(100, (current / required) * 100) : 0;
  const reached = Boolean(quorum.quorumReached);
  const prev = lastValues.get(root);
  const crossed =
    prev != null && !prev.reached && reached && Number.isFinite(prev.current);
  lastValues.set(root, { current, reached });

  const currentLabel = formatCoeff(current);
  const requiredLabel = formatCoeff(required);
  const missing = Number(quorum.missingCoefficient ?? Math.max(0, required - current));
  const statusBadge = `
    <span class="badge ${reached ? "badge-live" : "badge-warn"}">
      ${escapeHtml(reached ? t("quorum.reached") : t("quorum.notReached"))}
    </span>`;
  const configBanner = configInvalid
    ? `<p class="quorum-config-warn" role="alert">${escapeHtml(
        quorum.coefficientConfigurationMessage || t("quorum.configInvalid")
      )}</p>`
    : "";

  if (compact) {
    const statusText = reached
      ? t("quorum.reachedShort") || "Quórum OK"
      : t("quorum.notReachedShort") || "Sin quórum";
    root.innerHTML = `
      <div class="quorum-chip-inner" title="${escapeHtml(t("quorum.minimumShort") || "Mín.")} ${requiredLabel}">
        <span class="badge ${reached ? "badge-live" : "badge-warn"}">${escapeHtml(statusText)}</span>
        <span class="quorum-chip-values">
          <strong class="metric-number" data-quorum-current>${currentLabel}</strong>
        </span>
      </div>
      ${configBanner}
    `;
    animateIfNeeded(root.querySelector("[data-quorum-current]"), prev?.current, current);
    return;
  }

  const missingBlock = reached
    ? ""
    : `<p class="quorum-missing"><span class="muted">${escapeHtml(t("quorum.missing") || "Falta")}</span> <strong>${formatCoeff(missing)}</strong></p>`;

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
      <p class="muted quorum-coeff-hint" style="margin:0.35rem 0 0;font-size:0.85rem">
        ${escapeHtml(t("quorum.coeffHint", { pct: requiredPct.toFixed(0), total: eligibleTotal.toFixed(2) }))}
      </p>
      ${configBanner}
      <div class="quorum-meter-track" aria-hidden="true">
        <div class="quorum-meter-fill ${reached ? "reached" : ""}" style="width:${trackPct}%"></div>
      </div>
      ${missingBlock}
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
}

/** Coefficient percent-points of the PH (expected Σ ≈ 100). */
export function formatCoeff(n) {
  return `${Number(n).toFixed(2)}%`;
}

function animateIfNeeded(el, from, to) {
  if (!el || from == null || from === to) return;
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  if (reduce) {
    el.textContent = formatCoeff(to);
    return;
  }
  const start = performance.now();
  const duration = 420;
  const tick = (now) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - (1 - t) * (1 - t);
    const value = from + (to - from) * eased;
    el.textContent = formatCoeff(value);
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
