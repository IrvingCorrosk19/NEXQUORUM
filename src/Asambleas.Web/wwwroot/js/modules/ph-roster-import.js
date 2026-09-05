import { api, ensureAntiforgery } from "./api.js";
import { escapeHtml, confirmDialog } from "./ui.js";
import { AppFeedback } from "./app-feedback.js";
import { showGlobalLoader, hideGlobalLoader, forceHideGlobalLoader } from "./loading.js";

/**
 * Multi-sheet owners/units import wizard for PH admin.
 */
export function openPhRosterImportWizard({ phId, phName, onImported }) {
  if (!phId) {
    AppFeedback.warning("Seleccione una propiedad horizontal.", { title: "PH requerido" });
    return;
  }

  let step = 1;
  let preview = null;
  let activeTab = "units";
  let filterErrors = false;
  let search = "";
  let clientRequestId = crypto.randomUUID?.() || String(Date.now());
  let mode = "CreateOnly";

  const dialog = document.createElement("dialog");
  dialog.className = "ph-roster-import-dialog";
  dialog.setAttribute("aria-labelledby", "pri-title");
  dialog.innerHTML = `
    <form method="dialog" class="ph-roster-import-form" data-pri-form>
      <header class="ph-roster-import-head">
        <h2 id="pri-title">Importar datos — PH ${escapeHtml(phName || "")}</h2>
        <p class="muted">Unidades, propietarios y relaciones. No se envian convocatorias ni se crean contrasenas.</p>
        <ol class="ph-roster-import-steps" aria-label="Pasos">
          <li data-step="1" class="is-active">Preparar</li>
          <li data-step="2">Cargar</li>
          <li data-step="3">Revisar</li>
        </ol>
      </header>
      <div class="ph-roster-import-body" data-pri-body></div>
      <footer class="ph-roster-import-foot">
        <button type="button" class="btn btn-ghost" data-pri="cancel">Cancelar</button>
        <button type="button" class="btn btn-secondary" data-pri="back" hidden>Volver</button>
        <button type="button" class="btn btn-primary" data-pri="next">Continuar</button>
      </footer>
    </form>`;
  document.body.appendChild(dialog);
  dialog.showModal();

  const body = dialog.querySelector("[data-pri-body]");
  const btnNext = dialog.querySelector('[data-pri="next"]');
  const btnBack = dialog.querySelector('[data-pri="back"]');

  dialog.querySelector('[data-pri="cancel"]').addEventListener("click", () => close());
  btnBack.addEventListener("click", () => {
    step = Math.max(1, step - 1);
    render();
  });
  btnNext.addEventListener("click", () => onNext());
  dialog.addEventListener("cancel", (e) => {
    e.preventDefault();
    close();
  });

  function close() {
    dialog.close();
    dialog.remove();
  }

  function setStepIndicators() {
    dialog.querySelectorAll(".ph-roster-import-steps li").forEach((li) => {
      const n = Number(li.getAttribute("data-step"));
      li.classList.toggle("is-active", n === step);
      li.classList.toggle("is-done", n < step);
    });
    btnBack.hidden = step === 1;
  }

  function render() {
    setStepIndicators();
    if (step === 1) renderPrepare();
    else if (step === 2) renderUpload();
    else renderPreview();
  }

  function renderPrepare() {
    btnNext.textContent = "Continuar";
    body.innerHTML = `
      <div class="pri-panel">
        <p><strong>Confirmacion:</strong> Importara datos en <em>${escapeHtml(phName || "este PH")}</em>.</p>
        <label class="pri-check">
          <input type="checkbox" data-pri="confirm-ph" />
          Confirmo que este es el PH correcto
        </label>
        <div class="pri-actions">
          <a class="btn btn-secondary" href="/api/ph/${phId}/import/template" download>Descargar plantilla Excel</a>
        </div>
        <ul class="pri-hints">
          <li>Complete las hojas Unidades, Propietarios y PropietarioUnidad.</li>
          <li>No cambie los encabezados.</li>
          <li>El coeficiente es porcentaje de 0 a 100 (ej. 0.4231).</li>
          <li>Formatos: .xlsx (recomendado) o .csv.</li>
          <li>Maximo 5000 filas / 5 MB.</li>
        </ul>
      </div>`;
  }

  function renderUpload() {
    btnNext.textContent = "Validar archivo";
    body.innerHTML = `
      <div class="pri-panel">
        <div class="pri-drop" data-pri="drop" tabindex="0" role="button" aria-label="Zona para soltar archivo">
          <p>Arrastre el archivo aqui o seleccione .xlsx / .csv</p>
          <input type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" data-pri="file" />
        </div>
        <p class="muted" data-pri="file-name">Ningun archivo seleccionado</p>
        <label>Modo
          <select data-pri="mode">
            <option value="CreateOnly" selected>Crear nuevos (recomendado)</option>
            <option value="CreateAndUpdate">Crear y actualizar</option>
          </select>
        </label>
      </div>`;
    const fileInput = body.querySelector('[data-pri="file"]');
    const drop = body.querySelector('[data-pri="drop"]');
    const nameEl = body.querySelector('[data-pri="file-name"]');
    const modeSel = body.querySelector('[data-pri="mode"]');
    modeSel.value = mode;
    modeSel.addEventListener("change", () => { mode = modeSel.value; });
    fileInput.addEventListener("change", () => {
      nameEl.textContent = fileInput.files?.[0]?.name || "Ningun archivo seleccionado";
    });
    drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("is-drag"); });
    drop.addEventListener("dragleave", () => drop.classList.remove("is-drag"));
    drop.addEventListener("drop", (e) => {
      e.preventDefault();
      drop.classList.remove("is-drag");
      if (e.dataTransfer?.files?.[0]) {
        fileInput.files = e.dataTransfer.files;
        nameEl.textContent = e.dataTransfer.files[0].name;
      }
    });
  }

  function statusBadge(status, classification) {
    const label = status === "Error" ? "Requiere correccion"
      : status === "Warning" ? "Advertencia"
      : classification === "Existente" ? "Existente"
      : classification === "Actualizacion" ? "Actualizacion"
      : classification === "Conflicto" ? "Conflicto"
      : "Lista";
    const cls = status === "Error" ? "is-error" : status === "Warning" ? "is-warn" : "is-ok";
    return `<span class="pri-badge ${cls}">${escapeHtml(label)}</span>`;
  }

  function filteredRows(rows) {
    let list = rows || [];
    if (filterErrors) list = list.filter((r) => r.status === "Error" || r.status === "Warning");
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((r) => JSON.stringify(r).toLowerCase().includes(q));
    }
    return list;
  }

  function renderPreview() {
    btnNext.textContent = "Confirmar importacion";
    const s = preview?.summary || {};
    const blocked = !!s.activeAssemblyBlocked;
    body.innerHTML = `
      <div class="pri-panel">
        ${blocked ? `<div class="pri-alert" role="alert">${escapeHtml(s.activeAssemblyMessage || "Asamblea en curso: importacion bloqueada.")}</div>` : ""}
        <div class="pri-summary" role="status">
          <div><strong>UNIDADES</strong><br>Nuevas ${s.unitsNew ?? 0} · Existentes ${s.unitsExisting ?? 0} · Act. ${s.unitsUpdates ?? 0} · Errores ${s.unitsErrors ?? 0}</div>
          <div><strong>PROPIETARIOS</strong><br>Nuevos ${s.ownersNew ?? 0} · Existentes ${s.ownersExisting ?? 0} · Act. ${s.ownersUpdates ?? 0} · Errores ${s.ownersErrors ?? 0}</div>
          <div><strong>RELACIONES</strong><br>Nuevas ${s.relationsNew ?? 0} · Existentes ${s.relationsExisting ?? 0} · Errores ${s.relationsErrors ?? 0}</div>
          <div><strong>COEFICIENTES</strong><br>Actual ${Number(s.coefficientCurrent || 0).toFixed(4)} · Archivo ${Number(s.coefficientFileNew || 0).toFixed(4)} · Proyectado ${Number(s.coefficientProjected || 0).toFixed(4)} · Delta ${Number(s.coefficientDelta || 0).toFixed(4)}</div>
        </div>
        ${(s.warnings || []).map((w) => `<p class="pri-warn">${escapeHtml(w)}</p>`).join("")}
        <div class="pri-toolbar">
          <div class="pri-tabs" role="tablist">
            <button type="button" role="tab" data-tab="units" class="${activeTab === "units" ? "is-active" : ""}">Unidades</button>
            <button type="button" role="tab" data-tab="owners" class="${activeTab === "owners" ? "is-active" : ""}">Propietarios</button>
            <button type="button" role="tab" data-tab="relations" class="${activeTab === "relations" ? "is-active" : ""}">Relaciones</button>
          </div>
          <label class="pri-check"><input type="checkbox" data-pri="only-err" ${filterErrors ? "checked" : ""}/> Solo errores</label>
          <input type="search" placeholder="Buscar..." data-pri="search" value="${escapeHtml(search)}" aria-label="Buscar filas" />
          <a class="btn btn-ghost" href="/api/ph/${phId}/import/${preview.sessionId}/errors">Descargar errores</a>
        </div>
        <div data-pri="table-host"></div>
        <label class="pri-check" style="margin-top:1rem">
          <input type="checkbox" data-pri="confirm-name" />
          Confirmo importar en PH <strong>${escapeHtml(preview.phName || phName || "")}</strong>
        </label>
      </div>`;
    body.querySelectorAll("[data-tab]").forEach((btn) => {
      btn.addEventListener("click", () => { activeTab = btn.getAttribute("data-tab"); renderPreview(); });
    });
    body.querySelector('[data-pri="only-err"]').addEventListener("change", (e) => {
      filterErrors = e.target.checked;
      renderPreview();
    });
    body.querySelector('[data-pri="search"]').addEventListener("input", (e) => {
      search = e.target.value;
      renderTable();
    });
    renderTable();
    btnNext.disabled = blocked || !s.canCommit;
  }

  function renderTable() {
    const host = body.querySelector("[data-pri=\"table-host\"]");
    if (!host || !preview) return;
    let html = "";
    if (activeTab === "units") {
      const rows = filteredRows(preview.units);
      html = `<div class="pri-table-wrap"><table class="pri-table"><thead><tr><th>Fila</th><th>Codigo</th><th>Torre</th><th>Coef.</th><th>Estado</th><th>Clasif.</th><th></th></tr></thead><tbody>
        ${rows.map((r) => `<tr class="${r.status === "Error" ? "is-error" : ""}">
          <td>${r.rowNumber}</td><td>${escapeHtml(r.code)}</td><td>${escapeHtml(r.tower || "")}</td>
          <td>${r.coefficient ?? ""}</td><td>${statusBadge(r.status, r.classification)}</td>
          <td>${escapeHtml(r.classification)}</td>
          <td><button type="button" class="btn btn-ghost" data-edit="Units" data-row="${r.rowNumber}">Editar</button>
          <button type="button" class="btn btn-ghost" data-excl="Units" data-row="${r.rowNumber}" data-inc="${r.included}">${r.included ? "Excluir" : "Restaurar"}</button></td>
        </tr>${(r.issues || []).length ? `<tr class="pri-issue"><td colspan="7">${r.issues.map(escapeHtml).join(" · ")}</td></tr>` : ""}`).join("")}
      </tbody></table></div>
      <div class="pri-cards">${rows.map((r) => `<article class="pri-card"><header>${escapeHtml(r.code || "Sin codigo")} ${statusBadge(r.status, r.classification)}</header>
        <p>${escapeHtml((r.issues || []).join(" · ") || "Sin problemas")}</p>
        <button type="button" class="btn btn-secondary" data-edit="Units" data-row="${r.rowNumber}">Corregir</button></article>`).join("")}</div>`;
    } else if (activeTab === "owners") {
      const rows = filteredRows(preview.owners);
      html = `<div class="pri-table-wrap"><table class="pri-table"><thead><tr><th>Fila</th><th>ID</th><th>Nombre</th><th>Correo</th><th>Estado</th><th></th></tr></thead><tbody>
        ${rows.map((r) => `<tr class="${r.status === "Error" ? "is-error" : ""}">
          <td>${r.rowNumber}</td><td>${escapeHtml(r.identification || "")}</td>
          <td>${escapeHtml(r.displayName || `${r.firstName || ""} ${r.lastName || ""}`.trim())}</td>
          <td>${escapeHtml(r.email || "")}</td><td>${statusBadge(r.status, r.classification)}</td>
          <td><button type="button" class="btn btn-ghost" data-edit="Owners" data-row="${r.rowNumber}">Editar</button>
          <button type="button" class="btn btn-ghost" data-excl="Owners" data-row="${r.rowNumber}" data-inc="${r.included}">${r.included ? "Excluir" : "Restaurar"}</button></td>
        </tr>${(r.issues || []).length ? `<tr class="pri-issue"><td colspan="6">${r.issues.map(escapeHtml).join(" · ")}</td></tr>` : ""}`).join("")}
      </tbody></table></div>
      <div class="pri-cards">${rows.map((r) => `<article class="pri-card"><header>${escapeHtml(r.email || "Sin correo")} ${statusBadge(r.status, r.classification)}</header>
        <p>${escapeHtml((r.issues || []).join(" · ") || "Sin problemas")}</p>
        <button type="button" class="btn btn-secondary" data-edit="Owners" data-row="${r.rowNumber}">Corregir</button></article>`).join("")}</div>`;
    } else {
      const rows = filteredRows(preview.relations);
      html = `<div class="pri-table-wrap"><table class="pri-table"><thead><tr><th>Fila</th><th>Unidad</th><th>ID/Correo</th><th>%</th><th>Estado</th><th></th></tr></thead><tbody>
        ${rows.map((r) => `<tr class="${r.status === "Error" ? "is-error" : ""}">
          <td>${r.rowNumber}</td><td>${escapeHtml(r.unitCode || "")}</td>
          <td>${escapeHtml(r.identification || r.email || "")}</td>
          <td>${r.sharePercent ?? ""}</td><td>${statusBadge(r.status, r.classification)}</td>
          <td><button type="button" class="btn btn-ghost" data-edit="Relations" data-row="${r.rowNumber}">Editar</button>
          <button type="button" class="btn btn-ghost" data-excl="Relations" data-row="${r.rowNumber}" data-inc="${r.included}">${r.included ? "Excluir" : "Restaurar"}</button></td>
        </tr>${(r.issues || []).length ? `<tr class="pri-issue"><td colspan="6">${r.issues.map(escapeHtml).join(" · ")}</td></tr>` : ""}`).join("")}
      </tbody></table></div>
      <div class="pri-cards">${rows.map((r) => `<article class="pri-card"><header>${escapeHtml(r.unitCode || "?")} ↔ ${escapeHtml(r.email || r.identification || "")} ${statusBadge(r.status, r.classification)}</header>
        <p>${escapeHtml((r.issues || []).join(" · ") || "Sin problemas")}</p>
        <button type="button" class="btn btn-secondary" data-edit="Relations" data-row="${r.rowNumber}">Corregir</button></article>`).join("")}</div>`;
    }
    host.innerHTML = html;
    host.querySelectorAll("[data-edit]").forEach((btn) => {
      btn.addEventListener("click", () => openEdit(btn.getAttribute("data-edit"), Number(btn.getAttribute("data-row"))));
    });
    host.querySelectorAll("[data-excl]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const sheet = btn.getAttribute("data-excl");
        const rowNumber = Number(btn.getAttribute("data-row"));
        const included = btn.getAttribute("data-inc") !== "true";
        preview = await api(`/api/ph/${phId}/import/exclude-row`, {
          method: "POST",
          body: { sessionId: preview.sessionId, sheet, rowNumber, included }
        });
        renderPreview();
      });
    });
  }

  async function openEdit(sheet, rowNumber) {
    let row;
    if (sheet === "Units") row = preview.units.find((r) => r.rowNumber === rowNumber);
    else if (sheet === "Owners") row = preview.owners.find((r) => r.rowNumber === rowNumber);
    else row = preview.relations.find((r) => r.rowNumber === rowNumber);
    if (!row) return;

    const editDlg = document.createElement("dialog");
    editDlg.className = "ph-roster-edit-dialog";
    let fields = "";
    if (sheet === "Units") {
      fields = `
        <label>Codigo <input name="code" value="${escapeHtml(row.code || "")}" required /></label>
        <label>Torre <input name="tower" value="${escapeHtml(row.tower || "")}" /></label>
        <label>Piso <input name="floor" type="number" value="${row.floor ?? ""}" /></label>
        <label>Tipo <input name="unitType" value="${escapeHtml(row.unitType || "")}" /></label>
        <label>Coeficiente <input name="coefficient" type="number" step="0.0001" value="${row.coefficient ?? ""}" /></label>
        <label>Estado <input name="estado" value="${escapeHtml(row.estado || "Activa")}" /></label>`;
    } else if (sheet === "Owners") {
      fields = `
        <label>Tipo ID <input name="idType" value="${escapeHtml(row.idType || "")}" /></label>
        <label>Identificacion <input name="identification" value="${escapeHtml(row.identification || "")}" /></label>
        <label>Nombres <input name="firstName" value="${escapeHtml(row.firstName || "")}" /></label>
        <label>Apellidos <input name="lastName" value="${escapeHtml(row.lastName || "")}" /></label>
        <label>Nombre completo / razon social <input name="displayName" value="${escapeHtml(row.displayName || "")}" /></label>
        <label>Correo <input name="email" type="email" value="${escapeHtml(row.email || "")}" required /></label>
        <label>Telefono <input name="phone" value="${escapeHtml(row.phone || "")}" /></label>
        <label>Estado <input name="estado" value="${escapeHtml(row.estado || "Borrador")}" /></label>`;
    } else {
      fields = `
        <label>Identificacion <input name="identification" value="${escapeHtml(row.identification || "")}" /></label>
        <label>Correo <input name="email" value="${escapeHtml(row.email || "")}" /></label>
        <label>Codigo unidad <input name="unitCode" value="${escapeHtml(row.unitCode || "")}" required /></label>
        <label>% propiedad <input name="sharePercent" type="number" step="0.0001" value="${row.sharePercent ?? 100}" /></label>
        <label>Estado <input name="estado" value="${escapeHtml(row.estado || "Activa")}" /></label>`;
    }
    editDlg.innerHTML = `<form method="dialog" class="panel"><h3>Corregir fila ${rowNumber}</h3><div class="form-grid">${fields}</div>
      <div class="cta-row"><button type="submit" class="btn btn-primary">Guardar</button>
      <button type="button" class="btn btn-secondary" data-close>Cancelar</button></div></form>`;
    document.body.appendChild(editDlg);
    editDlg.showModal();
    editDlg.querySelector("[data-close]").addEventListener("click", () => { editDlg.close(); editDlg.remove(); });
    editDlg.querySelector("form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const bodyReq = { sessionId: preview.sessionId, sheet, rowNumber };
      for (const [k, v] of fd.entries()) {
        if (v === "") continue;
        if (k === "floor" || k === "coefficient" || k === "sharePercent") bodyReq[k] = Number(v);
        else bodyReq[k] = String(v);
      }
      try {
        preview = await api(`/api/ph/${phId}/import/patch-row`, { method: "POST", body: bodyReq });
        editDlg.close();
        editDlg.remove();
        renderPreview();
      } catch (err) {
        AppFeedback.fromError(err);
      }
    });
  }

  async function onNext() {
    try {
      if (step === 1) {
        const ok = dialog.querySelector('[data-pri="confirm-ph"]')?.checked;
        if (!ok) {
          AppFeedback.warning("Confirme que el PH es el correcto.", { title: "Confirmacion" });
          return;
        }
        step = 2;
        render();
        return;
      }
      if (step === 2) {
        const file = body.querySelector('[data-pri="file"]')?.files?.[0];
        if (!file) {
          AppFeedback.warning("Seleccione un archivo.", { title: "Archivo" });
          return;
        }
        mode = body.querySelector('[data-pri="mode"]')?.value || "CreateOnly";
        showGlobalLoader("Validando archivo…");
        await ensureAntiforgery();
        const fd = new FormData();
        fd.append("file", file);
        const token = await ensureAntiforgery();
        const response = await fetch(`/api/ph/${phId}/import/analyze`, {
          method: "POST",
          credentials: "same-origin",
          headers: { RequestVerificationToken: token },
          body: fd
        });
        const payload = await response.json().catch(() => ({}));
        hideGlobalLoader();
        if (!response.ok) {
          throw new Error(payload.detail || payload.title || "No se pudo validar el archivo.");
        }
        preview = payload;
        step = 3;
        render();
        return;
      }
      if (step === 3) {
        const confirmed = body.querySelector('[data-pri="confirm-name"]')?.checked;
        if (!confirmed) {
          AppFeedback.warning("Confirme el nombre del PH antes de importar.", { title: "Confirmacion" });
          return;
        }
        if (mode === "CreateAndUpdate") {
          const ok = await confirmDialog({
            title: "Crear y actualizar",
            body: "Se actualizaran unidades y propietarios existentes. Los coeficientes e historial de asambleas finalizadas no se recalcularan. Continuar?",
            confirmLabel: "Si, actualizar",
            cancelLabel: "Cancelar"
          });
          if (!ok) return;
        }
        showGlobalLoader("Importando…");
        const result = await api(`/api/ph/${phId}/import/commit`, {
          method: "POST",
          body: {
            sessionId: preview.sessionId,
            mode,
            confirmUpdate: mode === "CreateAndUpdate",
            clientRequestId,
            confirmPhName: preview.phName || phName
          }
        });
        hideGlobalLoader();
        AppFeedback.success(
          `Unidades +${result.unitsCreated} (act. ${result.unitsUpdated}), propietarios +${result.ownersCreated} (act. ${result.ownersUpdated}), relaciones +${result.ownershipsCreated}.`,
          { title: result.idempotentReplay ? "Importacion (reintento)" : "Importacion completada" }
        );
        close();
        if (typeof onImported === "function") await onImported(result);
      }
    } catch (err) {
      forceHideGlobalLoader();
      AppFeedback.fromError(err);
    }
  }

  render();
}