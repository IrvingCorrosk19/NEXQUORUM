import { api } from "./api.js";
import { escapeHtml, confirmDialog, showToast, qs } from "./ui.js";
import { showGlobalLoader, hideGlobalLoader, forceHideGlobalLoader } from "./loading.js";

/**
 * Bulk question import wizard for Voting Studio (xlsx/csv).
 */
export function openMotionImportWizard({ assemblyId, onImported }) {
  if (!assemblyId) {
    showToast("Seleccione una asamblea.", "error");
    return;
  }

  let step = 1;
  let preview = null;
  let clientRequestId = crypto.randomUUID?.() || String(Date.now());

  const dialog = document.createElement("dialog");
  dialog.className = "motion-import-dialog";
  dialog.setAttribute("aria-labelledby", "mi-title");
  dialog.innerHTML = `
    <form method="dialog" class="motion-import-form" data-mi-form>
      <header class="motion-import-head">
        <h2 id="mi-title">Importar preguntas</h2>
        <p class="muted">Cargue muchas preguntas desde Excel o CSV. Se guardaran como borradores editables.</p>
        <ol class="motion-import-steps" aria-label="Pasos">
          <li data-step="1" class="is-active">Preparar</li>
          <li data-step="2">Cargar</li>
          <li data-step="3">Revisar</li>
        </ol>
      </header>
      <div class="motion-import-body" data-mi-body></div>
      <footer class="motion-import-foot">
        <button type="button" class="btn btn-ghost" data-mi="cancel">Cancelar</button>
        <button type="button" class="btn btn-secondary" data-mi="back" hidden>Volver</button>
        <button type="button" class="btn btn-primary" data-mi="next">Continuar</button>
      </footer>
    </form>`;
  document.body.appendChild(dialog);
  dialog.showModal();

  const body = dialog.querySelector("[data-mi-body]");
  const btnNext = dialog.querySelector('[data-mi="next"]');
  const btnBack = dialog.querySelector('[data-mi="back"]');

  function setStep(n) {
    step = n;
    dialog.querySelectorAll(".motion-import-steps li").forEach((li) => {
      li.classList.toggle("is-active", Number(li.dataset.step) === step);
    });
    btnBack.hidden = step === 1;
    render();
  }

  function render() {
    if (step === 1) {
      body.innerHTML = `
        <div class="motion-import-panel">
          <p><strong>1.</strong> Descargue la plantilla Excel con los catalogos de esta asamblea.</p>
          <p><strong>2.</strong> Complete una fila por pregunta. No cambie los encabezados.</p>
          <p><strong>3.</strong> Guarde el archivo y continúe para cargarlo.</p>
          <div class="cluster" style="margin-top:1rem">
            <button type="button" class="btn btn-secondary" data-mi="template">Descargar plantilla Excel</button>
          </div>
          <p class="muted" style="margin-top:0.75rem">Formatos: .xlsx (recomendado) o .csv UTF-8. Maximo 200 preguntas / 2 MB.</p>
        </div>`;
      btnNext.textContent = "Continuar";
      btnNext.disabled = false;
    } else if (step === 2) {
      body.innerHTML = `
        <div class="motion-import-panel">
          <label class="motion-import-drop" data-mi-drop>
            <input type="file" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" data-mi-file hidden />
            <span class="motion-import-drop__title">Seleccionar archivo o soltar aqui</span>
            <span class="muted">.xlsx o .csv</span>
          </label>
          <p class="muted" data-mi-file-name>Ningun archivo seleccionado</p>
        </div>`;
      btnNext.textContent = "Validar archivo";
      btnNext.disabled = true;
      wireDrop();
    } else {
      renderPreview();
      btnNext.textContent = "Guardar importacion como borrador";
      btnNext.disabled = !(preview && preview.canCommit);
    }
  }

  function wireDrop() {
    const drop = body.querySelector("[data-mi-drop]");
    const input = body.querySelector("[data-mi-file]");
    const nameEl = body.querySelector("[data-mi-file-name]");
    const onFile = (file) => {
      if (!file) return;
      input._file = file;
      nameEl.textContent = file.name + " (" + Math.round(file.size / 1024) + " KB)";
      btnNext.disabled = false;
    };
    drop.addEventListener("click", () => input.click());
    input.addEventListener("change", () => onFile(input.files?.[0]));
    drop.addEventListener("dragover", (e) => {
      e.preventDefault();
      drop.classList.add("is-drag");
    });
    drop.addEventListener("dragleave", () => drop.classList.remove("is-drag"));
    drop.addEventListener("drop", (e) => {
      e.preventDefault();
      drop.classList.remove("is-drag");
      onFile(e.dataTransfer?.files?.[0]);
    });
  }

  function statusLabel(status) {
    if (status === "Ready") return "Lista para importar";
    if (status === "Warning") return "Advertencia";
    if (status === "Error") return "Requiere correccion";
    if (status === "Excluded") return "Excluida";
    return status;
  }

  function renderPreview() {
    if (!preview) {
      body.innerHTML = `<p class="muted">No hay vista previa.</p>`;
      return;
    }
    const filterErrors = body.querySelector("[data-mi-only-errors]")?.checked;
    const q = (body.querySelector("[data-mi-search]")?.value || "").toLowerCase();
    let rows = preview.rows || [];
    if (filterErrors) rows = rows.filter((r) => r.status === "Error");
    if (q) {
      rows = rows.filter(
        (r) =>
          (r.tituloCorto || "").toLowerCase().includes(q) ||
          (r.pregunta || "").toLowerCase().includes(q) ||
          (r.codigo || "").toLowerCase().includes(q)
      );
    }
    body.innerHTML = `
      <div class="motion-import-summary" role="status">
        <span>Total: <strong>${preview.total}</strong></span>
        <span>Validas: <strong>${preview.valid}</strong></span>
        <span>Con errores: <strong>${preview.errors}</strong></span>
        <span>Advertencias: <strong>${preview.warnings}</strong></span>
      </div>
      <div class="ia-toolbar" style="margin:0.5rem 0">
        <label class="cluster"><input type="checkbox" data-mi-only-errors /> Solo errores</label>
        <input type="search" data-mi-search placeholder="Buscar…" style="min-width:10rem" />
      </div>
      <div class="motion-import-table-wrap">
        <table class="motion-import-table">
          <thead>
            <tr>
              <th>Fila</th><th>Orden</th><th>Agenda</th><th>Codigo</th><th>Titulo</th><th>Estado</th><th>Mensajes</th><th></th>
            </tr>
          </thead>
          <tbody>
            ${rows
              .map(
                (r) => `
              <tr class="mi-row mi-${(r.status || "").toLowerCase()}" data-row="${r.rowNumber}">
                <td>${r.rowNumber}</td>
                <td>${r.orden ?? "—"}</td>
                <td>${escapeHtml(r.puntoAgenda || "—")}</td>
                <td>${escapeHtml(r.codigo || "—")}</td>
                <td><strong>${escapeHtml(r.tituloCorto || "—")}</strong>
                  <div class="muted mi-q">${escapeHtml((r.pregunta || "").slice(0, 120))}</div></td>
                <td><span class="badge">${escapeHtml(statusLabel(r.status))}</span></td>
                <td>${escapeHtml((r.messages || []).join(" · "))}</td>
                <td class="cluster">
                  <button type="button" class="btn btn-ghost btn-xs" data-mi-edit="${r.rowNumber}">Corregir</button>
                  <button type="button" class="btn btn-ghost btn-xs" data-mi-exclude="${r.rowNumber}">${r.included === false ? "Incluir" : "Quitar"}</button>
                </td>
              </tr>`
              )
              .join("")}
          </tbody>
        </table>
      </div>
      <div class="motion-import-cards" hidden></div>`;
    // restore filter UI handlers
    body.querySelector("[data-mi-only-errors]")?.addEventListener("change", renderPreview);
    body.querySelector("[data-mi-search]")?.addEventListener("input", () => {
      clearTimeout(body._searchT);
      body._searchT = setTimeout(renderPreview, 200);
    });
    body.querySelectorAll("[data-mi-edit]").forEach((btn) => {
      btn.addEventListener("click", () => editRow(Number(btn.getAttribute("data-mi-edit"))));
    });
    body.querySelectorAll("[data-mi-exclude]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const rowNumber = Number(btn.getAttribute("data-mi-exclude"));
        const row = preview.rows.find((x) => x.rowNumber === rowNumber);
        preview = await api(`/api/assemblies/${assemblyId}/motions/import/patch-row`, {
          method: "POST",
          body: { sessionId: preview.sessionId, rowNumber, included: !(row?.included !== false) }
        });
        renderPreview();
        btnNext.disabled = !(preview && preview.canCommit);
      });
    });
  }

  async function editRow(rowNumber) {
    const row = preview.rows.find((r) => r.rowNumber === rowNumber);
    if (!row) return;
    const form = document.createElement("dialog");
    form.className = "motion-import-edit";
    form.innerHTML = `
      <form method="dialog" class="stack" style="min-width:min(28rem,92vw);padding:1rem">
        <h3>Corregir fila ${rowNumber}</h3>
        <label>Titulo corto <input name="titulo" value="${escapeHtml(row.tituloCorto || "")}" required /></label>
        <label>Pregunta <textarea name="pregunta" rows="3" required>${escapeHtml(row.pregunta || "")}</textarea></label>
        <label>Punto agenda <input name="agenda" value="${escapeHtml(row.puntoAgenda || "")}" required /></label>
        <label>Codigo <input name="codigo" value="${escapeHtml(row.codigo || "")}" /></label>
        <label>Orden <input name="orden" type="number" min="1" value="${row.orden ?? ""}" /></label>
        <footer class="cluster">
          <button type="submit" class="btn btn-ghost" value="cancel">Volver</button>
          <button type="submit" class="btn btn-primary" value="save">Revalidar</button>
        </footer>
      </form>`;
    document.body.appendChild(form);
    form.showModal();
    form.querySelector("form").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const submitter = ev.submitter;
      if (submitter?.value === "cancel") {
        form.close();
        form.remove();
        return;
      }
      const fd = new FormData(form.querySelector("form"));
      try {
        preview = await api(`/api/assemblies/${assemblyId}/motions/import/patch-row`, {
          method: "POST",
          body: {
            sessionId: preview.sessionId,
            rowNumber,
            tituloCorto: String(fd.get("titulo") || ""),
            pregunta: String(fd.get("pregunta") || ""),
            puntoAgenda: String(fd.get("agenda") || ""),
            codigo: String(fd.get("codigo") || ""),
            orden: Number(fd.get("orden") || 0) || null
          }
        });
        form.close();
        form.remove();
        renderPreview();
        btnNext.disabled = !(preview && preview.canCommit);
        showToast("Fila revalidada", "success");
      } catch (err) {
        showToast(err.message || "No se pudo corregir", "error");
      }
    });
  }

  async function downloadTemplate() {
    showGlobalLoader("Preparando plantilla…", { immediate: true });
    try {
      const af = await fetch("/api/auth/antiforgery", { credentials: "same-origin" });
      const { requestToken } = await af.json();
      const res = await fetch(`/api/assemblies/${assemblyId}/motions/import/template`, {
        credentials: "same-origin",
        headers: { RequestVerificationToken: requestToken }
      });
      if (!res.ok) throw new Error("No pudimos descargar la plantilla.");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `preguntas-${assemblyId.slice(0, 8)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      showToast("Plantilla descargada", "success");
    } catch (err) {
      showToast(err.message || "Error al descargar", "error");
    } finally {
      forceHideGlobalLoader();
    }
  }

  async function analyzeFile() {
    const input = body.querySelector("[data-mi-file]");
    const file = input?._file || input?.files?.[0];
    if (!file) {
      showToast("Seleccione un archivo", "info");
      return;
    }
    showGlobalLoader("Validando archivo…", { immediate: true });
    try {
      const af = await fetch("/api/auth/antiforgery", { credentials: "same-origin" });
      const { requestToken } = await af.json();
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/assemblies/${assemblyId}/motions/import/analyze`, {
        method: "POST",
        credentials: "same-origin",
        headers: { RequestVerificationToken: requestToken },
        body: fd
      });
      const text = await res.text();
      let json = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = { detail: text };
      }
      if (!res.ok) {
        throw new Error(json?.detail || json?.title || "No se pudo validar el archivo");
      }
      preview = json;
      setStep(3);
    } catch (err) {
      showToast(err.message || "Error de validacion", "error");
    } finally {
      forceHideGlobalLoader();
    }
  }

  async function commit() {
    if (!preview?.canCommit) {
      showToast("Corrija los errores antes de importar", "error");
      return;
    }
    const ok = await confirmDialog({
      title: "Importar preguntas",
      body: `Se crearan ${preview.valid} preguntas como borrador. No se publicaran automaticamente.`,
      confirmLabel: "Importar como borrador",
      cancelLabel: "Volver"
    });
    if (!ok) return;
    showGlobalLoader("Importando…", { immediate: true });
    try {
      const result = await api(`/api/assemblies/${assemblyId}/motions/import/commit`, {
        method: "POST",
        body: {
          sessionId: preview.sessionId,
          publishReadyRows: false,
          clientRequestId
        }
      });
      showToast(`Importadas ${result.imported} preguntas`, "success");
      dialog.close();
      dialog.remove();
      await onImported?.(result);
    } catch (err) {
      showToast(err.message || "No se pudo importar", "error");
    } finally {
      forceHideGlobalLoader();
    }
  }

  dialog.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-mi]");
    if (!btn) return;
    const action = btn.getAttribute("data-mi");
    if (action === "cancel") {
      dialog.close();
      dialog.remove();
      return;
    }
    if (action === "template") {
      await downloadTemplate();
      return;
    }
    if (action === "back") {
      setStep(Math.max(1, step - 1));
      return;
    }
    if (action === "next") {
      if (step === 1) setStep(2);
      else if (step === 2) await analyzeFile();
      else await commit();
    }
  });

  dialog.addEventListener("close", () => dialog.remove());
  setStep(1);
}