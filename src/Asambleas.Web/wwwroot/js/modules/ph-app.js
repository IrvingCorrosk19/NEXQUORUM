import { api, ensureAntiforgery } from "./api.js";
import { me, logout, hasPermission } from "./auth.js";

const STEP_LABELS = [
  "Información",
  "Estructura",
  "Unidades",
  "Propietarios",
  "Coeficientes",
  "Configuración",
  "Revisión",
  "Activar"
];

const SYSTEM_FIELDS = [
  ["UnitCode", "Unidad"],
  ["Tower", "Torre"],
  ["Floor", "Piso"],
  ["CoefficientPercent", "Coeficiente"],
  ["FirstName", "Nombre"],
  ["LastName", "Apellido"],
  ["Identification", "Identificación"],
  ["Email", "Email"],
  ["Phone", "Teléfono"]
];

let user = null;
let currentPhId = null;
let importSession = null;
let suggestedMappings = [];

const $ = (sel) => document.querySelector(sel);
const alertEl = $("#page-alert");

function showAlert(message, kind = "error") {
  alertEl.hidden = false;
  alertEl.textContent = message;
  alertEl.className = `alert alert-${kind === "error" ? "danger" : "success"}`;
}

function clearAlert() {
  alertEl.hidden = true;
}

function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

async function init() {
  try {
    user = await me();
  } catch {
    location.href = "/login.html";
    return;
  }

  $("#user-chip").textContent = user.displayName || user.email;
  $("#nav-tenant").textContent = user.tenantCode || "Gobernanza";
  $("#btn-logout").addEventListener("click", async () => {
    await logout();
    location.href = "/login.html";
  });

  if (!hasPermission(user, "ph:view")) {
    showAlert("No tienes permiso para administrar propiedades horizontales.");
    return;
  }

  wireUi();
  await refreshSwitcher();
  await loadList();

  const urlPh = new URLSearchParams(location.search).get("phId");
  if (urlPh) {
    await openPh(urlPh);
  }
}

function wireUi() {
  $("#btn-create-ph").addEventListener("click", () => $("#dlg-create-ph").showModal());
  $("#btn-create-first")?.addEventListener("click", () => $("#dlg-create-ph").showModal());
  $("#btn-cancel-create").addEventListener("click", () => $("#dlg-create-ph").close());
  $("#form-create-ph").addEventListener("submit", onCreatePh);
  $("#btn-continue-config")?.addEventListener("click", () => {
    $("#dlg-ph-created").close();
    if (currentPhId) {
      openPh(currentPhId).then(() => switchTab("units"));
    }
  });
  $("#btn-back-list").addEventListener("click", () => {
    currentPhId = null;
    $("#view-detail").hidden = true;
    $("#view-list").hidden = false;
    loadList();
  });
  $("#form-ph").addEventListener("submit", onSavePh);
  $("#btn-mark-ready").addEventListener("click", async () => {
    try {
      await api(`/api/ph/${currentPhId}/ready`, { method: "POST" });
      showAlert("PH marcado listo para asamblea.", "ok");
      await openPh(currentPhId);
    } catch (err) {
      showAlert(err.message || String(err));
      await loadReadiness();
    }
  });
  $("#btn-activate-ph").addEventListener("click", async () => {
    await api(`/api/ph/${currentPhId}/activate`, { method: "POST" });
    showAlert("PH activado.", "ok");
    await openPh(currentPhId);
  });

  document.querySelectorAll(".tabs button").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  $("#btn-new-unit").addEventListener("click", () => {
    $("#unit-form-wrap").hidden = false;
    $("#bulk-form-wrap").hidden = true;
  });
  $("#btn-bulk-units").addEventListener("click", () => {
    $("#bulk-form-wrap").hidden = false;
    $("#unit-form-wrap").hidden = true;
  });
  $("#form-unit").addEventListener("submit", onCreateUnit);
  $("#btn-bulk-preview").addEventListener("click", () => runBulk(true));
  $("#form-bulk").addEventListener("submit", (e) => {
    e.preventDefault();
    runBulk(false);
  });
  $("#unit-search").addEventListener("input", () => loadUnits());

  $("#btn-new-owner").addEventListener("click", () => {
    $("#owner-form-wrap").hidden = false;
  });
  $("#btn-empty-add-owner")?.addEventListener("click", () => {
    $("#owner-form-wrap").hidden = false;
  });
  $("#btn-goto-import")?.addEventListener("click", () => switchTab("import"));
  $("#btn-empty-import")?.addEventListener("click", () => switchTab("import"));
  $("#form-owner").addEventListener("submit", onCreateOwner);
  ["owner-search", "filter-tower", "filter-status", "filter-email", "filter-user", "filter-invited"].forEach((id) => {
    $(`#${id}`)?.addEventListener("change", () => loadOwners());
    $(`#${id}`)?.addEventListener("input", () => loadOwners());
  });
  $("#btn-export-owners")?.addEventListener("click", exportOwners);
  $("#btn-validate-owners")?.addEventListener("click", validateOwnersBulk);
  $("#btn-bulk-invite")?.addEventListener("click", bulkInvite);
  $("#owners-check-all")?.addEventListener("change", (e) => {
    document.querySelectorAll("#owners-table tbody input[type=checkbox]").forEach((cb) => {
      cb.checked = e.target.checked;
    });
  });

  $("#btn-analyze").addEventListener("click", analyzeImport);
  $("#btn-validate-import").addEventListener("click", validateImport);
  $("#btn-commit-import").addEventListener("click", commitImport);
  $("#ph-switch-select").addEventListener("change", onSwitchPh);
}

