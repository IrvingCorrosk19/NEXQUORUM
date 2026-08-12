/**
 * Sticky action bar + dirty-state helpers for long forms.
 */
import { confirmDialog } from "./ui.js";

/**
 * @param {HTMLFormElement} form
 * @param {{
 *   bar: HTMLElement,
 *   hint: HTMLElement,
 *   saveBtn: HTMLButtonElement,
 *   cancelBtn?: HTMLButtonElement|null,
 *   onSave?: (ev: Event) => void|Promise<void>,
 *   onDiscard?: () => void
 * }} opts
 */
export function bindStickyForm(form, opts) {
  const { bar, hint, saveBtn, cancelBtn = null, onDiscard } = opts;
  let baseline = serializeForm(form);
  let dirty = false;

  const refresh = () => {
    const next = serializeForm(form);
    dirty = next !== baseline;
    bar.dataset.dirty = String(dirty);
    hint.dataset.dirty = String(dirty);
    hint.textContent = dirty ? "Cambios sin guardar" : "Sin cambios pendientes";
    saveBtn.disabled = !dirty;
    if (cancelBtn) cancelBtn.disabled = !dirty;
  };

  const onInput = () => refresh();
  form.addEventListener("input", onInput);
  form.addEventListener("change", onInput);

  cancelBtn?.addEventListener("click", async () => {
    if (!dirty) return;
    const ok = await confirmDialog({
      title: "Descartar cambios",
      body: "Tienes cambios sin guardar. ¿Descartarlos?",
      confirmLabel: "Descartar",
      cancelLabel: "Seguir editando"
    });
    if (!ok) return;
    restoreForm(form, baseline);
    refresh();
    onDiscard?.();
  });

  const beforeUnload = (ev) => {
    if (!dirty) return;
    ev.preventDefault();
    ev.returnValue = "";
  };
  window.addEventListener("beforeunload", beforeUnload);

  return {
    markClean() {
      baseline = serializeForm(form);
      refresh();
    },
    isDirty() {
      return dirty;
    },
    async confirmLeave() {
      if (!dirty) return true;
      return confirmDialog({
        title: "Cambios sin guardar",
        body: "Tienes cambios sin guardar. Si sales ahora, se perderán.",
        confirmLabel: "Descartar y salir",
        cancelLabel: "Seguir editando"
      });
    },
    destroy() {
      form.removeEventListener("input", onInput);
      form.removeEventListener("change", onInput);
      window.removeEventListener("beforeunload", beforeUnload);
    },
    refresh
  };
}

function serializeForm(form) {
  const fd = new FormData(form);
  const entries = [...fd.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  return JSON.stringify(entries);
}

function restoreForm(form, serialized) {
  const entries = JSON.parse(serialized);
  const map = Object.fromEntries(entries);
  [...form.elements].forEach((el) => {
    if (!el.name || el.type === "submit" || el.type === "button") return;
    if (el.type === "checkbox" || el.type === "radio") {
      el.checked = map[el.name] === el.value || map[el.name] === "on";
      return;
    }
    if (map[el.name] != null) el.value = map[el.name];
  });
}
