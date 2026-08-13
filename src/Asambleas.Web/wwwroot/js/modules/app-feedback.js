/**
 * ASAMBLEAS — centralized premium feedback facade.
 * Wraps ui.js (toast/confirm) + loading.js (spinners/overlays).
 */
import { confirmDialog, notify, showToast } from "./ui.js";
import {
  hideGlobalLoader,
  loading,
  runWithButton,
  setButtonLoading,
  setComponentBusy,
  showGlobalLoader,
  startTopProgress,
  stopTopProgress
} from "./loading.js";

const TECHNICAL_PATTERNS = [
  /smtp/i,
  /exception/i,
  /stack trace/i,
  /system\./i,
  /http \d{3}/i,
  /request failed/i,
  /correlationid/i,
  /\.cs:/i,
  /postgres/i,
  /npgsql/i
];

/** @type {Map<string, { close?: () => void }>} */
const inlineLoaders = new Map();

function humanizeMessage(message, fallback = "Ocurrió un problema. Inténtalo de nuevo.") {
  const text = String(message || "").trim();
  if (!text) return fallback;
  if (TECHNICAL_PATTERNS.some((re) => re.test(text))) {
    return fallback;
  }
  return text;
}

function resolveHost(selectorOrEl) {
  if (!selectorOrEl) return document.querySelector("#page-alert");
  if (typeof selectorOrEl === "string") return document.querySelector(selectorOrEl);
  return selectorOrEl;
}

function bannerVariantClass(variant) {
  switch (variant) {
    case "success":
      return "alert-success";
    case "warning":
    case "warn":
      return "alert-warn";
    case "info":
      return "alert-info";
    default:
      return "alert-error";
  }
}

export const AppFeedback = {
  success(message, opts = {}) {
    return notify.success(message, opts);
  },

  info(message, opts = {}) {
    return notify.info(message, opts);
  },

  warning(message, opts = {}) {
    return notify.warning(message, opts);
  },

  error(message, opts = {}) {
    const safe = humanizeMessage(message, opts.fallback || "No pudimos completar la acción.");
    return notify.error(safe, { ...opts, message: safe });
  },

  toast: showToast,

  fromError(error, fallback) {
    const status = error?.status;
    let message = humanizeMessage(error?.message, fallback || "No pudimos completar la acción.");
    if (status === 403) {
      message =
        error?.message && !/^Request failed \(403\)$/i.test(error.message)
          ? error.message
          : "No tienes permiso para realizar esta acción.";
    }
    if (status === 409) {
      message = error?.message || "El estado cambió. Actualiza la vista e inténtalo de nuevo.";
    }
    return notify.error(message, {
      title: status === 403 ? "Sin permiso" : "No se pudo completar",
      actionLabel: error?.retry ? "Intentar nuevamente" : undefined,
      onAction: error?.retry
    });
  },

  confirm: confirmDialog,

  loading: {
    page(message, opts) {
      return showGlobalLoader(message, opts);
    },
    hidePage: hideGlobalLoader,
    progress: {
      start: startTopProgress,
      stop: stopTopProgress
    },
    button: setButtonLoading,
    component: setComponentBusy,
    inline(host, message = "Procesando…") {
      const el = resolveHost(host);
      if (!el) return () => {};
      const key = el.id || "__inline";
      inlineLoaders.get(key)?.close?.();
      el.hidden = false;
      el.className = "feedback-inline feedback-inline--loading";
      el.setAttribute("role", "status");
      el.setAttribute("aria-live", "polite");
      el.innerHTML = `<span class="feedback-inline__spinner" aria-hidden="true"></span><span>${escapeInline(
        message
      )}</span>`;
      const disposer = () => {
        el.hidden = true;
        el.textContent = "";
        el.className = "";
        inlineLoaders.delete(key);
      };
      inlineLoaders.set(key, { close: disposer });
      return disposer;
    },
    closeInline(host) {
      const el = resolveHost(host);
      const key = el?.id || "__inline";
      inlineLoaders.get(key)?.close?.();
    }
  },

  banner: {
    show(selectorOrEl, message, variant = "error") {
      const el = resolveHost(selectorOrEl);
      if (!el) return;
      if (!message) {
        el.hidden = true;
        el.textContent = "";
        return;
      }
      el.hidden = false;
      el.className = `alert ${bannerVariantClass(variant)}`;
      el.setAttribute("role", variant === "error" ? "alert" : "status");
      el.textContent = message;
    },

    clear(selectorOrEl) {
      const el = resolveHost(selectorOrEl);
      if (!el) return;
      el.hidden = true;
      el.textContent = "";
    },

    page(message, variant = "error") {
      AppFeedback.banner.show("#page-alert", message, variant);
    },

    login(message, variant = "error") {
      AppFeedback.banner.show("#login-error", message, variant);
    }
  },

  field: {
    error(inputEl, message) {
      if (!inputEl) return;
      const field =
        inputEl.closest(".field") ||
        inputEl.closest("label")?.parentElement ||
        inputEl.closest("label") ||
        inputEl.parentElement;
      inputEl.classList.add("is-invalid");
      inputEl.setAttribute("aria-invalid", "true");
      let hint = field?.querySelector(".field-error");
      if (!hint && field) {
        hint = document.createElement("p");
        hint.className = "field-error";
        hint.setAttribute("role", "alert");
        field.appendChild(hint);
      }
      if (hint) {
        hint.hidden = false;
        hint.textContent = message;
      }
    },

    clear(inputEl) {
      if (!inputEl) return;
      const field =
        inputEl.closest(".field") ||
        inputEl.closest("label")?.parentElement ||
        inputEl.closest("label") ||
        inputEl.parentElement;
      inputEl.classList.remove("is-invalid");
      inputEl.removeAttribute("aria-invalid");
      const hint = field?.querySelector(".field-error");
      if (hint) {
        hint.hidden = true;
        hint.textContent = "";
      }
    },

    clearForm(formEl) {
      formEl?.querySelectorAll(".is-invalid").forEach((el) => AppFeedback.field.clear(el));
    }
  },

  async action(button, loadingLabel, work, { success, error, progress = true } = {}) {
    if (progress) startTopProgress();
    try {
      const result = await runWithButton(button, loadingLabel, work, { progress: false });
      if (success) {
        if (typeof success === "string") {
          AppFeedback.success(success);
        } else if (typeof success === "object") {
          AppFeedback.success(success.message || "Listo", success);
        }
      }
      return result;
    } catch (err) {
      if (error) {
        if (typeof error === "function") {
          error(err);
        } else if (typeof error === "string") {
          AppFeedback.error(error);
        } else if (typeof error === "object") {
          AppFeedback.error(error.message || "No se pudo completar.", error);
        }
      } else {
        AppFeedback.fromError(err);
      }
      throw err;
    } finally {
      if (progress) stopTopProgress();
    }
  },

  runWithButton,
  loadingApi: loading
};

function escapeInline(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/** Drop-in replacement for legacy per-app showError helpers. */
export function showPageError(message, variant = "error") {
  AppFeedback.banner.page(message, variant);
}

export default AppFeedback;
