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
let currentPh = null;
let importSession = null;
let suggestedMappings = [];
let editingOwnerId = null;

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
    location.href = "/";
    return;
  }

  $("#user-chip").textContent = user.displayName || user.email;
  $("#nav-tenant").textContent = user.tenantCode || "Gobernanza";
  $("#btn-logout").addEventListener("click", async () => {
    await logout();
    location.href = "/";
  });

  try {
    const { resolveDefaultAssemblyId, dashboardHref } = await import("./assembly-context.js");
    const aid = await resolveDefaultAssemblyId();
    const panel = document.querySelector("#nav-dashboard, .app-nav a[href='/dashboard.html'], .app-nav a[href^='/dashboard.html']");
    if (panel) panel.setAttribute("href", dashboardHref(aid));
  } catch {
    /* ignore */
  }

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
  $("#btn-deactivate-ph").addEventListener("click", onDeactivatePh);
  $("#btn-reactivate-ph").addEventListener("click", onReactivatePh);
  $("#btn-delete-ph").addEventListener("click", onDeletePh);

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
  $("#form-transfer")?.addEventListener("submit", onTransferOwnership);
  $("#btn-cancel-transfer")?.addEventListener("click", () => {
    const dlg = $("#transfer-dialog");
    if (dlg) dlg.hidden = true;
  });

  $("#btn-new-owner").addEventListener("click", () => startOwnerCreate());
  $("#btn-empty-add-owner")?.addEventListener("click", () => startOwnerCreate());
  $("#btn-cancel-owner")?.addEventListener("click", () => {
    editingOwnerId = null;
    $("#form-owner").reset();
    $("#owner-form-wrap").hidden = true;
  });
  $("#btn-goto-import")?.addEventListener("click", () => switchTab("import"));
  $("#btn-empty-import")?.addEventListener("click", () => switchTab("import"));
  $("#form-owner").addEventListener("submit", onSaveOwner);
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
      <article class="ph-card" data-id="${p.id}">
        <h3>${escapeHtml(p.name)}</h3>
        <div class="meta">
          <span>${p.unitCount} unidades · ${p.ownerCount} propietarios</span>
          <span class="badge">${escapeHtml(p.status)}</span>
        </div>
        <div class="cta-row">
          <button type="button" class="btn btn-primary" data-view="${p.id}">Ver</button>
          <button type="button" class="btn btn-secondary" data-edit="${p.id}">Editar</button>
          <button type="button" class="btn btn-secondary" data-more="${p.id}" aria-haspopup="true">•••</button>
        </div>
        <div class="ph-more-menu" id="more-${p.id}" hidden>
          ${
            p.status === "Inactive"
              ? `<button type="button" data-reactivate="${p.id}">Reactivar</button>`
              : `<button type="button" data-deactivate="${p.id}">Desactivar</button>`
          }
          <button type="button" data-delete="${p.id}">Eliminar…</button>
        </div>
      </article>`
    )
    .join("");
  root.querySelectorAll("[data-view], [data-edit]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      openPh(btn.dataset.view || btn.dataset.edit).then(() => {
        if (btn.dataset.edit) switchTab("info");
      });
    });
  });
  root.querySelectorAll("[data-more]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const menu = $(`#more-${btn.dataset.more}`);
      menu.hidden = !menu.hidden;
    });
  });
  root.querySelectorAll("[data-deactivate]").forEach((btn) =>
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      currentPhId = btn.dataset.deactivate;
      await onDeactivatePh();
      await loadList();
    })
  );
  root.querySelectorAll("[data-reactivate]").forEach((btn) =>
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      currentPhId = btn.dataset.reactivate;
      await onReactivatePh();
      await loadList();
    })
  );
  root.querySelectorAll("[data-delete]").forEach((btn) =>
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      currentPhId = btn.dataset.delete;
      await onDeletePh();
      await loadList();
    })
  );
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
  currentPh = ph;
  $("#view-list").hidden = true;
  $("#view-detail").hidden = false;
  $("#ph-title").textContent = ph.name;
  $("#ph-meta").innerHTML = `<span>${escapeHtml(ph.code)}</span><span class="badge">${escapeHtml(ph.status)}</span><span>Paso ${ph.onboardingStep}/8</span>`;
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
  if (form.concurrencyStamp) form.concurrencyStamp.value = ph.concurrencyStamp || "";
  const inactive = ph.status === "Inactive";
  $("#btn-deactivate-ph").hidden = inactive;
  $("#btn-reactivate-ph").hidden = !inactive;
  $("#btn-mark-ready").disabled = inactive;
  $("#btn-activate-ph").disabled = inactive;
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

