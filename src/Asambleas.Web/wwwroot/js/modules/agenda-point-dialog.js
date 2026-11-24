import { api } from "./api.js";
import { qs } from "./ui.js";

const DIALOG_HTML = `
  <form id="agenda-form" class="app-sheet__form">
    <header class="app-sheet__head">
      <h2 id="agenda-dialog-title" tabindex="-1">Agregar punto</h2>
      <button type="button" class="btn app-sheet__close" id="agenda-dialog-close" aria-label="Cerrar">✕</button>
    </header>
    <div class="app-sheet__body">
      <p id="agenda-dialog-error" class="field-error" role="alert" hidden></p>
      <label class="form-label">Código
        <input class="form-control" id="agenda-code" type="text" maxlength="32" placeholder="A01" autocomplete="off" />
      </label>
      <label class="form-label">Título
        <input class="form-control" id="agenda-title" type="text" maxlength="200" placeholder="Ej. Aprobación de estados financieros" />
      </label>
    </div>
    <footer class="app-sheet__foot">
      <button type="button" class="btn btn-secondary" id="agenda-dialog-cancel">Cancelar</button>
      <button type="submit" class="btn btn-primary">Guardar punto</button>
    </footer>
  </form>`;

function ensureDialog() {
  let dialog = qs("#dlg-agenda");
  if (dialog) return dialog;
  dialog = document.createElement("dialog");
  dialog.id = "dlg-agenda";
  dialog.className = "app-sheet";
  dialog.setAttribute("aria-labelledby", "agenda-dialog-title");
  dialog.innerHTML = DIALOG_HTML;
  document.body.appendChild(dialog);
  return dialog;
}

function agendaError(error) {
  const message = error?.message || "";
  if (/title is required/i.test(message)) return "El título es obligatorio.";
  if (/exceeds maximum length/i.test(message)) return "El código supera la longitud permitida.";
  if (/already exists/i.test(message)) return "Ese código de agenda ya existe.";
  if (/closed assembly/i.test(message)) return "No se pueden agregar puntos a una asamblea cerrada.";
  return message || "No se pudo guardar el punto de agenda.";
}

function showDialogError(message) {
  const el = qs("#agenda-dialog-error");
  if (!el) return;
  el.hidden = !message;
  el.textContent = message || "";
}

/**
 * Opens the existing agenda-point form. Cancel closes without creating a record.
 * A failed save keeps the typed values and shows the error in the form.
 * @returns {Promise<{ok:true,item:object}|{ok:false,cancelled:true}>}
 */
export function openAgendaPointDialog({ assemblyId, opener } = {}) {
  const dialog = ensureDialog();
  const form = qs("#agenda-form");
  const title = qs("#agenda-title");
  const code = qs("#agenda-code");
  if (title) title.value = "";
  if (code) code.value = "";
  showDialogError("");
  return new Promise((resolve) => {
    let settled = false;
    const abort = new AbortController();
    const finish = (result) => {
      if (settled) return;
      settled = true;
      abort.abort();
      if (dialog.open) dialog.close();
      if (opener && typeof opener.focus === "function") opener.focus();
      resolve(result);
    };
    const onClose = () => finish({ ok: false, cancelled: true });
    const onCancel = (event) => {
      event.preventDefault();
      finish({ ok: false, cancelled: true });
    };
    const onSubmit = async (event) => {
      event.preventDefault();
      const titleValue = title?.value.trim() || "";
      const codeValue = code?.value.trim() || "";
      if (!titleValue) {
        showDialogError("El título es obligatorio.");
        title?.focus();
        return;
      }
      const submit = form.querySelector('[type="submit"]');
      if (submit) submit.disabled = true;
      try {
        const before = await api(`/api/assemblies/${assemblyId}/agenda`);
        const known = new Set((before?.items || []).map((item) => String(item.id)));
        const saved = await api(`/api/assemblies/${assemblyId}/agenda`, {
          method: "POST",
          body: { ordinal: 0, code: codeValue, title: titleValue }
        });
        const items = saved?.items || [];
        const created = items.find((item) => !known.has(String(item.id)));
        if (title) title.value = "";
        if (code) code.value = "";
        showDialogError("");
        settled = true;
        abort.abort();
        if (dialog.open) dialog.close();
        if (opener && typeof opener.focus === "function") opener.focus();
        resolve({ ok: true, item: created || items[items.length - 1] });
      } catch (error) {
        showDialogError(agendaError(error));
        title?.focus();
      } finally {
        if (submit) submit.disabled = false;
      }
    };
    const signal = abort.signal;
    qs("#agenda-dialog-close")?.addEventListener("click", () => finish({ ok: false, cancelled: true }), { signal });
    qs("#agenda-dialog-cancel")?.addEventListener("click", () => finish({ ok: false, cancelled: true }), { signal });
    form?.addEventListener("submit", onSubmit, { signal });
    dialog.addEventListener("close", onClose, { signal });
    dialog.addEventListener("cancel", onCancel, { signal });
    if (!dialog.open) dialog.showModal();
    (title || qs("#agenda-dialog-title"))?.focus();
  });
}