async function refreshSwitcher() {
  try {
    const memberships = await api("/api/ph/memberships/mine");
    const wrap = $("#ph-switcher");
    const select = $("#ph-switch-select");
    if (!memberships?.length) {
      wrap.hidden = true;
      return;
    }
    wrap.hidden = memberships.length < 2;
    select.innerHTML = memberships
      .map(
        (m) =>
          `<option value="${m.propertyHorizontalId}" ${m.isCurrent ? "selected" : ""}>${escapeHtml(m.name)}</option>`
      )
      .join("");
  } catch {
    $("#ph-switcher").hidden = true;
  }
}

async function onSwitchPh(ev) {
  const id = ev.target.value;
  await api("/api/ph/switch", { method: "POST", body: { propertyHorizontalId: id } });
  location.href = `/ph.html?phId=${id}`;
}

async function loadList() {
  clearAlert();
  const list = await api("/api/ph");
  const root = $("#ph-list");
  const empty = $("#ph-empty");
  if (!list.length) {
    empty.hidden = false;
    root.innerHTML = "";
    return;
  }
  empty.hidden = true;
  root.innerHTML = list
    .map(
      (p) => `
      <article class="ph-card" tabindex="0" data-id="${p.id}" role="button" aria-label="${escapeHtml(p.name)}">
        <h3>${escapeHtml(p.name)}</h3>
        <div class="meta">
          <span>${p.unitCount} unidades · ${p.ownerCount} propietarios · ${p.activeUserCount || 0} usuarios</span>
          <span>Coeficientes: ${Number(p.coefficientTotalPercent).toFixed(4)}% ${p.coefficientsComplete ? "✓" : ""}</span>
          <span>Estado: ${escapeHtml(p.status)}</span>
          ${p.nextAssemblyTitle ? `<span>Próxima: ${escapeHtml(p.nextAssemblyTitle)}</span>` : ""}
        </div>
      </article>`
    )
    .join("");
  root.querySelectorAll(".ph-card").forEach((card) => {
    card.addEventListener("click", () => openPh(card.dataset.id));
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter") openPh(card.dataset.id);
    });
  });
}

async function onCreatePh(ev) {
  ev.preventDefault();
  const data = formData(ev.target);
  const created = await api("/api/ph", {
    method: "POST",
    body: {
      name: data.name,
      legalName: data.legalName || null,
      code: data.code,
      country: data.country || null,
      stateProvince: data.stateProvince || null,
      city: data.city || null,
      address: data.address || null,
      timeZoneId: data.timeZoneId,
      adminEmail: data.adminEmail || null,
      phone: data.phone || null,
      organizationId: null
    }
  });
  $("#dlg-create-ph").close();
  await refreshSwitcher();
  currentPhId = created.id;
  $("#dlg-ph-created-name").textContent = created.name;
  $("#dlg-ph-created").showModal();
}