async function confirmAction(title, body, okLabel = "Confirmar") {
  $("#dlg-confirm-title").textContent = title;
  $("#dlg-confirm-body").textContent = body;
  $("#dlg-confirm-ok").textContent = okLabel;
  const dlg = $("#dlg-confirm-action");
  dlg.showModal();
  return new Promise((resolve) => {
    dlg.addEventListener(
      "close",
      () => resolve(dlg.returnValue === "ok"),
      { once: true }
    );
  });
}

async function onDeactivatePh() {
  if (!currentPhId) return;
  const ok = await confirmAction(
    "DESACTIVAR PH",
    "El PH dejará de estar disponible para operaciones nuevas. Su información histórica será preservada.",
    "Desactivar"
  );
  if (!ok) return;
  await api(`/api/ph/${currentPhId}/deactivate`, { method: "POST", body: {} });
  showAlert("PH desactivado.", "ok");
  if (!$("#view-detail").hidden) await openPh(currentPhId);
}

async function onReactivatePh() {
  if (!currentPhId) return;
  await api(`/api/ph/${currentPhId}/reactivate`, { method: "POST" });
  showAlert("PH reactivado.", "ok");
  if (!$("#view-detail").hidden) await openPh(currentPhId);
}

async function onDeletePh() {
  if (!currentPhId) return;
  const evaluation = await api(`/api/ph/${currentPhId}/delete-evaluation`);
  if (!evaluation.canHardDelete) {
    const ok = await confirmAction(
      evaluation.summary || "NO SE PUEDE ELIMINAR ESTE PH",
      `${(evaluation.blockingReasons || []).join(" ")} Puedes desactivarlo sin perder su historial.`,
      "Desactivar"
    );
    if (ok) await onDeactivatePh();
    return;
  }
  const ok = await confirmAction(
    "Eliminar PH",
    evaluation.summary || "Se eliminará este PH vacío de forma permanente.",
    "Eliminar"
  );
  if (!ok) return;
  try {
    await api(`/api/ph/${currentPhId}`, { method: "DELETE" });
    showAlert("PH eliminado.", "ok");
    currentPhId = null;
    $("#view-detail").hidden = true;
    $("#view-list").hidden = false;
    await loadList();
  } catch (err) {
    showAlert(err.message || String(err));
  }
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
      onboardingStep: 2,
      concurrencyStamp: data.concurrencyStamp || null
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
      (u) => `<tr data-unit-id="${u.id}" style="cursor:pointer">
      <td>${escapeHtml(u.code)}</td>
      <td>${escapeHtml(u.tower || "—")}</td>
      <td>${u.floor ?? "—"}</td>
      <td>${Number(u.coefficientPercent).toFixed(4)}%</td>
      <td>${u.isActive ? "Activa" : "Inactiva"}</td>
      <td><button type="button" class="btn btn-ghost" data-open-unit="${u.id}">Ver</button></td>
    </tr>`
    )
    .join("");
  tbody.querySelectorAll("[data-open-unit]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      showUnit(btn.dataset.openUnit);
    });
  });
  tbody.querySelectorAll("tr[data-unit-id]").forEach((tr) => {
    tr.addEventListener("click", () => showUnit(tr.dataset.unitId));
  });

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

