import { t } from "../i18n/i18n.js";

let toastRegion = null;

const ICONS = {
  success: "✓",
  info: "ℹ",
  warning: "⚠",
  warn: "⚠",
  error: "!"
};

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

function normalizeVariant(variant) {
  if (variant === "warn") return "warning";
  if (variant === "ok") return "success";
  return variant || "info";
}

/**
 * Premium toast notification.
 * @param {string|object} input message or { title, message, actionLabel, onAction, correlationId, ttlMs }
 * @param {"success"|"info"|"warning"|"error"|"warn"} [variant]
 * @param {number} [ttlMs]
 */
export function showToast(input, variant = "info", ttlMs) {
  const opts =
    typeof input === "object" && input !== null
      ? input
      : { message: String(input ?? ""), variant, ttlMs };

  const tone = normalizeVariant(opts.variant || variant);
  const title = opts.title || defaultTitle(tone);
  const message = opts.message || opts.body || "";
  const duration =
    opts.ttlMs ??
    ttlMs ??
    (tone === "error" ? 12000 : tone === "warning" ? 7000 : 4800);

  const region = ensureToastRegion();
  const el = document.createElement("div");
  el.className = `toast toast-${tone === "warning" ? "warn" : tone}`;
  el.setAttribute("role", tone === "error" ? "alert" : "status");
  if (tone === "error") {
    el.setAttribute("aria-live", "assertive");
  }

  const actionHtml = opts.actionLabel
    ? `<button type="button" class="toast__action" data-toast-action>${escapeHtml(opts.actionLabel)}</button>`
    : "";
  const corrHtml = opts.correlationId
    ? `<p class="toast__meta">CorrelationId: <code>${escapeHtml(opts.correlationId)}</code></p>`
    : "";

  el.innerHTML = `
    <span class="toast__icon" aria-hidden="true">${ICONS[tone] || ICONS.info}</span>
    <div class="toast__body">
      <strong class="toast__title">${escapeHtml(title)}</strong>
      ${message ? `<p class="toast__message">${escapeHtml(message)}</p>` : ""}
      ${corrHtml}
      ${actionHtml}
    </div>
    <button type="button" class="toast__close" aria-label="Cerrar">×</button>
  `;

  const close = () => {
    el.classList.add("is-leaving");
    window.setTimeout(() => el.remove(), 180);
  };

  el.querySelector(".toast__close")?.addEventListener("click", close);
  el.querySelector("[data-toast-action]")?.addEventListener("click", () => {
    try {
      opts.onAction?.();
    } finally {
      close();
    }
  });

  region.appendChild(el);
  window.setTimeout(close, duration);
  return { close };
}

function defaultTitle(tone) {
  switch (tone) {
    case "success":
      return "Listo";
    case "warning":
      return "Atención";
    case "error":
      return "No se pudo completar";
    default:
      return "Información";
  }
}

export const notify = {
  success: (message, opts = {}) => showToast({ ...opts, message, variant: "success" }),
  info: (message, opts = {}) => showToast({ ...opts, message, variant: "info" }),
  warning: (message, opts = {}) => showToast({ ...opts, message, variant: "warning" }),
  warn: (message, opts = {}) => showToast({ ...opts, message, variant: "warning" }),
  error: (message, opts = {}) => showToast({ ...opts, message, variant: "error" }),
  fromError(error, fallback = "Ocurrió un error") {
    const status = error?.status;
    let message = error?.message || fallback;
    if (status === 401) {
      return showToast({
        title: "Sesión expirada",
        message: "Tu sesión ha expirado. Vuelve a iniciar sesión.",
        variant: "error",
        actionLabel: "Iniciar sesión",
        onAction: () => {
          location.href = "/";
        },
        ttlMs: 20000
      });
    }
    if (status === 403) {
      message =
        error?.message && !/^Request failed \(403\)$/i.test(error.message)
          ? error.message
          : "No tienes permiso para realizar esta acción.";
    }
    if (status === 409) {
      message =
        error?.message ||
        "Esta operación ya no está disponible porque el estado cambió. Actualiza la vista.";
    }
    return showToast({
      title: defaultTitle("error"),
      message,
      variant: "error",
      correlationId: error?.correlationId
    });
  }
};

/**
 * Accessible confirm dialog. Returns true if confirmed.
 * @param {{
 *   title: string,
 *   body?: string,
 *   confirmLabel?: string,
 *   cancelLabel?: string,
 *   danger?: boolean,
 *   choiceLabel?: string|null,
 *   typeConfirm?: string|null
 * }} options
 */
export function confirmDialog(options) {
  const {
    title,
    body = "",
    confirmLabel = t("confirm"),
    cancelLabel = t("cancel"),
    danger = false,
    choiceLabel = null,
    typeConfirm = null
  } = options;

  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.className = "dialog";
    dialog.setAttribute("aria-labelledby", "dialog-title");

    const typeBlock = typeConfirm
      ? `<label class="dialog-typeconfirm">
           Escribe <strong>${escapeHtml(typeConfirm)}</strong> para confirmar
           <input type="text" autocomplete="off" data-typeconfirm />
         </label>`
      : "";

    dialog.innerHTML = `
      <h2 id="dialog-title">${escapeHtml(title)}</h2>
      ${body ? `<p class="dialog-body">${escapeHtml(body)}</p>` : ""}
      ${choiceLabel ? `<div class="dialog-choice" aria-live="polite">${escapeHtml(choiceLabel)}</div>` : ""}
      ${typeBlock}
      <div class="dialog-actions">
        <button type="button" class="btn btn-secondary" data-action="cancel">${escapeHtml(cancelLabel)}</button>
        <button type="button" class="btn ${danger ? "btn-danger" : "btn-primary"}" data-action="confirm" ${
          typeConfirm ? "disabled" : ""
        }>${escapeHtml(confirmLabel)}</button>
      </div>
    `;

    const confirmBtn = dialog.querySelector("[data-action='confirm']");
    const typeInput = dialog.querySelector("[data-typeconfirm]");
    if (typeInput && confirmBtn) {
      typeInput.addEventListener("input", () => {
        confirmBtn.disabled =
          typeInput.value.trim().toUpperCase() !== String(typeConfirm).toUpperCase();
      });
    }

    const opener = document.activeElement;
    const finish = (value) => {
      dialog.close();
      dialog.remove();
      if (opener && typeof opener.focus === "function") {
        try {
          opener.focus();
        } catch {
          /* ignore */
        }
      }
      resolve(value);
    };

    dialog.querySelector("[data-action='cancel']").addEventListener("click", () => finish(false));
    confirmBtn.addEventListener("click", () => finish(true));
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      finish(false);
    });

    document.body.appendChild(dialog);
    dialog.showModal();
    (typeInput || confirmBtn)?.focus();
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