async function openPh(id) {
  clearAlert();
  currentPhId = id;
  const ph = await api(`/api/ph/${id}`);
  $("#view-list").hidden = true;
  $("#view-detail").hidden = false;
  $("#ph-title").textContent = ph.name;
  $("#ph-meta").innerHTML = `<span>${escapeHtml(ph.code)}</span><span>${escapeHtml(ph.status)}</span><span>Paso ${ph.onboardingStep}/8</span>`;
  renderSteps(ph.onboardingStep);
  const form = $("#form-ph");
  form.name.value = ph.name || "";
  form.legalName.value = ph.legalName || "";
  form.code.value = ph.code || "";
  form.country.value = ph.country || "";
  form.stateProvince.value = ph.stateProvince || "";
  form.city.value = ph.city || "";
  form.address.value = ph.address || "";
  form.timeZoneId.value = ph.timeZoneId || "";
  form.adminEmail.value = ph.adminEmail || "";
  form.phone.value = ph.phone || "";
  $("#btn-template").href = `/api/ph/${id}/import/template`;
  switchTab("info");
  await Promise.all([loadUnits(), loadOwners(), loadCoefficients(), loadReadiness()]);
}

function renderSteps(current) {
  const root = $("#wizard-steps");
  root.innerHTML = STEP_LABELS.map((label, i) => {
    const n = i + 1;
    const cls = n < current ? "is-done" : n === current ? "is-active" : "";
    const rail = i < STEP_LABELS.length - 1 ? `<span class="rail" aria-hidden="true"></span>` : "";
    return `<span class="step ${cls}"><span class="num">${n}</span> ${label}</span>${rail}`;
  }).join("");
}

function switchTab(tab) {
  document.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("is-active", b.dataset.tab === tab));
  document.querySelectorAll(".wizard-panel").forEach((p) => {
    p.hidden = p.dataset.panel !== tab;
  });
  if (tab === "coefficients") loadCoefficients();
  if (tab === "readiness") loadReadiness();
}

async function onSavePh(ev) {
  ev.preventDefault();
  const data = formData(ev.target);
  await api(`/api/ph/${currentPhId}`, {
    method: "PUT",
    body: {
      name: data.name,
      legalName: data.legalName || null,
      country: data.country || null,
      stateProvince: data.stateProvince || null,
      city: data.city || null,
      address: data.address || null,
      timeZoneId: data.timeZoneId,
      adminEmail: data.adminEmail || null,
      phone: data.phone || null,
      onboardingStep: 2
    }
  });
  showAlert("Información guardada.", "ok");
  await openPh(currentPhId);
}

async function loadUnits() {
  if (!currentPhId) return;
  const search = $("#unit-search").value.trim();
  const q = search ? `?search=${encodeURIComponent(search)}` : "";
  const units = await api(`/api/ph/${currentPhId}/units${q}`);
  const tbody = $("#units-table tbody");
  tbody.innerHTML = units
    .map(
      (u) => `<tr>
      <td>${escapeHtml(u.code)}</td>
      <td>${escapeHtml(u.tower || "—")}</td>
      <td>${u.floor ?? "—"}</td>
      <td>${Number(u.coefficientPercent).toFixed(4)}%</td>
      <td>${u.isActive ? "Activo" : "Inactivo"}</td>
    </tr>`
    )
    .join("");

  const select = $("#owner-unit-select");
  const current = select.value;
  select.innerHTML =
    `<option value="">— asociar después —</option>` +
    units.map((u) => `<option value="${u.id}">${escapeHtml(u.code)}</option>`).join("");
  select.value = current;

  const towerSelect = $("#filter-tower");
  if (towerSelect) {
    const towers = [...new Set(units.map((u) => u.tower).filter(Boolean))].sort();
    const prev = towerSelect.value;
    towerSelect.innerHTML = `<option value="">Torre</option>` + towers.map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join("");
    towerSelect.value = prev;
  }
}

async function onCreateUnit(ev) {
  ev.preventDefault();
  const data = formData(ev.target);
  await api(`/api/ph/${currentPhId}/units`, {
    method: "POST",
    body: {
      code: data.code,
      tower: data.tower || null,
      floor: data.floor === "" ? null : Number(data.floor),
      unitType: data.unitType || null,
      coefficientPercent: Number(data.coefficientPercent),
      isActive: true
    }
  });
  ev.target.reset();
  $("#unit-form-wrap").hidden = true;
  await loadUnits();
  await loadCoefficients();
}