async function showUnit(unitId) {
  const detail = await api(`/api/ph/${currentPhId}/units/${unitId}/ownerships`);
  const el = $("#unit-detail");
  el.hidden = false;
  const total = Number(detail.activeShareTotalPercent || 0);
  const statusLabel = detail.ownershipComplete
    ? `✓ Titularidad completa (${total.toFixed(2)}%)`
    : `⚠ Titularidad ${total.toFixed(2)}% — falta ${Number(detail.missingSharePercent || 0).toFixed(2)}%`;
  const active = (detail.owners || []).filter((o) => o.isActive);
  const history = (detail.owners || []).filter((o) => !o.isActive);
  el.innerHTML = `
    <h3>Unidad ${escapeHtml(detail.unitCode)}</h3>
    <p class="muted">Torre ${escapeHtml(detail.tower || "—")} · Piso ${detail.floor ?? "—"} · Coeficiente ${Number(detail.coefficientPercent).toFixed(4)}% · ${detail.isActive ? "Activa" : "Inactiva"}</p>
    <p><strong>${statusLabel}</strong></p>
    <h4>Propietarios activos</h4>
    <ul>${active.length
      ? active
          .map(
            (o) => `<li>
              <strong>${escapeHtml(o.ownerDisplayName)}</strong> · ${Number(o.sharePercent).toFixed(2)}%
              <span class="muted">${formatDate(o.effectiveFromUtc)} → actual</span>
              <button type="button" class="btn btn-secondary" data-transfer="${o.ownershipId}" data-unit="${detail.unitId}" data-owner-name="${escapeHtml(o.ownerDisplayName)}" data-unit-code="${escapeHtml(detail.unitCode)}">Transferir</button>
              <button type="button" class="btn btn-ghost" data-end-unit-own="${o.ownershipId}">Finalizar</button>
            </li>`
          )
          .join("")
      : "<li class='muted'>Sin titulares activos</li>"}</ul>
    <div class="cta-row">
      <button type="button" class="btn btn-primary" id="btn-add-coowner" data-unit="${detail.unitId}">+ Agregar copropietario</button>
    </div>
    <h4>Historial</h4>
    <ul>${history.length
      ? history
          .map(
            (o) => `<li class="muted">${escapeHtml(o.ownerDisplayName)} · ${Number(o.sharePercent).toFixed(2)}% · ${formatDate(o.effectiveFromUtc)} → ${formatDate(o.effectiveToUtc)}</li>`
          )
          .join("")
      : "<li class='muted'>Sin cambios previos</li>"}</ul>`;

  el.querySelectorAll("[data-transfer]").forEach((btn) => {
    btn.addEventListener("click", () => openTransferDialog(btn.dataset));
  });
  el.querySelectorAll("[data-end-unit-own]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("¿Finalizar esta titularidad?")) return;
      await api(`/api/ph/${currentPhId}/ownerships/${btn.dataset.endUnitOwn}/end`, { method: "POST" });
      showAlert("Titularidad finalizada.", "ok");
      await showUnit(unitId);
      await loadOwners();
    });
  });
  el.querySelector("#btn-add-coowner")?.addEventListener("click", () => {
    startOwnerCreate();
    const select = $("#owner-unit-select");
    if (select) select.value = unitId;
    switchTab("owners");
    showAlert("Selecciona o crea el propietario y confirma la participación %.", "ok");
  });
}

function formatDate(iso) {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("es-PA", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(iso));
  } catch {
    return String(iso).slice(0, 10);
  }
}

async function openTransferDialog(dataset) {
  const owners = await api(`/api/ph/${currentPhId}/owners?status=Active`).catch(() => api(`/api/ph/${currentPhId}/owners`));
  const list = Array.isArray(owners) ? owners : owners?.items || [];
  const select = $("#transfer-owner-select");
  select.innerHTML = list
    .map((o) => `<option value="${o.id}">${escapeHtml(o.displayName || o.email)}</option>`)
    .join("");
  const form = $("#form-transfer");
  form.fromOwnershipId.value = dataset.transfer;
  form.unitId.value = dataset.unit;
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  form.effectiveFrom.value = tomorrow.toISOString().slice(0, 10);
  $("#transfer-summary").textContent = `Unidad ${dataset.unitCode || ""} · Actual: ${dataset.ownerName || ""}`;
  const dlg = $("#transfer-dialog");
  dlg.hidden = false;
  dlg.style.display = "grid";
}

