import { api } from "./api.js";
import { coefficientRollupCopy } from "./coefficient-rollup.js";
import { hasPermission } from "./auth.js";
import { confirmDialog, notify } from "./ui.js?v=cancel-label1";
import { AppFeedback } from "./app-feedback.js";
import { runWithButton } from "./loading.js";
import { bindSheetViewport, createQueryGuard, rememberOpener, restoreOpener, trapFocus, wireSheetKeyboard, applyTestHooks, lockPageScroll } from "./query-guard.js?v=polish9b";

/**
 * Premium units hub for /ph.html#units — reuses /api/ph/* endpoints.
 * @param {object} ctx getters/setters shared with ph-app
 */
export function createUnitsHub(ctx) {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  let filter = "all";
  let cache = [];
  let ownerByUnit = new Map();
  let modalMode = "view"; // view | create | edit
  let modalTab = "info";
  let currentDetail = null;
  let currentUnitId = null;
  let busy = false;
  let loadedPhId = null;
  let listState = "idle";
  let lastOpener = null;
  let unitUntrap = null;
  let unitUnbindKeyboard = null;
  const query = createQueryGuard();

  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function fmtCoef(n) {
    const v = Number(n);
    if (!Number.isFinite(v)) return "0";
    return String(Math.round(v));
  }

  function canManage() {
    return ctx.canAdministerCurrentPh() || hasPermission(ctx.user, "unit:manage") || hasPermission(ctx.user, "owner:manage");
  }

  function formData(form) {
    return Object.fromEntries(new FormData(form).entries());
  }

  async function refreshCoeffBanner() {
    const el = $("#units-coeff-banner");
    if (!el || !ctx.currentPhId) return;
    try {
      const c = await api(`/api/ph/${ctx.currentPhId}/coefficients`);
      const rollup = coefficientRollupCopy(c);
      el.className = `units-coeff-banner is-${rollup.tone === "ok" ? "ok" : rollup.tone}`;
      el.textContent = `${rollup.text} Este aviso es el padrón del PH, no el quórum de una asamblea.`;
    } catch {
      el.textContent = "";
    }
  }

  async function loadOwnerHints(units) {
    ownerByUnit = new Map();
    if (!ctx.currentPhId || !units.length) return;
    try {
      const owners = await api(`/api/ph/${ctx.currentPhId}/owners`, { dedupeKey: `ph-owners-hint:${ctx.currentPhId}` });
      for (const o of owners || []) {
        for (const code of o.unitCodes || []) {
          // map by code for display; filled after we have unit ids
        }
        // Prefer matching via unit codes later
        for (const u of units) {
          if ((o.unitCodes || []).includes(u.code)) {
            const list = ownerByUnit.get(u.id) || [];
            list.push(o.displayName || o.email || "Propietario");
            ownerByUnit.set(u.id, list);
          }
        }
      }
    } catch {
      /* optional enrichment */
    }
  }

  function applyFilter(units) {
    const q = ($("#unit-search")?.value || "").trim().toLowerCase();
    return units.filter((u) => {
      if (q) {
        const hay = `${u.code} ${u.tower || ""} ${u.floor ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      const owners = ownerByUnit.get(u.id) || [];
      if (filter === "active") return !!u.isActive;
      if (filter === "inactive") return !u.isActive;
      if (filter === "with-owner") return owners.length > 0;
      if (filter === "without-owner") return owners.length === 0;
      return true;
    });
  }

  function closeMenus() {
    $$(".unit-row-menu").forEach((m) => (m.hidden = true));
  }

  function announce(msg) {
    const el = $("#units-status");
    if (!el) return;
    el.textContent = "";
    requestAnimationFrame(() => {
      el.textContent = msg || "";
    });
  }

  function setUnitsUi(state, { message } = {}) {
    listState = state;
    const skel = $("#units-skeleton");
    const empty = $("#units-empty");
    const wrap = $(".units-table-wrap");
    const cards = $("#units-cards");
    const err = $("#units-error");
    const count = $("#units-result-count");
    if (skel) skel.hidden = state !== "loading";
    if (err) err.hidden = state !== "error";
    if (empty) empty.hidden = state !== "empty";
    if (wrap) {
      wrap.hidden = state === "loading" || state === "empty" || state === "error";
      wrap.classList.toggle("is-busy", state === "filtering");
    }
    if (cards) {
      cards.hidden = state === "loading" || state === "empty" || state === "error";
      cards.classList.toggle("is-busy", state === "filtering");
    }
    if (count && state !== "ready" && state !== "filtering") {
      count.textContent = "";
    }
    if (state === "loading") announce(message || "Cargando unidades");
    if (state === "error") announce(message || "No se pudieron cargar las unidades");
  }

  function reset() {
    cache = [];
    ownerByUnit = new Map();
    loadedPhId = null;
    query.next();
    const tbody = $("#units-table tbody");
    if (tbody) tbody.innerHTML = "";
    const cards = $("#units-cards");
    if (cards) cards.innerHTML = "";
    setUnitsUi("loading", { message: "Cargando unidades" });
  }

  function renderList() {
    if (listState === "error") return;
    const units = applyFilter(cache);
    const tbody = $("#units-table tbody");
    const cards = $("#units-cards");
    const empty = $("#units-empty");
    const wrap = $(".units-table-wrap");
    const count = $("#units-result-count");
    if (count) count.textContent = `${units.length} resultado${units.length === 1 ? "" : "s"}`;

    if (!cache.length) {
      setUnitsUi("empty");
      announce("No hay unidades en esta propiedad");
      return;
    }
    setUnitsUi("ready");
    if (empty) empty.hidden = true;
    if (wrap) wrap.hidden = false;
    if (cards) cards.hidden = false;

    if (!tbody) return;
    if (!units.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="muted" style="text-align:center;padding:1.25rem">Ninguna unidad coincide con los filtros.</td></tr>`;
      if (cards) cards.innerHTML = `<p class="muted" style="text-align:center">Ninguna unidad coincide con los filtros.</p>`;
      return;
    }

    tbody.innerHTML = units
      .map((u) => {
        const owners = ownerByUnit.get(u.id) || [];
        const shown = owners.slice(0, 2);
        const extra = owners.length - shown.length;
        const ownerLabel = owners.length
          ? `<div class="assoc-chip-row">${shown
              .map((n) => `<span class="assoc-chip" title="${esc(n)}">${esc(n)}</span>`)
              .join("")}${
              extra > 0
                ? `<span class="assoc-chip assoc-chip--more" title="${esc(owners.slice(2).join(", "))}">+${extra} más</span>`
                : ""
            }</div>
            <div class="muted" style="font-size:0.78rem;margin-top:0.2rem">${owners.length} propietario${owners.length === 1 ? "" : "s"}</div>`
          : '<span class="muted">Sin propietario</span>';
        const inactive = u.isActive ? "" : " is-inactive";
        return `<tr class="unit-row${inactive}" data-unit-id="${u.id}" tabindex="0">
          <td><strong>${esc(u.code)}</strong></td>
          <td>${esc(u.tower || "—")}</td>
          <td>${u.floor ?? "—"}</td>
          <td>${ownerLabel}</td>
          <td>${fmtCoef(u.coefficientPercent)} %</td>
          <td><span class="unit-status ${u.isActive ? "is-on" : "is-off"}">${u.isActive ? "Activa" : "Inactiva"}</span></td>
          <td class="unit-actions-cell" onclick="event.stopPropagation()">
            <div class="unit-actions">
              <button type="button" class="btn btn-outline-secondary btn-sm" data-manage-unit="${u.id}">Gestionar</button>
              <button type="button" class="btn btn-ghost btn-icon" data-unit-menu="${u.id}" aria-label="Más acciones" aria-haspopup="menu">•••</button>
              <div class="unit-row-menu" data-menu-for="${u.id}" hidden role="menu">
                <button type="button" role="menuitem" data-act="details" data-unit="${u.id}">Ver detalles</button>
                <button type="button" role="menuitem" data-act="edit" data-unit="${u.id}">Editar unidad</button>
                <button type="button" role="menuitem" data-act="assign" data-unit="${u.id}">Administrar propietarios</button>
                <button type="button" role="menuitem" data-act="edit-owner" data-unit="${u.id}">Editar propietario</button>
                <button type="button" role="menuitem" data-act="change-owner" data-unit="${u.id}">Agregar copropietario</button>
                <button type="button" role="menuitem" data-act="unlink" data-unit="${u.id}">Desvincular propietario</button>
                <button type="button" role="menuitem" data-act="toggle" data-unit="${u.id}">${u.isActive ? "Desactivar unidad" : "Activar unidad"}</button>
                <button type="button" role="menuitem" data-act="delete" data-unit="${u.id}" class="is-danger">Eliminar unidad</button>
              </div>
            </div>
          </td>
        </tr>`;
      })
      .join("");

    if (cards) {
      cards.innerHTML = units
        .map((u) => {
          const owners = ownerByUnit.get(u.id) || [];
          const shown = owners.slice(0, 2);
          const extra = owners.length - shown.length;
          return `<article class="unit-card${!u.isActive ? " is-inactive" : ""}" data-unit-id="${u.id}">
            <div class="unit-card__top">
              <strong>${esc(u.code)}</strong>
              <span class="unit-status ${u.isActive ? "is-on" : "is-off"}">${u.isActive ? "Activa" : "Inactiva"}</span>
            </div>
            <div class="assoc-chip-row" style="margin:0.4rem 0">
              ${
                owners.length
                  ? shown.map((n) => `<span class="assoc-chip">${esc(n)}</span>`).join("") +
                    (extra > 0 ? `<span class="assoc-chip assoc-chip--more">+${extra}</span>` : "")
                  : `<span class="muted">Sin propietario</span>`
              }
            </div>
            <p class="muted">${fmtCoef(u.coefficientPercent)} % · ${owners.length} propietario${owners.length === 1 ? "" : "s"}</p>
            <button type="button" class="btn btn-outline-secondary" data-manage-unit="${u.id}">Gestionar</button>
          </article>`;
        })
        .join("");
    }

    wireRowEvents();
  }

  function wireRowEvents() {
    $$("#units-table tbody tr[data-unit-id], .unit-card[data-unit-id]").forEach((el) => {
      el.addEventListener("click", () => openUnitModal(el.dataset.unitId, "view"));
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openUnitModal(el.dataset.unitId, "view");
        }
      });
    });
    $$("[data-manage-unit]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        openUnitModal(btn.dataset.manageUnit, "view");
      });
    });
    $$("[data-unit-menu]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = btn.dataset.unitMenu;
        closeMenus();
        const menu = $(`[data-menu-for="${id}"]`);
        if (menu) menu.hidden = !menu.hidden;
      });
    });
    $$("[data-act]").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        closeMenus();
        await handleAction(btn.dataset.act, btn.dataset.unit);
      });
    });
  }

  async function handleAction(act, unitId) {
    if (act === "details" || act === "edit") return openUnitModal(unitId, act === "edit" ? "edit" : "view", "info");
    if (act === "assign") return openUnitModal(unitId, "view", "owner");
    if (act === "edit-owner" || act === "change-owner" || act === "unlink") return openUnitModal(unitId, "view", "owner");
    if (act === "toggle") return toggleUnit(unitId);
    if (act === "delete") return deleteUnit(unitId);
  }

  async function toggleUnit(unitId) {
    const u = cache.find((x) => x.id === unitId);
    if (!u) return;
    const next = !u.isActive;
    const ok = await confirmDialog({
      title: next ? "Activar unidad" : "Desactivar unidad",
      body: next
        ? "La unidad volverá a participar en nuevas operaciones del PH."
        : "La unidad permanecerá en el historial y no participará en nuevas operaciones. Indica el motivo si aplica.",
      confirmLabel: next ? "Activar" : "Desactivar",
      danger: !next
    });
    if (!ok) return;
    try {
      await api(`/api/ph/${ctx.currentPhId}/units/${unitId}/active`, { method: "POST", body: { isActive: next } });
      notify.success(next ? "La unidad fue activada." : "La unidad fue desactivada.", { title: "Unidad" });
      await loadUnits({ force: true });
      if (currentUnitId === unitId) await openUnitModal(unitId, "view", modalTab);
    } catch (err) {
      AppFeedback.fromError(err);
    }
  }

  async function deleteUnit(unitId) {
    try {
      const ev = await api(`/api/ph/${ctx.currentPhId}/units/${unitId}/delete-evaluation`);
      if (!ev.canHardDelete) {
        await confirmDialog({
          title: "No se puede eliminar",
          body: `${ev.summary || ""}\n${(ev.blockingReasons || []).join(" ")}\n\nPuedes desactivarla para conservarla en el historial.`,
          confirmLabel: "Entendido",
          danger: false
        });
        return;
      }
      const ok = await confirmDialog({
        title: "Eliminar unidad",
        body: "Esta acción es irreversible. La unidad no tiene actividad histórica y se borrará permanentemente.",
        confirmLabel: "Eliminar",
        danger: true
      });
      if (!ok) return;
      await api(`/api/ph/${ctx.currentPhId}/units/${unitId}`, { method: "DELETE" });
      notify.success("La unidad fue eliminada.", { title: "Unidad eliminada" });
      closeUnitModal();
      await loadUnits({ force: true });
      await refreshCoeffBanner();
    } catch (err) {
      AppFeedback.fromError(err);
    }
  }

  function setTab(tab) {
    modalTab = tab;
    $$("#dlg-unit-hub [data-unit-tab]").forEach((b) => {
      const on = b.dataset.unitTab === tab;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    });
  }

  function syncModalTabs() {
    const saved = modalMode !== "create" && !!currentUnitId;
    const tabs = $("#dlg-unit-hub .unit-hub__tabs");
    const dlg = $("#dlg-unit-hub");
    if (tabs) tabs.hidden = !saved;
    dlg?.classList.toggle("is-create", !saved);
    $$("#dlg-unit-hub [data-unit-tab]").forEach((b) => {
      if (b.dataset.unitTab === "info") {
        b.hidden = false;
        return;
      }
      b.hidden = !saved;
    });
  }

  async function openUnitModal(unitId, mode = "view", tab = "info") {
    const dlg = $("#dlg-unit-hub");
    if (!dlg) return;
    if (dlg.parentElement !== document.body) {
      document.body.appendChild(dlg);
    }
    lastOpener = rememberOpener();
    const bulk = $("#bulk-form-wrap");
    const legacy = $("#unit-form-wrap");
    if (bulk) bulk.hidden = true;
    if (legacy) legacy.hidden = true;
    modalMode = mode;
    currentUnitId = unitId || null;
    setTab(tab);
    syncModalTabs();
    lockPageScroll(true);
    const token = query.next();

    if (mode === "create" || !unitId) {
      currentDetail = null;
      $("#unit-hub-title").textContent = "Nueva unidad";
      $("#unit-hub-eyebrow").textContent = "Crear";
      renderCreateForm();
      try { dlg.showModal(); } catch (_) { dlg.setAttribute("open", ""); }
      bindSheetViewport(dlg);
      unitUntrap?.();
      unitUnbindKeyboard?.();
      unitUntrap = trapFocus(dlg);
      unitUnbindKeyboard = wireSheetKeyboard(dlg);
      requestAnimationFrame(() => requestAnimationFrame(() => $("#form-unit-hub input[name='code']")?.focus()));
      return;
    }

    $("#unit-hub-title").textContent = "Unidad";
    $("#unit-hub-eyebrow").textContent = "Cargando";
    $("#unit-hub-body").innerHTML = `<p class="muted">Cargando ficha de la unidad…</p>`;
    $("#unit-hub-foot").innerHTML = `<button type="button" class="btn btn-secondary" id="unit-hub-cancel-load">Cerrar</button>`;
    $("#unit-hub-cancel-load")?.addEventListener("click", () => closeUnitModal());
    try { dlg.showModal(); } catch (_) { dlg.setAttribute("open", ""); }
    bindSheetViewport(dlg);
    unitUntrap?.();
    unitUnbindKeyboard?.();
    unitUntrap = trapFocus(dlg);
    unitUnbindKeyboard = wireSheetKeyboard(dlg);
    $("#unit-hub-title")?.focus?.({ preventScroll: true });

    try {
      await applyTestHooks();
      currentDetail = await api(`/api/ph/${ctx.currentPhId}/units/${unitId}/ownerships`);
      if (!query.isCurrent(token)) return;
      $("#unit-hub-title").textContent = `Unidad ${currentDetail.unitCode}`;
      $("#unit-hub-eyebrow").textContent = currentDetail.isActive ? "Activa" : "Inactiva";
      renderModalBody();
    } catch (err) {
      if (!query.isCurrent(token)) return;
      $("#unit-hub-title").textContent = "Unidad no encontrada";
      $("#unit-hub-eyebrow").textContent = "No disponible";
      $("#unit-hub-body").innerHTML = `<p>Esta unidad ya no está en el PH o no se pudo cargar. Cierra para volver a la lista.</p>`;
      $("#unit-hub-foot").innerHTML = `<button type="button" class="btn btn-primary" id="unit-hub-missing-close">Volver a la lista</button>`;
      $("#unit-hub-missing-close")?.addEventListener("click", () => closeUnitModal());
      AppFeedback.fromError(err, "No pudimos abrir esta unidad.");
    }
  }

  function closeUnitModal() {
    const dlg = $("#dlg-unit-hub");
    if (dlg?.open) dlg.close();
    currentUnitId = null;
    currentDetail = null;
  }

  function suggestNextUnitCode() {
    const taken = new Set((cache || []).map((u) => String(u.code || "").toUpperCase()));
    for (let n = 1; n <= 99999; n++) {
      const candidate = `U-${String(n).padStart(3, "0")}`;
      if (!taken.has(candidate)) return candidate;
    }
    return `U-${Date.now().toString().slice(-6)}`;
  }

  function renderCreateForm() {
    const body = $("#unit-hub-body");
    const foot = $("#unit-hub-foot");
    const suggested = suggestNextUnitCode();
    body.innerHTML = `
      <form id="form-unit-hub" class="unit-hub-form">
        <div class="form-grid">
          <label><span>Código <span class="req" aria-hidden="true">*</span></span> <input name="code" required maxlength="64" value="${esc(suggested)}" autofocus aria-describedby="unit-code-hint" /></label>
          <p id="unit-code-hint" class="muted" style="grid-column:1/-1;margin:0">Se sugiere automáticamente; puedes editarlo antes de crear.</p>
          <label>Torre <input name="tower" maxlength="64" /></label>
          <label>Piso <input name="floor" type="number" /></label>
          <label>Tipo <input name="unitType" maxlength="64" /></label>
          <label><span>Coeficiente % <span class="req" aria-hidden="true">*</span></span> <input name="coefficientPercent" type="number" step="1" min="0" max="100" required aria-describedby="unit-hub-inline-error" /></label>
          <label class="check"><input type="checkbox" name="isActive" checked /> Unidad activa</label>
        </div>
        <p id="unit-hub-inline-error" class="field-error" hidden role="alert"></p>
      </form>`;
    foot.innerHTML = `
      <button type="button" class="btn btn-secondary" data-close-hub>Cancelar</button>
      <button type="submit" form="form-unit-hub" class="btn btn-primary" id="btn-save-unit-hub">Crear unidad</button>`;
    $("#form-unit-hub").addEventListener("submit", onSaveUnit);
    $("[data-close-hub]", foot)?.addEventListener("click", closeUnitModal);
    $("#form-unit-hub input[name='code']")?.focus();
  }

  function renderModalBody() {
    const d = currentDetail;
    const body = $("#unit-hub-body");
    const foot = $("#unit-hub-foot");
    const active = (d.owners || []).filter((o) => o.isActive);
    const history = (d.owners || []).filter((o) => !o.isActive);
    if (modalTab === "info") {
      body.innerHTML = `
        <form id="form-unit-hub" class="unit-hub-form">
          <div class="form-grid">
            <label>Código <input name="code" required value="${esc(d.unitCode)}" ${canManage() ? "" : "readonly"} aria-describedby="unit-edit-code-hint" /></label>
            ${canManage() ? `<p id="unit-edit-code-hint" class="muted" style="grid-column:1/-1;margin:0">Puedes editar el código si hace falta.</p>` : `<p id="unit-edit-code-hint" class="muted" style="grid-column:1/-1;margin:0">Solo lectura.</p>`}
            <label>Torre <input name="tower" value="${esc(d.tower || "")}" ${canManage() ? "" : "readonly"} /></label>
            <label>Piso <input name="floor" type="number" value="${d.floor ?? ""}" ${canManage() ? "" : "readonly"} /></label>
            <label>Tipo <input name="unitType" value="${esc(d.unitType || "")}" ${canManage() ? "" : "readonly"} /></label>
            <label>Coeficiente % <input name="coefficientPercent" type="number" step="1" min="0" max="100" required value="${Math.round(Number(d.coefficientPercent))}" ${canManage() ? "" : "readonly"} /></label>
            <label class="check"><input type="checkbox" name="isActive" ${d.isActive ? "checked" : ""} ${canManage() ? "" : "disabled"} /> Unidad activa</label>
          </div>
          <p class="muted unit-hub-meta">Creada: ${esc(fmtDate(d.createdAtUtc))} · Actualizada: ${esc(fmtDate(d.updatedAtUtc))}</p>
          <p class="units-coef-line">Coeficiente registrado: <strong>${fmtCoef(d.coefficientPercent)} %</strong></p>
          <p id="unit-hub-inline-error" class="field-error" hidden role="alert"></p>
        </form>`;
      foot.innerHTML = canManage()
        ? `<button type="button" class="btn btn-secondary" data-close-hub>Cerrar</button>
           <button type="submit" form="form-unit-hub" class="btn btn-primary" id="btn-save-unit-hub">Guardar cambios</button>`
        : `<button type="button" class="btn btn-secondary" data-close-hub>Cerrar</button>`;
      $("#form-unit-hub")?.addEventListener("submit", onSaveUnit);
    } else if (modalTab === "owner") {
      const shareTotal = active.reduce((s, o) => s + Number(o.sharePercent || 0), 0);
      if (!active.length) {
        body.innerHTML = `
          <div class="unit-owner-empty">
            <h3>Esta unidad todavía no tiene propietarios asignados</h3>
            <p class="muted">Puedes crear un propietario nuevo o vincular uno existente del mismo PH.</p>
            <div class="cta-row">
              <button type="button" class="btn btn-primary" data-owner-flow="create">Crear nuevo propietario</button>
              <button type="button" class="btn btn-secondary" data-owner-flow="link">Vincular propietario existente</button>
            </div>
            <div id="unit-owner-flow" hidden></div>
          </div>`;
      } else {
        body.innerHTML = `
          <div class="unit-owners-panel">
            <p class="muted">Titulares activos: <strong>${active.length}</strong> · Participación total: <strong>${fmtCoef(shareTotal)} %</strong></p>
            <ul class="unit-owner-list">
              ${active
                .map((o) => {
                  const others = (o.otherUnitCodesInPh || []).join(", ") || "—";
                  return `<li class="unit-owner-card">
                <h3>${esc(o.ownerDisplayName)}</h3>
                <dl class="unit-dl">
                  <div><dt>Identificación</dt><dd>${esc(o.ownerIdentification || "—")}</dd></div>
                  <div><dt>Correo</dt><dd>${esc(o.ownerEmail || "—")}</dd></div>
                  <div><dt>Teléfono</dt><dd>${esc(o.ownerPhone || "—")}</dd></div>
                  <div><dt>Estado</dt><dd>${esc(o.ownerStatus || "—")}</dd></div>
                  <div><dt>Vinculación</dt><dd>${esc(fmtDate(o.effectiveFromUtc))}</dd></div>
                  <div><dt>Otras unidades en este PH</dt><dd>${esc(others)}</dd></div>
                  <div><dt>Participación en la unidad</dt><dd>${fmtCoef(o.sharePercent)} %</dd></div>
                </dl>
                <div class="cta-row">
                  <button type="button" class="btn btn-secondary" data-owner-flow="edit" data-owner-id="${o.ownerId}">Editar</button>
                  <button type="button" class="btn btn-secondary" data-owner-flow="change" data-ownership-id="${o.ownershipId}">Transferir</button>
                  <button type="button" class="btn btn-ghost" data-owner-flow="unlink" data-ownership-id="${o.ownershipId}">Desvincular</button>
                </div>
              </li>`;
                })
                .join("")}
            </ul>
            ${
              canManage()
                ? `<div class="cta-row" style="margin-top:0.75rem">
              <button type="button" class="btn btn-primary" data-owner-flow="create">+ Agregar copropietario</button>
              <button type="button" class="btn btn-secondary" data-owner-flow="link">Vincular existente</button>
            </div>`
                : ""
            }
            <div id="unit-owner-flow" hidden></div>
          </div>`;
      }
      foot.innerHTML = `<button type="button" class="btn btn-secondary" data-close-hub>Cerrar</button>`;
      wireOwnerFlows();
    } else {
      body.innerHTML = `
        <h3>Historial de propietarios</h3>
        <ul class="unit-history">${history.length ? history.map((o) =>
          `<li><strong>${esc(o.ownerDisplayName)}</strong> · ${fmtCoef(o.sharePercent)} % · ${esc(fmtDate(o.effectiveFromUtc))} → ${esc(fmtDate(o.effectiveToUtc))}</li>`
        ).join("") : "<li class='muted'>Sin cambios previos</li>"}</ul>
        <h3 style="margin-top:1rem">Titulares activos</h3>
        <ul class="unit-history">${active.length ? active.map((o) =>
          `<li><strong>${esc(o.ownerDisplayName)}</strong> · ${fmtCoef(o.sharePercent)} % · desde ${esc(fmtDate(o.effectiveFromUtc))}</li>`
        ).join("") : "<li class='muted'>Sin titulares activos</li>"}</ul>`;
      foot.innerHTML = `<button type="button" class="btn btn-secondary" data-close-hub>Cerrar</button>`;
    }
    $("[data-close-hub]", foot)?.addEventListener("click", closeUnitModal);
  }

  function fmtDate(iso) {
    if (!iso) return "—";
    try {
      return new Intl.DateTimeFormat("es-PA", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(iso));
    } catch {
      return String(iso).slice(0, 10);
    }
  }

  async function onSaveUnit(ev) {
    ev.preventDefault();
    if (busy) return;
    busy = true;
    const err = $("#unit-hub-inline-error");
    if (err) { err.hidden = true; err.textContent = ""; }
    const coefInput = ev.target.querySelector("[name='coefficientPercent']");
    if (coefInput) coefInput.setAttribute("aria-invalid", "false");
    const data = formData(ev.target);
    const coef = Number(data.coefficientPercent);
    if (!(coef >= 0) || coef > 100) {
      if (err) { err.hidden = false; err.textContent = "El coeficiente debe estar entre 0 y 100 %."; }
      if (coefInput) {
        coefInput.setAttribute("aria-invalid", "true");
        coefInput.focus();
      }
      busy = false;
      return;
    }
    const btn = $("#btn-save-unit-hub");
    if (btn) btn.disabled = true;
    const body = {
      code: (data.code || "").trim() || null,
      tower: data.tower || null,
      floor: data.floor === "" || data.floor == null ? null : Number(data.floor),
      unitType: data.unitType || null,
      coefficientPercent: coef,
      isActive: data.isActive === "on" || data.isActive === true || data.isActive === "true"
    };
    try {
      await runWithButton(btn, currentUnitId ? "Guardando…" : "Creando…", async () => {
        await applyTestHooks();
        if (!currentUnitId) {
          await api(`/api/ph/${ctx.currentPhId}/units`, { method: "POST", body });
          notify.success("La unidad fue creada correctamente.", { title: "Unidad creada" });
        } else {
          await api(`/api/ph/${ctx.currentPhId}/units/${currentUnitId}`, { method: "PUT", body });
          notify.success("Los cambios fueron guardados.", { title: "Unidad actualizada" });
        }
        await loadUnits({ force: true });
        await refreshCoeffBanner();
        closeUnitModal();
      });
    } catch (ex) {
      if (err) { err.hidden = false; err.textContent = ex?.message || "No se pudo guardar."; }
      else AppFeedback.fromError(ex);
    } finally {
      busy = false;
    }
  }

  function wireOwnerFlows() {
    $$("[data-owner-flow]").forEach((btn) => {
      btn.addEventListener("click", () => runOwnerFlow(btn.dataset.ownerFlow, btn.dataset));
    });
  }

  async function runOwnerFlow(flow, dataset) {
    const slot = $("#unit-owner-flow");
    if (!slot) return;
    if (flow === "unlink") {
      const ok = await confirmDialog({
        title: "Desvincular propietario",
        body: "Esta acción modificará el propietario vigente de la unidad, pero no alterará asambleas, votos ni evidencias históricas.",
        confirmLabel: "Desvincular",
        danger: true
      });
      if (!ok) return;
      try {
        await api(`/api/ph/${ctx.currentPhId}/ownerships/${dataset.ownershipId}/end`, { method: "POST" });
        notify.success("El propietario fue desvinculado de la unidad.", { title: "Desvinculación" });
        await loadUnits({ force: true });
        await openUnitModal(currentUnitId, "view", "owner");
      } catch (err) {
        AppFeedback.fromError(err);
      }
      return;
    }

    if (flow === "change") {
      const owners = await api(`/api/ph/${ctx.currentPhId}/owners?status=Active`).catch(() => api(`/api/ph/${ctx.currentPhId}/owners`));
      const list = Array.isArray(owners) ? owners : [];
      slot.hidden = false;
      slot.innerHTML = `
        <form id="form-change-owner" class="unit-hub-form" style="margin-top:1rem">
          <p class="muted">Esta acción modificará el propietario vigente de la unidad, pero no alterará asambleas, votos ni evidencias históricas.</p>
          <label>Nuevo propietario
            <select name="toOwnerId" required>${list.map((o) => `<option value="${o.id}">${esc(o.displayName || o.email)}</option>`).join("")}</select>
          </label>
          <label>Fecha efectiva <input name="effectiveFrom" type="date" required /></label>
          <label>Motivo (opcional) <input name="reason" maxlength="512" /></label>
          <div class="cta-row">
            <button type="submit" class="btn btn-primary">Confirmar cambio</button>
          </div>
        </form>`;
      const f = $("#form-change-owner");
      const t = new Date(); t.setDate(t.getDate() + 1);
      f.effectiveFrom.value = t.toISOString().slice(0, 10);
      f.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const data = formData(f);
        try {
          await api(`/api/ph/${ctx.currentPhId}/ownerships/transfer`, {
            method: "POST",
            body: {
              fromOwnershipId: dataset.ownershipId,
              toOwnerId: data.toOwnerId,
              effectiveFromUtc: new Date(`${data.effectiveFrom}T12:00:00`).toISOString(),
              reason: data.reason || null
            }
          });
          notify.success("El propietario fue vinculado a la unidad.", { title: "Cambio de propietario" });
          await loadUnits({ force: true });
          await openUnitModal(currentUnitId, "view", "owner");
        } catch (err) {
          AppFeedback.fromError(err);
        }
      });
      return;
    }

    if (flow === "create") {
      slot.hidden = false;
      slot.innerHTML = `
        <form id="form-create-owner-unit" class="unit-hub-form" style="margin-top:1rem">
          <div class="form-grid">
            <label>Nombre <input name="firstName" required /></label>
            <label>Apellido <input name="lastName" /></label>
            <label>Tipo ID <input name="identificationType" placeholder="Cédula / RUC / Pasaporte" /></label>
            <label>Identificación <input name="identification" /></label>
            <label>Correo <input name="email" type="email" required /></label>
            <label>Teléfono <input name="phone" /></label>
            <label>% titularidad <input name="sharePercent" type="number" step="1" min="1" max="100" value="100" /></label>
          </div>
          <p id="create-owner-err" class="field-error" hidden></p>
          <div class="cta-row"><button type="submit" class="btn btn-primary">Crear y vincular</button></div>
        </form>`;
      $("#form-create-owner-unit").addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const data = formData(ev.target);
        const err = $("#create-owner-err");
        try {
          await api(`/api/ph/${ctx.currentPhId}/owners`, {
            method: "POST",
            body: {
              firstName: data.firstName,
              lastName: data.lastName || null,
              identificationType: data.identificationType || null,
              identification: data.identification || null,
              email: data.email,
              phone: data.phone || null,
              unitId: currentUnitId,
              sharePercent: Number(data.sharePercent || 100)
            }
          });
          notify.success("El propietario fue vinculado a la unidad.", { title: "Propietario creado" });
          await loadUnits({ force: true });
          await openUnitModal(currentUnitId, "view", "owner");
        } catch (ex) {
          if (err) { err.hidden = false; err.textContent = ex?.message || "No se pudo crear."; }
          else AppFeedback.fromError(ex);
        }
      });
      return;
    }

    if (flow === "link") {
      const owners = await api(`/api/ph/${ctx.currentPhId}/owners`);
      slot.hidden = false;
      slot.innerHTML = `
        <form id="form-link-owner" class="unit-hub-form" style="margin-top:1rem">
          <label>Buscar propietario
            <input type="search" id="link-owner-search" placeholder="Nombre, cédula, correo…" />
          </label>
          <label>Propietario
            <select name="ownerId" id="link-owner-select" required>
              ${(owners || []).map((o) => `<option value="${o.id}" data-hay="${esc((o.displayName||'')+' '+(o.identification||'')+' '+(o.email||'')+' '+(o.phone||'')).toLowerCase()}">${esc(o.displayName || o.email)} · ${esc(o.identification || "sin ID")}</option>`).join("")}
            </select>
          </label>
          <label>% titularidad <input name="sharePercent" type="number" step="1" value="100" min="1" max="100" /></label>
          <label>Fecha efectiva <input name="effectiveFrom" type="date" required /></label>
          <div class="cta-row"><button type="submit" class="btn btn-primary">Vincular</button></div>
        </form>`;
      const f = $("#form-link-owner");
      f.effectiveFrom.value = new Date().toISOString().slice(0, 10);
      $("#link-owner-search")?.addEventListener("input", (e) => {
        const q = e.target.value.toLowerCase();
        $$("#link-owner-select option").forEach((opt) => {
          opt.hidden = q && !(opt.dataset.hay || "").includes(q);
        });
      });
      f.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const data = formData(f);
        const owner = (owners || []).find((o) => o.id === data.ownerId);
        const ok = await confirmDialog({
          title: "Confirmar vinculación",
          body: `Propietario: ${owner?.displayName || data.ownerId}\nUnidad: ${currentDetail?.unitCode}\nPH: ${ctx.currentPh?.name || ""}\nFecha efectiva: ${data.effectiveFrom}`,
          confirmLabel: "Vincular"
        });
        if (!ok) return;
        try {
          await api(`/api/ph/${ctx.currentPhId}/ownerships`, {
            method: "POST",
            body: {
              ownerId: data.ownerId,
              unitId: currentUnitId,
              sharePercent: Number(data.sharePercent || 100),
              effectiveFromUtc: new Date(`${data.effectiveFrom}T12:00:00`).toISOString()
            }
          });
          notify.success("El propietario fue vinculado a la unidad.", { title: "Vinculación" });
          await loadUnits({ force: true });
          await openUnitModal(currentUnitId, "view", "owner");
        } catch (err) {
          AppFeedback.fromError(err);
        }
      });
      return;
    }

    if (flow === "edit") {
      try {
        const o = await api(`/api/ph/${ctx.currentPhId}/owners/${dataset.ownerId}`);
        slot.hidden = false;
        slot.innerHTML = `
          <form id="form-edit-owner-unit" class="unit-hub-form" style="margin-top:1rem">
            <input type="hidden" name="concurrencyStamp" value="${esc(o.concurrencyStamp || "")}" />
            <div class="form-grid">
              <label>Nombre <input name="firstName" value="${esc(o.firstName || "")}" /></label>
              <label>Apellido <input name="lastName" value="${esc(o.lastName || "")}" /></label>
              <label>Nombre completo <input name="displayName" value="${esc(o.displayName || "")}" /></label>
              <label>Tipo ID <input name="identificationType" value="${esc(o.identificationType || "")}" /></label>
              <label>Identificación <input name="identification" value="${esc(o.identification || "")}" /></label>
              <label>Correo <input name="email" type="email" required value="${esc(o.email || "")}" /></label>
              <label>Teléfono <input name="phone" value="${esc(o.phone || "")}" /></label>
            </div>
            <div class="cta-row"><button type="submit" class="btn btn-primary">Guardar propietario</button></div>
          </form>`;
        $("#form-edit-owner-unit").addEventListener("submit", async (ev) => {
          ev.preventDefault();
          const data = formData(ev.target);
          try {
            await api(`/api/ph/${ctx.currentPhId}/owners/${dataset.ownerId}`, {
              method: "PUT",
              body: {
                firstName: data.firstName || null,
                lastName: data.lastName || null,
                displayName: data.displayName || null,
                identificationType: data.identificationType || null,
                identification: data.identification || null,
                email: data.email,
                phone: data.phone || null,
                concurrencyStamp: data.concurrencyStamp || null
              }
            });
            notify.success("Los cambios fueron guardados.", { title: "Propietario" });
            await loadUnits({ force: true });
            await openUnitModal(currentUnitId, "view", "owner");
          } catch (err) {
            AppFeedback.fromError(err);
          }
        });
      } catch (err) {
        AppFeedback.fromError(err);
      }
    }
  }

  async function loadUnits({ soft = false, force = false } = {}) {
    const phId = ctx.currentPhId;
    if (!phId) return;
    const token = query.next();
    const search = ($("#unit-search")?.value || "").trim();
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (filter === "active") params.set("isActive", "true");
    if (filter === "inactive") params.set("isActive", "false");
    const q = params.toString() ? `?${params}` : "";
    const initial = loadedPhId !== phId || !cache.length;
    if (loadedPhId !== phId) {
      cache = [];
      loadedPhId = phId;
    }
    if (initial) setUnitsUi("loading", { message: "Cargando unidades" });
    else setUnitsUi("filtering");
    try {
      if (!force && soft && !search && filter === "all" && ctx.isPhTabFresh?.("units") && cache.length) {
        if (!query.isCurrent(token) || ctx.currentPhId !== phId) return;
        renderList();
        return;
      }
      await query.testHooks();
      const rows = await api(`/api/ph/${phId}/units${q}`, { dedupeKey: `ph-units:${phId}:${q}` });
      if (!query.isCurrent(token) || ctx.currentPhId !== phId) return;
      cache = rows || [];
      if (!search && filter === "all") ctx.markPhTabFresh?.("units");
      await loadOwnerHints(cache);
      if (!query.isCurrent(token) || ctx.currentPhId !== phId) return;
      renderList();
      announce(`${cache.length} unidad${cache.length === 1 ? "" : "es"}`);
      await refreshCoeffBanner();

      const select = $("#owner-unit-select");
      if (select) {
        const current = select.value;
        select.innerHTML =
          `<option value="">— asociar después —</option>` +
          cache.map((u) => `<option value="${u.id}">${esc(u.code)}</option>`).join("");
        select.value = current;
      }
    } catch (err) {
      if (!query.isCurrent(token) || ctx.currentPhId !== phId) return;
      const copy = $("#units-error-copy");
      if (copy) copy.textContent = err?.message || "No se pudieron cargar las unidades.";
      setUnitsUi("error");
    }
  }

  function wire() {
    const table = $("#units-table");
    if (table && !table.dataset.unitsTableDelegated) {
      table.dataset.unitsTableDelegated = "1";
      table.addEventListener("click", (e) => {
        const manage = e.target.closest("[data-manage-unit]");
        if (manage) {
          e.preventDefault();
          e.stopPropagation();
          openUnitModal(manage.dataset.manageUnit, "view");
          return;
        }
        const menuBtn = e.target.closest("[data-unit-menu]");
        if (menuBtn) {
          e.preventDefault();
          e.stopPropagation();
          closeMenus();
          const menu = document.querySelector(`[data-menu-for="${menuBtn.dataset.unitMenu}"]`);
          if (menu) menu.hidden = !menu.hidden;
          return;
        }
        const act = e.target.closest("[data-act]");
        if (act) {
          e.preventDefault();
          e.stopPropagation();
          closeMenus();
          handleAction(act.dataset.act, act.dataset.unit);
          return;
        }
        const row = e.target.closest("tr[data-unit-id]");
        if (row && !e.target.closest(".unit-actions-cell")) {
          openUnitModal(row.dataset.unitId, "view");
        }
      });
    }
    $("#btn-new-unit")?.addEventListener("click", () => openUnitModal(null, "create"));
    $("#btn-empty-new-unit")?.addEventListener("click", () => openUnitModal(null, "create"));
    $("#btn-units-retry")?.addEventListener("click", () => loadUnits({ force: true }));
    $("#unit-hub-close")?.addEventListener("click", closeUnitModal);
    $("#dlg-unit-hub")?.addEventListener("close", () => {
      unitUntrap?.();
      unitUnbindKeyboard?.();
      unitUntrap = null;
      unitUnbindKeyboard = null;
      lockPageScroll(false);
      restoreOpener(lastOpener);
      lastOpener = null;
    });
    $("#dlg-unit-hub")?.addEventListener("click", (e) => {
      if (e.target === e.currentTarget) closeUnitModal();
    });
    $$("#dlg-unit-hub [data-unit-tab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (!currentDetail && modalMode !== "create") return;
        setTab(btn.dataset.unitTab);
        if (modalMode === "create") renderCreateForm();
        else renderModalBody();
      });
    });
    $$("[data-unit-filter]").forEach((btn) => {
      btn.addEventListener("click", () => {
        filter = btn.dataset.unitFilter;
        $$("[data-unit-filter]").forEach((b) => {
          const on = b === btn;
          b.classList.toggle("is-active", on);
          b.setAttribute("aria-pressed", on ? "true" : "false");
        });
        loadUnits({ force: true });
      });
    });
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".unit-actions")) closeMenus();
    });

    // PH admin menu (Tabler/Bootstrap dropdown owns open/close on .layout-tabler).
    const manageBtn = $("#btn-manage-ph");
    const menu = $("#ph-admin-menu");
    const tablerShell = document.body.classList.contains("layout-tabler");
    if (!tablerShell) {
      manageBtn?.addEventListener("click", () => {
        if (!menu) return;
        menu.hidden = !menu.hidden;
        manageBtn.setAttribute("aria-expanded", menu.hidden ? "false" : "true");
      });
      document.addEventListener("click", (e) => {
        if (!e.target.closest(".ph-admin-menu-wrap") && menu) {
          menu.hidden = true;
          manageBtn?.setAttribute("aria-expanded", "false");
        }
      });
    }
    $$("[data-ph-admin]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!tablerShell && menu) menu.hidden = true;
        const act = btn.dataset.phAdmin;
        if (act === "edit" || act === "edit-info") ctx.switchTab?.("info");
        else if (act === "coefficients") ctx.switchTab?.("coefficients");
        else if (act === "activate") $("#btn-activate-ph")?.click();
        else if (act === "ready") $("#btn-mark-ready")?.click();
        else if (act === "deactivate") $("#btn-archive-ph")?.click();
        else if (act === "reactivate") $("#btn-reactivate-ph")?.click();
        else if (act === "delete") $("#btn-delete-ph")?.click();
      });
    });
  }

  return { wire, loadUnits, reset, openUnitModal, refreshCoeffBanner, showUnit: (id) => openUnitModal(id, "view") };
}
