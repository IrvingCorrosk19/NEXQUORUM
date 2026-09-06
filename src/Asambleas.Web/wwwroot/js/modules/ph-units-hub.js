import { api } from "./api.js";
import { hasPermission } from "./auth.js";
import { confirmDialog, notify } from "./ui.js";
import { AppFeedback } from "./app-feedback.js";
import { runWithButton } from "./loading.js";

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

  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function fmtCoef(n) {
    const v = Number(n);
    if (!Number.isFinite(v)) return "0.000000";
    return v.toFixed(6);
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
      const total = Number(c.totalPercent || 0);
      const delta = Number(c.deltaPercent || 0);
      const ok = !!c.isComplete;
      let msg;
      if (ok) msg = `Coeficiente del PH completo: ${fmtCoef(total)} %. Listo para activación.`;
      else if (delta < 0) msg = `Total del PH: ${fmtCoef(total)} %. Falta ${fmtCoef(Math.abs(delta))} % para completar el PH.`;
      else msg = `Total del PH: ${fmtCoef(total)} %. Excede ${fmtCoef(delta)} % sobre 100 %.`;
      el.className = `units-coeff-banner ${ok ? "is-ok" : delta > 0 ? "is-over" : "is-short"}`;
      el.textContent = msg;
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

  function renderList() {
    const units = applyFilter(cache);
    const tbody = $("#units-table tbody");
    const cards = $("#units-cards");
    const empty = $("#units-empty");
    const wrap = $(".units-table-wrap");
    const count = $("#units-result-count");
    if (count) count.textContent = `${units.length} resultado${units.length === 1 ? "" : "s"}`;

    const noData = !cache.length;
    if (empty) empty.hidden = !noData;
    if (wrap) wrap.hidden = noData;
    if (cards) cards.hidden = noData;

    if (!tbody) return;
    if (!units.length && !noData) {
      tbody.innerHTML = `<tr><td colspan="7" class="muted" style="text-align:center;padding:1.25rem">Ninguna unidad coincide con los filtros.</td></tr>`;
      if (cards) cards.innerHTML = `<p class="muted" style="text-align:center">Ninguna unidad coincide con los filtros.</p>`;
      return;
    }

    tbody.innerHTML = units
      .map((u) => {
        const owners = ownerByUnit.get(u.id) || [];
        const ownerLabel = owners.length ? esc(owners.join(", ")) : '<span class="muted">Sin propietario</span>';
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
              <button type="button" class="btn btn-primary btn-sm" data-manage-unit="${u.id}">Gestionar</button>
              <button type="button" class="btn btn-ghost btn-icon" data-unit-menu="${u.id}" aria-label="Más acciones" aria-haspopup="menu">•••</button>
              <div class="unit-row-menu" data-menu-for="${u.id}" hidden role="menu">
                <button type="button" role="menuitem" data-act="details" data-unit="${u.id}">Ver detalles</button>
                <button type="button" role="menuitem" data-act="edit" data-unit="${u.id}">Editar unidad</button>
                <button type="button" role="menuitem" data-act="assign" data-unit="${u.id}">Asignar propietario</button>
                <button type="button" role="menuitem" data-act="edit-owner" data-unit="${u.id}">Editar propietario</button>
                <button type="button" role="menuitem" data-act="change-owner" data-unit="${u.id}">Cambiar propietario</button>
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
          return `<article class="unit-card${!u.isActive ? " is-inactive" : ""}" data-unit-id="${u.id}">
            <div class="unit-card__top">
              <strong>${esc(u.code)}</strong>
              <span class="unit-status ${u.isActive ? "is-on" : "is-off"}">${u.isActive ? "Activa" : "Inactiva"}</span>
            </div>
            <p class="muted">${owners.length ? esc(owners.join(", ")) : "Sin propietario"} · ${fmtCoef(u.coefficientPercent)} %</p>
            <button type="button" class="btn btn-primary" data-manage-unit="${u.id}">Gestionar</button>
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

  async function openUnitModal(unitId, mode = "view", tab = "info") {
    const dlg = $("#dlg-unit-hub");
    if (!dlg) return;
    modalMode = mode;
    currentUnitId = unitId || null;
    setTab(tab);

    if (mode === "create" || !unitId) {
      currentDetail = null;
      $("#unit-hub-title").textContent = "Nueva unidad";
      $("#unit-hub-eyebrow").textContent = "Crear";
      renderCreateForm();
      if (!dlg.open) dlg.showModal();
      return;
    }

    try {
      currentDetail = await api(`/api/ph/${ctx.currentPhId}/units/${unitId}/ownerships`);
      $("#unit-hub-title").textContent = `Unidad ${currentDetail.unitCode}`;
      $("#unit-hub-eyebrow").textContent = currentDetail.isActive ? "Activa" : "Inactiva";
      renderModalBody();
      if (!dlg.open) dlg.showModal();
    } catch (err) {
      AppFeedback.fromError(err);
    }
  }

  function closeUnitModal() {
    const dlg = $("#dlg-unit-hub");
    if (dlg?.open) dlg.close();
    currentUnitId = null;
    currentDetail = null;
  }

  function renderCreateForm() {
    const body = $("#unit-hub-body");
    const foot = $("#unit-hub-foot");
    body.innerHTML = `
      <form id="form-unit-hub" class="unit-hub-form">
        <div class="form-grid">
          <label>Código <input name="code" required maxlength="64" /></label>
          <label>Torre <input name="tower" maxlength="64" /></label>
          <label>Piso <input name="floor" type="number" /></label>
          <label>Tipo <input name="unitType" maxlength="64" /></label>
          <label>Coeficiente % <input name="coefficientPercent" type="number" step="0.0001" min="0" max="100" required /></label>
          <label class="check"><input type="checkbox" name="isActive" checked /> Unidad activa</label>
        </div>
        <p id="unit-hub-inline-error" class="field-error" hidden role="alert"></p>
      </form>`;
    foot.innerHTML = `
      <button type="button" class="btn btn-secondary" data-close-hub>Cancelar</button>
      <button type="submit" form="form-unit-hub" class="btn btn-primary" id="btn-save-unit-hub">Crear unidad</button>`;
    $("#form-unit-hub").addEventListener("submit", onSaveUnit);
    $("[data-close-hub]", foot)?.addEventListener("click", closeUnitModal);
  }

  function renderModalBody() {
    const d = currentDetail;
    const body = $("#unit-hub-body");
    const foot = $("#unit-hub-foot");
    const active = (d.owners || []).filter((o) => o.isActive);
    const history = (d.owners || []).filter((o) => !o.isActive);
    const primary = active[0] || null;

    if (modalTab === "info") {
      body.innerHTML = `
        <form id="form-unit-hub" class="unit-hub-form">
          <div class="form-grid">
            <label>Código <input name="code" required value="${esc(d.unitCode)}" ${canManage() ? "" : "readonly"} /></label>
            <label>Torre <input name="tower" value="${esc(d.tower || "")}" ${canManage() ? "" : "readonly"} /></label>
            <label>Piso <input name="floor" type="number" value="${d.floor ?? ""}" ${canManage() ? "" : "readonly"} /></label>
            <label>Tipo <input name="unitType" value="${esc(d.unitType || "")}" ${canManage() ? "" : "readonly"} /></label>
            <label>Coeficiente % <input name="coefficientPercent" type="number" step="0.0001" min="0" max="100" required value="${Number(d.coefficientPercent)}" ${canManage() ? "" : "readonly"} /></label>
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
      if (!primary) {
        body.innerHTML = `
          <div class="unit-owner-empty">
            <h3>Esta unidad todavía no tiene un propietario asignado</h3>
            <p class="muted">Puedes crear un propietario nuevo o vincular uno existente del mismo PH.</p>
            <div class="cta-row">
              <button type="button" class="btn btn-primary" data-owner-flow="create">Crear nuevo propietario</button>
              <button type="button" class="btn btn-secondary" data-owner-flow="link">Vincular propietario existente</button>
            </div>
            <div id="unit-owner-flow" hidden></div>
          </div>`;
      } else {
        const others = (primary.otherUnitCodesInPh || []).join(", ") || "—";
        body.innerHTML = `
          <div class="unit-owner-card">
            <h3>${esc(primary.ownerDisplayName)}</h3>
            <dl class="unit-dl">
              <div><dt>Identificación</dt><dd>${esc(primary.ownerIdentification || "—")}</dd></div>
              <div><dt>Correo</dt><dd>${esc(primary.ownerEmail || "—")}</dd></div>
              <div><dt>Teléfono</dt><dd>${esc(primary.ownerPhone || "—")}</dd></div>
              <div><dt>Estado</dt><dd>${esc(primary.ownerStatus || "—")}</dd></div>
              <div><dt>Vinculación</dt><dd>${esc(fmtDate(primary.effectiveFromUtc))}</dd></div>
              <div><dt>Otras unidades en este PH</dt><dd>${esc(others)}</dd></div>
              <div><dt>Participación en la unidad</dt><dd>${fmtCoef(primary.sharePercent)} %</dd></div>
            </dl>
            <div class="cta-row">
              <button type="button" class="btn btn-secondary" data-owner-flow="edit" data-owner-id="${primary.ownerId}">Editar propietario</button>
              <button type="button" class="btn btn-secondary" data-owner-flow="change" data-ownership-id="${primary.ownershipId}">Cambiar propietario</button>
              <button type="button" class="btn btn-ghost" data-owner-flow="unlink" data-ownership-id="${primary.ownershipId}">Desvincular</button>
            </div>
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
    const err = $("#unit-hub-inline-error");
    if (err) { err.hidden = true; err.textContent = ""; }
    const data = formData(ev.target);
    const coef = Number(data.coefficientPercent);
    if (!(coef >= 0) || coef > 100) {
      if (err) { err.hidden = false; err.textContent = "El coeficiente debe estar entre 0 y 100 %."; }
      return;
    }
    const btn = $("#btn-save-unit-hub");
    const body = {
      code: data.code,
      tower: data.tower || null,
      floor: data.floor === "" || data.floor == null ? null : Number(data.floor),
      unitType: data.unitType || null,
      coefficientPercent: coef,
      isActive: data.isActive === "on" || data.isActive === true || data.isActive === "true"
    };
    busy = true;
    try {
      await runWithButton(btn, "Guardando…", async () => {
        if (!currentUnitId) {
          const created = await api(`/api/ph/${ctx.currentPhId}/units`, { method: "POST", body });
          notify.success("La unidad fue creada correctamente.", { title: "Unidad creada" });
          await loadUnits({ force: true });
          await refreshCoeffBanner();
          await openUnitModal(created.id, "view", "owner");
        } else {
          await api(`/api/ph/${ctx.currentPhId}/units/${currentUnitId}`, { method: "PUT", body });
          notify.success("Los cambios fueron guardados.", { title: "Unidad actualizada" });
          await loadUnits({ force: true });
          await refreshCoeffBanner();
          await openUnitModal(currentUnitId, "view", "info");
        }
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
            <label>% titularidad <input name="sharePercent" type="number" step="0.0001" min="0.0001" max="100" value="100" /></label>
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
          <label>% titularidad <input name="sharePercent" type="number" step="0.0001" value="100" min="0.0001" max="100" /></label>
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
    if (!ctx.currentPhId) return;
    const skel = $("#units-skeleton");
    if (skel) skel.hidden = false;
    const search = ($("#unit-search")?.value || "").trim();
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (filter === "active") params.set("isActive", "true");
    if (filter === "inactive") params.set("isActive", "false");
    const q = params.toString() ? `?${params}` : "";
    try {
      if (!force && soft && !search && filter === "all" && ctx.isPhTabFresh?.("units")) {
        renderList();
        return;
      }
      cache = await api(`/api/ph/${ctx.currentPhId}/units${q}`, { dedupeKey: `ph-units:${ctx.currentPhId}:${q}` });
      if (!search && filter === "all") ctx.markPhTabFresh?.("units");
      await loadOwnerHints(cache);
      renderList();
      await refreshCoeffBanner();

      // keep owner-unit select in sync if present
      const select = $("#owner-unit-select");
      if (select) {
        const current = select.value;
        select.innerHTML =
          `<option value="">— asociar después —</option>` +
          cache.map((u) => `<option value="${u.id}">${esc(u.code)}</option>`).join("");
        select.value = current;
      }
    } finally {
      if (skel) skel.hidden = true;
    }
  }

  function wire() {
    $("#btn-new-unit")?.addEventListener("click", () => openUnitModal(null, "create"));
    $("#btn-empty-new-unit")?.addEventListener("click", () => openUnitModal(null, "create"));
    $("#unit-hub-close")?.addEventListener("click", closeUnitModal);
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

    // PH admin menu
    const manageBtn = $("#btn-manage-ph");
    const menu = $("#ph-admin-menu");
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
    $$("[data-ph-admin]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        menu.hidden = true;
        const act = btn.dataset.phAdmin;
        if (act === "edit") ctx.switchTab?.("info");
        else if (act === "coefficients") ctx.switchTab?.("coefficients");
        else if (act === "activate") $("#btn-activate-ph")?.click();
        else if (act === "ready") $("#btn-mark-ready")?.click();
        else if (act === "deactivate") $("#btn-archive-ph")?.click();
        else if (act === "reactivate") $("#btn-reactivate-ph")?.click();
        else if (act === "delete") $("#btn-delete-ph")?.click();
      });
    });
  }

  return { wire, loadUnits, openUnitModal, refreshCoeffBanner, showUnit: (id) => openUnitModal(id, "view") };
}
