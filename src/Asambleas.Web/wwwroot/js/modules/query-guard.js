/**
 * Request sequencing plus local verification hooks.
 * window.__ASAM_TEST_DELAY (ms) and window.__ASAM_TEST_FAIL (one-shot) are for QA only.
 */
export async function applyTestHooks() {
  const ms = Number(window.__ASAM_TEST_DELAY || 0);
  if (ms > 0) await new Promise((r) => setTimeout(r, ms));
  if (window.__ASAM_TEST_FAIL) {
    window.__ASAM_TEST_FAIL = false;
    throw new Error("No se pudo completar la consulta. Inténtalo de nuevo.");
  }
}

export function createQueryGuard() {
  let seq = 0;
  return {
    next() {
      return ++seq;
    },
    isCurrent(token) {
      return token === seq;
    },
    testHooks: applyTestHooks
  };
}

function scrollFieldIntoSheet(el) {
  const sheet = el.closest(".schedule-sheet__body, .app-sheet__body, .unit-hub__body");
  if (sheet) {
    const er = el.getBoundingClientRect();
    const sr = sheet.getBoundingClientRect();
    const pad = 12;
    if (er.bottom > sr.bottom - pad) sheet.scrollTop += er.bottom - sr.bottom + pad;
    if (er.top < sr.top + pad) sheet.scrollTop -= sr.top - er.top + pad;
    return;
  }
  el.scrollIntoView({ block: "nearest", inline: "nearest" });
}

export function wireSheetKeyboard(container) {
  if (!container) return () => {};
  const onFocus = (e) => {
    const t = e.target;
    if (!t?.matches?.("input, select, textarea")) return;
    try {
      scrollFieldIntoSheet(t);
    } catch {
      /* ignore */
    }
  };
  container.addEventListener("focusin", onFocus);
  return () => container.removeEventListener("focusin", onFocus);
}

export function rememberOpener() {
  const el = document.activeElement;
  return el && typeof el.focus === "function" ? el : null;
}

export function restoreOpener(el) {
  try {
    el?.focus?.();
  } catch {
    /* ignore */
  }
}

export function bindSheetViewport(dialog) {
  if (!dialog || !window.visualViewport) return () => {};
  const apply = () => {
    const h = Math.max(240, Math.floor(window.visualViewport.height));
    dialog.style.maxHeight = `${h}px`;
  };
  apply();
  window.visualViewport.addEventListener("resize", apply);
  const unbind = () => {
    window.visualViewport.removeEventListener("resize", apply);
    dialog.style.maxHeight = "";
  };
  dialog.addEventListener("close", unbind, { once: true });
  return unbind;
}

export function trapFocus(container) {
  if (!container) return () => {};
  const selector =
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  const visible = (el) => !el.hidden && !el.closest("[hidden]") && el.getClientRects().length > 0;
  const handler = (e) => {
    if (e.key !== "Tab") return;
    const nodes = [...container.querySelectorAll(selector)].filter(visible);
    if (!nodes.length) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };
  container.addEventListener("keydown", handler);
  return () => container.removeEventListener("keydown", handler);
}