async function runBulk(previewOnly) {
  const data = formData($("#form-bulk"));
  const body = {
    tower: data.tower || null,
    floorFrom: Number(data.floorFrom),
    floorTo: Number(data.floorTo),
    unitFrom: Number(data.unitFrom),
    unitTo: Number(data.unitTo),
    unitNumberPad: Number(data.unitNumberPad || 2),
    prefix: data.prefix || null,
    unitType: null,
    defaultCoefficientPercent: Number(data.defaultCoefficientPercent || 0),
    previewOnly
  };
  const result = await api(`/api/ph/${currentPhId}/units/bulk-generate`, { method: "POST", body });
  const pre = $("#bulk-preview");
  pre.hidden = false;
  pre.textContent = `Crearía: ${result.wouldCreate} · Omitidas: ${result.skippedExisting}\n` +
    (result.previewCodes || []).slice(0, 40).join("\n") +
    ((result.previewCodes?.length || 0) > 40 ? "\n…" : "");
  if (!previewOnly) {
    showAlert(`Unidades creadas: ${result.created?.length || 0}`, "ok");
    await loadUnits();
  }
}

async function loadOwners() {
  if (!currentPhId) return;
  const params = new URLSearchParams();
  const search = $("#owner-search")?.value.trim();
  if (search) params.set("search", search);
  const tower = $("#filter-tower")?.value;
  if (tower) params.set("tower", tower);
  const status = $("#filter-status")?.value;
  if (status) params.set("status", status);
  const hasEmail = $("#filter-email")?.value;
  if (hasEmail) params.set("hasEmail", hasEmail);
  const hasUser = $("#filter-user")?.value;
  if (hasUser) params.set("hasUser", hasUser);
  const invited = $("#filter-invited")?.value;
  if (invited) params.set("invited", invited);
  const q = params.toString() ? `?${params}` : "";
  const owners = await api(`/api/ph/${currentPhId}/owners${q}`);
  const empty = $("#owners-empty");
  const tableWrap = $("#owners-table")?.closest(".table-wrap");
  if (!owners.length && !search && !tower && !status && !hasEmail && !hasUser && !invited) {
    empty.hidden = false;
    if (tableWrap) tableWrap.hidden = true;
  } else {
    empty.hidden = true;
    if (tableWrap) tableWrap.hidden = false;
  }
  const tbody = $("#owners-table tbody");
  tbody.innerHTML = owners
    .map(
      (o) => `<tr>
      <td><input type="checkbox" value="${o.id}" aria-label="Seleccionar ${escapeHtml(o.displayName)}" /></td>
      <td>${escapeHtml(o.displayName)}</td>
      <td>${escapeHtml((o.unitCodes || []).join(", ") || "—")}</td>
      <td>${Number(o.coefficientPercent).toFixed(4)}%</td>
      <td>${escapeHtml(o.status)}</td>
      <td>
        <button type="button" class="btn btn-secondary" data-owner="${o.id}">Ver</button>
        <button type="button" class="btn btn-secondary" data-invite="${o.id}">Invitar</button>
      </td>
    </tr>`
    )
    .join("");
  tbody.querySelectorAll("[data-owner]").forEach((btn) =>
    btn.addEventListener("click", () => showOwner(btn.dataset.owner))
  );
  tbody.querySelectorAll("[data-invite]").forEach((btn) =>
    btn.addEventListener("click", () => inviteOwner(btn.dataset.invite))
  );
}

function ownerQueryString() {
  const params = new URLSearchParams();
  const search = $("#owner-search")?.value.trim();
  if (search) params.set("search", search);
  const tower = $("#filter-tower")?.value;
  if (tower) params.set("tower", tower);
  const status = $("#filter-status")?.value;
  if (status) params.set("status", status);
  const hasEmail = $("#filter-email")?.value;
  if (hasEmail) params.set("hasEmail", hasEmail);
  const hasUser = $("#filter-user")?.value;
  if (hasUser) params.set("hasUser", hasUser);
  const invited = $("#filter-invited")?.value;
  if (invited) params.set("invited", invited);
  const q = params.toString();
  return q ? `?${q}` : "";
}