async function onTransferOwnership(ev) {
  ev.preventDefault();
  const data = formData(ev.target);
  const effective = data.effectiveFrom
    ? new Date(`${data.effectiveFrom}T12:00:00`).toISOString()
    : null;
  const result = await api(`/api/ph/${currentPhId}/ownerships/transfer`, {
    method: "POST",
    body: {
      fromOwnershipId: data.fromOwnershipId,
      toOwnerId: data.toOwnerId,
      effectiveFromUtc: effective,
      reason: data.reason || null
    }
  });
  const dlg = $("#transfer-dialog");
  dlg.hidden = true;
  dlg.style.display = "none";
  showAlert(
    `Transferencia OK: ${result.fromOwnerName} → ${result.toOwnerName} (unidad ${result.unitCode}).`,
    "ok"
  );
  await showUnit(result.unitId);
  await loadOwners();
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
      <td><span class="badge">${escapeHtml(o.status)}</span></td>
      <td>
        <button type="button" class="btn btn-secondary" data-owner="${o.id}">Ver</button>
        <button type="button" class="btn btn-secondary" data-edit-owner="${o.id}">Editar</button>
        <button type="button" class="btn btn-secondary" data-invite="${o.id}">Invitar</button>
      </td>
    </tr>`
    )
    .join("");
  tbody.querySelectorAll("[data-owner]").forEach((btn) =>
    btn.addEventListener("click", () => showOwner(btn.dataset.owner))
  );
  tbody.querySelectorAll("[data-edit-owner]").forEach((btn) =>
    btn.addEventListener("click", () => startOwnerEdit(btn.dataset.editOwner))
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

function startOwnerCreate() {
  editingOwnerId = null;
  const form = $("#form-owner");
  form.reset();
  form.ownerId.value = "";
  form.concurrencyStamp.value = "";
  form.sharePercent.value = "100";
  $("#btn-save-owner").textContent = "Guardar propietario";
  $("#owner-form-wrap").hidden = false;
  form.firstName.focus();
}

async function startOwnerEdit(ownerId) {
  const o = await api(`/api/ph/${currentPhId}/owners/${ownerId}`);
  editingOwnerId = ownerId;
  const form = $("#form-owner");
  form.ownerId.value = o.id;
  form.concurrencyStamp.value = o.concurrencyStamp || "";
  form.firstName.value = o.firstName || "";
  form.lastName.value = o.lastName || "";
  form.identificationType.value = o.identificationType || "";
  form.identification.value = o.identification || "";
  form.email.value = o.email || "";
  form.phone.value = o.phone || "";
  form.unitId.value = "";
  $("#btn-save-owner").textContent = "Guardar cambios";
  $("#owner-form-wrap").hidden = false;
  await showOwner(ownerId);
}

async function onSaveOwner(ev) {
  ev.preventDefault();
  const data = formData(ev.target);
  if (editingOwnerId) {
    await api(`/api/ph/${currentPhId}/owners/${editingOwnerId}`, {
      method: "PUT",
      body: {
        firstName: data.firstName || null,
        lastName: data.lastName || null,
        identificationType: data.identificationType || null,
        identification: data.identification || null,
        email: data.email,
        phone: data.phone || null,
        concurrencyStamp: data.concurrencyStamp || null
      }
    });
    if (data.unitId) {
      await api(`/api/ph/${currentPhId}/ownerships`, {
        method: "POST",
        body: {
          ownerId: editingOwnerId,
          unitId: data.unitId,
          sharePercent: Number(data.sharePercent || 100)
        }
      });
    }
    showAlert("Propietario actualizado.", "ok");
  } else {
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
        sharePercent: data.unitId ? Number(data.sharePercent || 100) : null
      }
    });
    showAlert("Propietario creado.", "ok");
  }
  editingOwnerId = null;
  ev.target.reset();
  $("#owner-form-wrap").hidden = true;
  await loadOwners();
}

async function showOwner(ownerId) {
  const o = await api(`/api/ph/${currentPhId}/owners/${ownerId}`);
  const el = $("#owner-detail");
  el.hidden = false;
  const inactive = o.status === "Inactive";
  el.innerHTML = `
    <h3>${escapeHtml(o.displayName)}</h3>
    <p><span class="badge">${escapeHtml(o.status)}</span> · ${escapeHtml(o.email)} · ${escapeHtml(o.phone || "sin teléfono")}</p>
    <h4>Unidades</h4>
    <ul>${(o.units || [])
      .map(
        (u) =>
          `<li>${escapeHtml(u.unitCode)} — coef ${Number(u.unitCoefficientPercent).toFixed(4)}% · share ${Number(u.sharePercent).toFixed(2)}% · ${u.isActive ? "activo" : "histórico"}
          ${u.isActive ? `<button type="button" class="btn btn-secondary" data-end-own="${u.ownershipId}">Finalizar</button>` : ""}</li>`
      )
      .join("") || "<li>Sin unidades</li>"}</ul>
    <div class="cta-row">
      <button type="button" class="btn btn-primary" data-assoc-unit="${o.id}">+ Asociar unidad</button>
      <button type="button" class="btn btn-secondary" data-edit-owner="${o.id}">Editar</button>
      ${
        inactive
          ? `<button type="button" class="btn btn-primary" data-reactivate-owner="${o.id}">Reactivar</button>`
          : `<button type="button" class="btn btn-secondary" data-deactivate-owner="${o.id}">Desactivar</button>`
      }
      <button type="button" class="btn btn-secondary" data-delete-owner="${o.id}">Eliminar…</button>
    </div>`;
  el.querySelectorAll("[data-assoc-unit]").forEach((btn) => {
    btn.addEventListener("click", () => {
      editingOwnerId = btn.dataset.assocUnit;
      $("#owner-form-wrap").hidden = false;
      $("#btn-save-owner").textContent = "Asociar unidad";
      showAlert("Elige una unidad y el % de participación, luego guarda.", "ok");
      $("#owner-unit-select")?.focus();
    });
  });
  el.querySelectorAll("[data-edit-owner]").forEach((btn) =>
    btn.addEventListener("click", () => startOwnerEdit(btn.dataset.editOwner))
  );
  el.querySelectorAll("[data-deactivate-owner]").forEach((btn) =>
    btn.addEventListener("click", () => deactivateOwner(btn.dataset.deactivateOwner))
  );
  el.querySelectorAll("[data-reactivate-owner]").forEach((btn) =>
    btn.addEventListener("click", () => reactivateOwner(btn.dataset.reactivateOwner))
  );
  el.querySelectorAll("[data-delete-owner]").forEach((btn) =>
    btn.addEventListener("click", () => deleteOwner(btn.dataset.deleteOwner))
  );
  el.querySelectorAll("[data-end-own]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      await api(`/api/ph/${currentPhId}/ownerships/${btn.dataset.endOwn}/end`, { method: "POST" });
      showAlert("Relación finalizada (histórico preservado).", "ok");
      await showOwner(ownerId);
      await loadOwners();
    })
  );
}

async function deactivateOwner(ownerId) {
  const ok = await confirmAction(
    "DESACTIVAR PROPIETARIO",
    "El propietario dejará de ser elegible para nuevas asambleas. El historial se preserva.",
    "Desactivar"
  );
  if (!ok) return;
  await api(`/api/ph/${currentPhId}/owners/${ownerId}/deactivate`, { method: "POST", body: {} });
  showAlert("Propietario desactivado.", "ok");
  await loadOwners();
  await showOwner(ownerId);
}

async function reactivateOwner(ownerId) {
  await api(`/api/ph/${currentPhId}/owners/${ownerId}/reactivate`, { method: "POST" });
  showAlert("Propietario reactivado. Vuelve a asociar unidades si es necesario.", "ok");
  await loadOwners();
  await showOwner(ownerId);
}

async function deleteOwner(ownerId) {
  const evaluation = await api(`/api/ph/${currentPhId}/owners/${ownerId}/delete-evaluation`);
  if (!evaluation.canHardDelete) {
    const ok = await confirmAction(
      evaluation.summary || "NO SE PUEDE ELIMINAR ESTE PROPIETARIO",
      `${(evaluation.blockingReasons || []).join(" ")} Puedes desactivarlo sin perder el historial.`,
      "Desactivar"
    );
    if (ok) await deactivateOwner(ownerId);
    return;
  }
  const ok = await confirmAction(
    "Eliminar propietario",
    evaluation.summary || "Se eliminará este propietario sin historial.",
    "Eliminar"
  );
  if (!ok) return;
  try {
    await api(`/api/ph/${currentPhId}/owners/${ownerId}`, { method: "DELETE" });
    showAlert("Propietario eliminado.", "ok");
    $("#owner-detail").hidden = true;
    await loadOwners();
  } catch (err) {
    showAlert(err.message || String(err));
  }
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
