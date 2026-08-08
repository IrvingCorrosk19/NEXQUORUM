import { t } from "../i18n/i18n.js";

let toastRegion = null;

function ensureToastRegion() {
  if (toastRegion) {
    return toastRegion;
  }
  toastRegion = document.createElement("div");
  toastRegion.className = "toast-region";
  toastRegion.setAttribute("aria-live", "polite");
  toastRegion.setAttribute("aria-relevant", "additions");
  document.body.appendChild(toastRegion);
  return toastRegion;
}

/** Secondary feedback only — prefer dialogs for critical confirmations. */
export function showToast(message, variant = "info", ttlMs = 4200) {
  const region = ensureToastRegion();
  const el = document.createElement("div");
  el.className = `toast toast-${variant}`;
  el.setAttribute("role", "status");
  el.textContent = message;
  region.appendChild(el);
  window.setTimeout(() => el.remove(), ttlMs);
}

/**
 * Accessible confirm dialog. Returns true if confirmed.
 * @param {{ title: string, body?: string, confirmLabel?: string, cancelLabel?: string, danger?: boolean }} options
 */
export function confirmDialog(options) {
  const {
    title,
    body = "",
    confirmLabel = t("confirm"),
    cancelLabel = t("cancel"),
    danger = false,
    choiceLabel = null
  } = options;

  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.className = "dialog";
    dialog.setAttribute("aria-labelledby", "dialog-title");

    dialog.innerHTML = `
      <h2 id="dialog-title">${escapeHtml(title)}</h2>
      ${body ? `<p>${escapeHtml(body)}</p>` : ""}
      ${choiceLabel ? `<div class="dialog-choice" aria-live="polite">${escapeHtml(choiceLabel)}</div>` : ""}
      <div class="dialog-actions">
        <button type="button" class="btn btn-secondary" data-action="cancel">${escapeHtml(cancelLabel)}</button>
        <button type="button" class="btn ${danger ? "btn-danger" : "btn-primary"}" data-action="confirm">${escapeHtml(confirmLabel)}</button>
      </div>
    `;

    const finish = (value) => {
      dialog.close();
      dialog.remove();
      resolve(value);
    };

    dialog.querySelector("[data-action='cancel']").addEventListener("click", () => finish(false));
    dialog.querySelector("[data-action='confirm']").addEventListener("click", () => finish(true));
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      finish(false);
    });

    document.body.appendChild(dialog);
    dialog.showModal();
    dialog.querySelector("[data-action='confirm']")?.focus();
  });
}

export function ensureConnectionOverlay() {
  let overlay = document.querySelector("#connection-lost-overlay");
  if (overlay) {
    return overlay;
  }

  overlay = document.createElement("div");
  overlay.id = "connection-lost-overlay";
  overlay.className = "connection-lost";
  overlay.hidden = true;
  overlay.setAttribute("aria-hidden", "true");
  overlay.setAttribute("inert", "");
  overlay.setAttribute("role", "alert");
  overlay.setAttribute("aria-live", "assertive");
  overlay.innerHTML = `
    <div class="connection-lost-card">
      <h2 data-i18n="connection.lostTitle">${t("connection.lostTitle")}</h2>
      <p data-i18n="connection.trying">${t("connection.trying")}</p>
      <p data-i18n="connection.actionsSaved">${t("connection.actionsSaved")}</p>
    </div>
  `;
  document.body.appendChild(overlay);
  return overlay;
}

export function setConnectionLostVisible(visible) {
  const overlay = ensureConnectionOverlay();
  overlay.hidden = !visible;
  overlay.setAttribute("aria-hidden", String(!visible));
  if (!visible) {
    overlay.setAttribute("inert", "");
  } else {
    overlay.removeAttribute("inert");
  }
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function formatDateTime(value, locale = "es-PA") {
  if (!value) {
    return "—";
  }
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(value));
  } catch {
    return String(value);
  }
}

export function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) {
    return "00:00:00";
  }
  const totalSec = Math.floor(ms / 1000);
  const h = String(Math.floor(totalSec / 3600)).padStart(2, "0");
  const m = String(Math.floor((totalSec % 3600) / 60)).padStart(2, "0");
  const s = String(totalSec % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

export function qs(selector, root = document) {
  return root.querySelector(selector);
}

export function assemblyIdFromUrl() {
  return new URLSearchParams(location.search).get("assemblyId");
}