async function exportOwners() {
  window.location.href = `/api/ph/${currentPhId}/owners/export${ownerQueryString()}`;
}

async function validateOwnersBulk() {
  const result = await api(`/api/ph/${currentPhId}/owners/validate-bulk`, { method: "POST" });
  showAlert(
    `Validación: ${result.ownerCount} propietarios. Sin email: ${result.withoutEmail}. Sin unidad: ${result.withoutUnit}. Sin usuario: ${result.withoutUser}. ${(result.issues || []).join(" ")}`,
    result.issues?.length ? "error" : "ok"
  );
}

async function bulkInvite() {
  const ids = [...document.querySelectorAll("#owners-table tbody input[type=checkbox]:checked")].map((cb) => cb.value);
  if (!ids.length) {
    showAlert("Selecciona al menos un propietario.");
    return;
  }
  if (!confirm(`¿Enviar invitaciones a ${ids.length} propietario(s)?`)) {
    return;
  }
  const result = await api(`/api/ph/${currentPhId}/owners/invite-bulk`, {
    method: "POST",
    body: { ownerIds: ids }
  });
  showAlert(`Invitaciones: enviadas ${result.sent}, vinculadas ${result.linkedExisting}, fallidas ${result.failed}.`, result.failed ? "error" : "ok");
  await loadOwners();
}

async function onCreateOwner(ev) {
  ev.preventDefault();
  const data = formData(ev.target);
  await api(`/api/ph/${currentPhId}/owners`, {
    method: "POST",
    body: {
      firstName: data.firstName || null,
      lastName: data.lastName || null,
      identificationType: data.identificationType || null,
      identification: data.identification || null,
      email: data.email,
      phone: data.phone || null,
      unitId: data.unitId || null,
      sharePercent: data.unitId ? 100 : null
    }
  });
  ev.target.reset();
  $("#owner-form-wrap").hidden = true;
  await loadOwners();
}

async function showOwner(ownerId) {
  const o = await api(`/api/ph/${currentPhId}/owners/${ownerId}`);
  const el = $("#owner-detail");
  el.hidden = false;
  el.innerHTML = `
    <h3>${escapeHtml(o.displayName)}</h3>
    <p>${escapeHtml(o.email)} · ${escapeHtml(o.phone || "sin teléfono")} · ${escapeHtml(o.status)}</p>
    <h4>Unidades</h4>
    <ul>${(o.units || [])
      .map(
        (u) =>
          `<li>${escapeHtml(u.unitCode)} — coef ${Number(u.unitCoefficientPercent).toFixed(4)}% · share ${Number(u.sharePercent).toFixed(2)}% · ${u.isActive ? "activo" : "histórico"}</li>`
      )
      .join("")}</ul>`;
}

async function inviteOwner(ownerId) {
  const result = await api(`/api/ph/${currentPhId}/owners/${ownerId}/invite`, { method: "POST" });
  if (result.existingUserLinked) {
    showAlert(`Usuario existente vinculado: ${result.email}`, "ok");
  } else {
    showAlert(`Invitación enviada a ${result.email}. Ruta: ${result.activationPath}`, "ok");
  }
  await loadOwners();
}

async function loadCoefficients() {
  if (!currentPhId) return;
  const c = await api(`/api/ph/${currentPhId}/coefficients`);
  $("#coeff-panel").innerHTML = `
    <p><strong>${Number(c.totalPercent).toFixed(4)}%</strong> / ${Number(c.expectedPercent).toFixed(4)}%</p>
    <p>${c.isComplete ? "✓ Coeficientes completos" : `⚠ Delta: ${Number(c.deltaPercent).toFixed(4)}%`}</p>
    <p>${escapeHtml(c.message)}</p>
    <p>${c.activeUnitCount} unidades activas</p>`;
}

async function loadReadiness() {
  if (!currentPhId) return;
  const r = await api(`/api/ph/${currentPhId}/readiness`);
  const bannerClass = r.readyForAssembly ? "is-ready" : "is-blocked";
  const bannerText = r.readyForAssembly ? "READY FOR ASSEMBLY" : "NO LISTO PARA ASAMBLEA";
  $("#readiness-panel").innerHTML = `
    <div class="readiness-banner ${bannerClass}" role="status">${bannerText}</div>
    <div class="row"><span>Información general</span><span>${r.generalInfoComplete ? "✓" : "○"}</span></div>
    <div class="row"><span>Unidades</span><span>${r.unitsComplete ? "✓" : "○"} ${r.unitCount}</span></div>
    <div class="row"><span>Propietarios</span><span>${r.ownersComplete ? "✓" : "○"} ${r.ownerCount}</span></div>
    <div class="row"><span>Coeficientes</span><span>${r.coefficients?.isComplete ? "✓" : "○"} ${Number(r.coefficients?.totalPercent || 0).toFixed(4)}%</span></div>
    <div class="row"><span>Usuarios invitados</span><span>${r.invitedUserCount}</span></div>
    <div class="row"><span>Configuración asamblea</span><span>${r.assemblyConfigComplete ? "✓" : "○"}</span></div>
    ${(r.blockingIssues || []).map((i) => `<p class="lede">${escapeHtml(i)}</p>`).join("")}`;
}

async function analyzeImport() {
  const file = $("#import-file").files?.[0];
  if (!file) {
    showAlert("Selecciona un archivo CSV o XLSX.");
    return;
  }
  await ensureAntiforgery();
  const fd = new FormData();
  fd.append("file", file);
  const token = await ensureAntiforgery();
  const response = await fetch(`/api/ph/${currentPhId}/import/analyze`, {
    method: "POST",
    credentials: "same-origin",
    headers: { RequestVerificationToken: token },
    body: fd
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.detail || "Error al analizar");
  }
  importSession = payload.sessionId;
  suggestedMappings = payload.suggestedMappings || [];
  const map = $("#import-map");
  map.hidden = false;
  map.innerHTML = SYSTEM_FIELDS.map(([field, label]) => {
    const suggested = suggestedMappings.find((m) => m.systemField === field)?.sourceColumn || "";
    const options = (payload.detectedColumns || [])
      .map((c) => `<option value="${escapeHtml(c)}" ${c === suggested ? "selected" : ""}>${escapeHtml(c)}</option>`)
      .join("");
    return `<div class="map-row"><span>${label}</span><select data-field="${field}"><option value="">—</option>${options}</select></div>`;
  }).join("");
  $("#import-actions").hidden = false;
  $("#import-preview").innerHTML = `<p>${payload.rowCount} filas detectadas. Mapea columnas y valida.</p>`;
}

function collectMappings() {
  return SYSTEM_FIELDS.map(([field]) => ({
    systemField: field,
    sourceColumn: $(`#import-map select[data-field="${field}"]`)?.value || null
  }));
}

async function validateImport() {
  const preview = await api(`/api/ph/${currentPhId}/import/validate`, {
    method: "POST",
    body: { sessionId: importSession, mappings: collectMappings() }
  });
  renderImportPreview(preview);
}

async function commitImport() {
  const result = await api(`/api/ph/${currentPhId}/import/commit`, {
    method: "POST",
    body: { sessionId: importSession, mappings: collectMappings() }
  });
  showAlert(
    `Importación OK — unidades ${result.unitsCreated}, propietarios ${result.ownersCreated}, ownerships ${result.ownershipsCreated}`,
    "ok"
  );
  await Promise.all([loadUnits(), loadOwners(), loadCoefficients(), loadReadiness()]);
}

function renderImportPreview(preview) {
  const errLink = $("#btn-import-errors");
  errLink.hidden = preview.errorRows === 0;
  errLink.href = `/api/ph/${currentPhId}/import/${preview.sessionId}/errors`;
  $("#import-preview").innerHTML = `
    <p><strong>${preview.totalRows}</strong> filas · ${preview.validRows} válidas · ${preview.warningRows} advertencias · ${preview.errorRows} errores</p>
    <ul>${(preview.issues || [])
      .slice(0, 30)
      .map(
        (i) =>
          `<li>[${escapeHtml(i.severity)}] Fila ${i.rowNumber} · ${escapeHtml(i.field)}: ${escapeHtml(i.problem)}</li>`
      )
      .join("")}</ul>`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

init().catch((err) => showAlert(err.message || String(err)));
