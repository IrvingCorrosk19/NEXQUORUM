import { api } from "./api.js";
import { escapeHtml, confirmDialog, showToast, qs } from "./ui.js";
import { showGlobalLoader, hideGlobalLoader } from "./loading.js";
import { hasPermission } from "./auth.js";
import { openVoting, closeVoting } from "./voting.js";

/**
 * Live Voting Workspace — operator controls inside the meeting room (no LiveKit teardown).
 */
export function createLiveVotingWorkspace({
  getAssemblyId,
  getUser,
  getAgenda,
  getMotions,
  getSession,
  getMotion,
  refreshRoom,
  onMotionChanged
}) {
  let concurrencyStamp = null;

  function canManage() {
    const user = getUser();
    return hasPermission(user, "motion:create") || hasPermission(user, "vote:open");
  }

  async function ensureAgendaItem() {
    const agenda = getAgenda();
    const items = agenda?.items || [];
    if (items.length) return items[0];
    const created = await api(`/api/assemblies/${getAssemblyId()}/agenda`, {
      method: "POST",
      body: { ordinal: 1, code: "A01", title: "Punto en sesión" }
    });
    return (created.items || [])[0];
  }

  function mountOperatorChrome(root) {
    if (!root || !canManage()) return;
    if (root.querySelector("[data-live-workspace]")) return;

    const bar = document.createElement("div");
    bar.className = "live-vote-workspace";
    bar.setAttribute("data-live-workspace", "1");
    bar.innerHTML = `
      <div class="live-vote-actions">
        <button type="button" class="btn btn-primary" data-lv="quick">+ Votación rápida</button>
        <button type="button" class="btn btn-secondary" data-lv="pick">Usar preparada</button>
        <button type="button" class="btn btn-ghost" data-lv="edit">Editar</button>
        <button type="button" class="btn btn-ghost" data-lv="preview">Vista previa</button>
        <button type="button" class="btn btn-secondary" data-lv="withdraw" hidden>Retirar apertura</button>
        <button type="button" class="btn btn-danger" data-lv="cancel" hidden>Anular…</button>
        <button type="button" class="btn btn-primary" data-lv="version" hidden>Nueva versión</button>
        <button type="button" class="btn btn-ghost" data-lv="history">Historial</button>
      </div>
      <div class="live-vote-lock" data-lv-lock hidden role="status"></div>
      <dialog class="live-vote-dialog" data-lv-dialog>
        <form method="dialog" class="live-vote-form" data-lv-form></form>
      </dialog>
    `;
    root.prepend(bar);

    bar.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-lv]");
      if (!btn) return;
      const action = btn.getAttribute("data-lv");
      try {
        if (action === "quick") await quickCreate();
        if (action === "pick") await pickPrepared();
        if (action === "edit") await editCurrent();
        if (action === "preview") await previewCurrent();
        if (action === "withdraw") await withdrawOpen();
        if (action === "cancel") await cancelOpen();
        if (action === "version") await createVersion();
        if (action === "history") await showHistory();
      } catch (err) {
        showToast(err.message || "Error", "error");
      }
    });
  }

  async function syncLockBanner(root) {
    const lock = root?.querySelector("[data-lv-lock]");
    const withdrawBtn = root?.querySelector('[data-lv="withdraw"]');
    const cancelBtn = root?.querySelector('[data-lv="cancel"]');
    const versionBtn = root?.querySelector('[data-lv="version"]');
    if (!lock) return;

    const motion = getMotion();
    const session = getSession();
    if (!motion) {
      lock.hidden = true;
      if (withdrawBtn) withdrawBtn.hidden = true;
      if (cancelBtn) cancelBtn.hidden = true;
      if (versionBtn) versionBtn.hidden = true;
      return;
    }

    try {
      const policy = await api(`/api/assemblies/${getAssemblyId()}/motions/${motion.id}/edit-policy`);
      concurrencyStamp = policy.concurrencyStamp;
      if (policy.editMode === "Full") {
        lock.hidden = true;
      } else if (policy.editMode === "WithdrawRequired") {
        lock.hidden = false;
        lock.innerHTML = `<strong>⚠ VOTACIÓN ABIERTA</strong><p>${escapeHtml(policy.message || "Sin votos aún. Retire la apertura para editar.")}</p>`;
      } else if (policy.editMode === "CancelRequired") {
        lock.hidden = false;
        lock.innerHTML = `<strong>🔒 VOTACIÓN EN CURSO</strong><p>${escapeHtml(policy.message || "Ya recibió votos. Contenido bloqueado.")}</p>`;
      } else {
        lock.hidden = false;
        lock.innerHTML = `<strong>🔒 INMUTABLE</strong><p>${escapeHtml(policy.message || "Registro histórico.")}</p>`;
      }

      if (withdrawBtn) withdrawBtn.hidden = policy.editMode !== "WithdrawRequired";
      if (cancelBtn) cancelBtn.hidden = !(session && session.status === "Open");
      if (versionBtn) versionBtn.hidden = motion.status !== "Cancelled";
    } catch {
      /* ignore */
    }
  }

  function openDialog(html) {
    const root = qs("#vote-panel");
    const dialog = root?.querySelector("[data-lv-dialog]");
    const form = root?.querySelector("[data-lv-form]");
    if (!dialog || !form) return null;
    form.innerHTML = html;
    dialog.showModal();
    return { dialog, form };
  }

  async function quickCreate() {
    const agenda = await ensureAgendaItem();
    const ui = openDialog(`
      <header><h3>Votación rápida</h3></header>
      <label>Pregunta<textarea name="question" rows="3" required>¿Aprueba el presupuesto extraordinario 2027?</textarea></label>
      <label>Código<input name="code" value="VQ-${Date.now().toString().slice(-5)}" required /></label>
      <label>Método
        <select name="calc">
          <option value="Coefficient" selected>Coeficiente</option>
          <option value="PerPerson">Por persona</option>
        </select>
      </label>
      <label>Mayoría
        <select name="rule">
          <option value="SimpleMajority">Simple</option>
          <option value="QualifiedMajority" selected>Porcentaje</option>
        </select>
      </label>
      <label>Umbral %<input name="threshold" type="number" step="0.01" value="66.67" /></label>
      <label>Resultados
        <select name="vis">
          <option value="HiddenUntilClose" selected>Ocultos hasta cierre</option>
          <option value="PresidentOnlyLive">Solo mesa</option>
          <option value="LiveResults">En vivo</option>
        </select>
      </label>
      <footer class="live-vote-dialog-actions">
        <button type="submit" class="btn btn-secondary" value="cancel">Cancelar</button>
        <button type="submit" class="btn btn-primary" value="save">Guardar</button>
        <button type="submit" class="btn btn-primary" value="open">Guardar y abrir</button>
      </footer>
    `);
    if (!ui) return;

    ui.form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const submitter = ev.submitter;
      const action = submitter?.value || "cancel";
      if (action === "cancel") {
        ui.dialog.close();
        return;
      }
      const fd = new FormData(ui.form);
      const question = String(fd.get("question") || "").trim();
      const body = {
        agendaItemId: agenda.id,
        code: String(fd.get("code")),
        title: question.slice(0, 120),
        body: question,
        questionText: question,
        ballotKind: "FavorAgainstAbstain",
        calculationMethod: String(fd.get("calc")),
        decisionRuleCode: String(fd.get("rule")),
        requiredThresholdPercent:
          String(fd.get("rule")) === "QualifiedMajority" ? Number(fd.get("threshold") || 66.67) : null,
        defaultResultVisibilityPolicy: String(fd.get("vis")),
        optionsJson: JSON.stringify(["A favor", "En contra", "Abstención"])
      };
      showGlobalLoader("Guardando votación…", { immediate: true });
      try {
        const created = await api(`/api/assemblies/${getAssemblyId()}/motions`, { method: "POST", body });
        await api(`/api/assemblies/${getAssemblyId()}/motions/${created.id}/publish`, { method: "POST" });
        await api(`/api/assemblies/${getAssemblyId()}/motions/present`, {
          method: "POST",
          body: { motionId: created.id }
        });
        if (action === "open") {
          showGlobalLoader("Abriendo votación…", { immediate: true });
          await openVoting(
            getAssemblyId(),
            created.id,
            body.defaultResultVisibilityPolicy !== "LiveResults",
            body.defaultResultVisibilityPolicy
          );
        }
        ui.dialog.close();
        showToast("Votación lista", "success");
        await refreshRoom?.();
        onMotionChanged?.();
      } catch (err) {
        showToast(err.message, "error");
      } finally {
        hideGlobalLoader();
      }
    }, { once: true });
  }

  async function pickPrepared() {
    const motions = await api(`/api/assemblies/${getAssemblyId()}/motions`);
    const list = (Array.isArray(motions) ? motions : []).filter(
      (m) => m.status === "Draft" || m.status === "Presented" || m.designStatus === "Ready"
    );
    if (!list.length) {
      showToast("No hay votaciones preparadas. Cree una rápida o use Votaciones.", "info");
      return;
    }
    const ui = openDialog(`
      <header><h3>Votaciones preparadas</h3></header>
      <div class="stack">${list
        .map(
          (m) => `
        <label class="live-pick-row">
          <input type="radio" name="motionId" value="${m.id}" />
          <span><strong>${escapeHtml(m.code)}</strong> — ${escapeHtml(m.title)}
          <small class="muted">v${m.versionNumber || 1} · ${escapeHtml(m.status)}</small></span>
        </label>`
        )
        .join("")}</div>
      <footer class="live-vote-dialog-actions">
        <button type="submit" class="btn btn-secondary" value="cancel">Cancelar</button>
        <button type="submit" class="btn btn-primary" value="use">Usar / Presentar</button>
      </footer>
    `);
    if (!ui) return;
    ui.form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      if (ev.submitter?.value === "cancel") {
        ui.dialog.close();
        return;
      }
      const id = ui.form.querySelector('input[name="motionId"]:checked')?.value;
      if (!id) {
        showToast("Seleccione una votación", "error");
        return;
      }
      showGlobalLoader("Presentando moción…", { immediate: true });
      try {
        await api(`/api/assemblies/${getAssemblyId()}/motions/present`, {
          method: "POST",
          body: { motionId: id }
        });
        ui.dialog.close();
        await refreshRoom?.();
        showToast("Moción presentada", "success");
      } catch (err) {
        showToast(err.message, "error");
      } finally {
        hideGlobalLoader();
      }
    }, { once: true });
  }

  async function editCurrent() {
    const motion = getMotion();
    if (!motion) {
      showToast("No hay moción activa", "error");
      return;
    }
    const policy = await api(`/api/assemblies/${getAssemblyId()}/motions/${motion.id}/edit-policy`);
    if (!policy.canEditCritical) {
      showToast(policy.message || "No se puede editar ahora", "error");
      await syncLockBanner(qs("#vote-panel"));
      return;
    }
    concurrencyStamp = policy.concurrencyStamp;
    const ui = openDialog(`
      <header><h3>Editar votación</h3></header>
      <label>Pregunta<textarea name="question" rows="3" required>${escapeHtml(motion.questionText || motion.title || "")}</textarea></label>
      <label>Método
        <select name="calc">
          <option value="Coefficient">Coeficiente</option>
          <option value="PerPerson">Por persona</option>
          <option value="PerUnit">Por unidad</option>
        </select>
      </label>
      <label>Mayoría
        <select name="rule">
          <option value="SimpleMajority">Simple</option>
          <option value="QualifiedMajority">Porcentaje</option>
        </select>
      </label>
      <label>Umbral %<input name="threshold" type="number" step="0.01" value="${motion.requiredThresholdPercent ?? 66.67}" /></label>
      <label>Resultados
        <select name="vis">
          <option value="HiddenUntilClose">Ocultos hasta cierre</option>
          <option value="PresidentOnlyLive">Solo mesa</option>
          <option value="LiveResults">En vivo</option>
        </select>
      </label>
      <footer class="live-vote-dialog-actions">
        <button type="submit" class="btn btn-secondary" value="cancel">Cancelar</button>
        <button type="submit" class="btn btn-ghost" value="preview">Vista previa</button>
        <button type="submit" class="btn btn-primary" value="save">Guardar</button>
      </footer>
    `);
    if (!ui) return;
    ui.form.querySelector('[name="calc"]').value = motion.calculationMethod || "Coefficient";
    ui.form.querySelector('[name="rule"]').value = motion.decisionRuleCode || "SimpleMajority";
    ui.form.querySelector('[name="vis"]').value = motion.defaultResultVisibilityPolicy || "HiddenUntilClose";

    ui.form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const action = ev.submitter?.value || "cancel";
      if (action === "cancel") {
        ui.dialog.close();
        return;
      }
      const fd = new FormData(ui.form);
      const question = String(fd.get("question") || "").trim();
      if (action === "preview") {
        showToast(`Vista participante: ${question}`, "info");
        return;
      }
      showGlobalLoader("Guardando…", { immediate: true });
      try {
        await api(`/api/assemblies/${getAssemblyId()}/motions/${motion.id}`, {
          method: "PUT",
          body: {
            title: question.slice(0, 120),
            body: question,
            questionText: question,
            calculationMethod: String(fd.get("calc")),
            decisionRuleCode: String(fd.get("rule")),
            requiredThresholdPercent:
              String(fd.get("rule")) === "QualifiedMajority" ? Number(fd.get("threshold")) : null,
            defaultResultVisibilityPolicy: String(fd.get("vis")),
            expectedConcurrencyStamp: concurrencyStamp
          }
        });
        ui.dialog.close();
        showToast("Cambios guardados", "success");
        await refreshRoom?.();
      } catch (err) {
        showToast(err.message, "error");
      } finally {
        hideGlobalLoader();
      }
    }, { once: true });
  }

  async function previewCurrent() {
    const motion = getMotion();
    if (!motion) {
      showToast("No hay moción para previsualizar", "error");
      return;
    }
    openDialog(`
      <header><h3>Vista previa — como participante</h3></header>
      <div class="preview-frame is-mobile">
        <p class="command-eyebrow">VOTACIÓN</p>
        <h3>${escapeHtml(motion.questionText || motion.title)}</h3>
        <p class="muted">${escapeHtml(motion.calculationMethod || "Coefficient")}${
          motion.requiredThresholdPercent != null
            ? ` · ≥ ${Number(motion.requiredThresholdPercent).toFixed(2)}%`
            : ""
        }</p>
        <button type="button" class="choice" disabled>A favor</button>
        <button type="button" class="choice" disabled>En contra</button>
        <button type="button" class="choice" disabled>Abstención</button>
      </div>
      <footer class="live-vote-dialog-actions">
        <button type="submit" class="btn btn-secondary" value="close">Cerrar</button>
      </footer>
    `)?.form.addEventListener("submit", (e) => {
      e.preventDefault();
      qs("#vote-panel [data-lv-dialog]")?.close();
    }, { once: true });
  }

  async function withdrawOpen() {
    const session = getSession();
    if (!session) return;
    const ok = await confirmDialog({
      title: "Retirar apertura",
      body: "La votación está abierta sin votos. ¿Retirar para editar?",
      confirmLabel: "Retirar"
    });
    if (!ok) return;
    showGlobalLoader("Retirando apertura…", { immediate: true });
    try {
      await api(`/api/assemblies/${getAssemblyId()}/voting/${session.id}/withdraw`, {
        method: "POST",
        body: { expectedConcurrencyStamp: session.concurrencyStamp }
      });
      showToast("Apertura retirada. Ya puede editar.", "success");
      await refreshRoom?.();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      hideGlobalLoader();
    }
  }

  async function cancelOpen() {
    const session = getSession();
    if (!session) return;
    const ui = openDialog(`
      <header><h3>Anular votación</h3></header>
      <p class="muted">Los votos ya registrados se conservan como evidencia y no se migran.</p>
      <label>Motivo de anulación (obligatorio)
        <textarea name="reason" rows="3" required minlength="5" placeholder="Ej. Se corrigió el monto indicado en la moción."></textarea>
      </label>
      <footer class="live-vote-dialog-actions">
        <button type="submit" class="btn btn-secondary" value="back">Cancelar</button>
        <button type="submit" class="btn btn-danger" value="confirm">Confirmar anulación</button>
      </footer>
    `);
    if (!ui) return;
    ui.form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      if (ev.submitter?.value !== "confirm") {
        ui.dialog.close();
        return;
      }
      const reason = String(new FormData(ui.form).get("reason") || "").trim();
      showGlobalLoader("Anulando…", { immediate: true });
      try {
        await api(`/api/assemblies/${getAssemblyId()}/voting/${session.id}/cancel`, {
          method: "POST",
          body: { reason, expectedConcurrencyStamp: session.concurrencyStamp }
        });
        ui.dialog.close();
        showToast("Votación anulada", "success");
        const makeVersion = await confirmDialog({
          title: "Crear nueva versión",
          body: "¿Crear V2 ahora para corregir y volver a abrir?",
          confirmLabel: "Crear V2"
        });
        if (makeVersion) await createVersion(session.motionId);
        await refreshRoom?.();
      } catch (err) {
        showToast(err.message, "error");
      } finally {
        hideGlobalLoader();
      }
    }, { once: true });
  }

  async function createVersion(motionId) {
    const id = motionId || getMotion()?.id;
    if (!id) {
      showToast("No hay moción anulada para versionar", "error");
      return;
    }
    showGlobalLoader("Creando nueva versión…", { immediate: true });
    try {
      const v2 = await api(`/api/assemblies/${getAssemblyId()}/motions/${id}/versions`, {
        method: "POST",
        body: {}
      });
      showToast(`Versión ${v2.versionNumber} creada (${v2.code})`, "success");
      await refreshRoom?.();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      hideGlobalLoader();
    }
  }

  async function showHistory() {
    const motion = getMotion();
    if (!motion) {
      showToast("Sin moción activa", "error");
      return;
    }
    const rootId = motion.rootMotionId || motion.previousMotionId || motion.id;
    const items = await api(`/api/assemblies/${getAssemblyId()}/voting/history/${rootId}`).catch(() =>
      api(`/api/assemblies/${getAssemblyId()}/voting/history/${motion.id}`)
    );
    openDialog(`
      <header><h3>Historial de versiones</h3></header>
      <ul class="stack">${(items || [])
        .map(
          (h) => `<li><strong>V${h.versionNumber}</strong> · ${escapeHtml(h.status)}
          · votos ${h.acceptedBallots}
          ${h.cancellationReason ? `<br/><em>${escapeHtml(h.cancellationReason)}</em>` : ""}
          ${h.decisionStatus ? ` · ${escapeHtml(h.decisionStatus)}` : ""}</li>`
        )
        .join("") || "<li>Sin sesiones aún</li>"}</ul>
      <footer class="live-vote-dialog-actions">
        <button type="submit" class="btn btn-secondary" value="close">Cerrar</button>
      </footer>
    `)?.form.addEventListener("submit", (e) => {
      e.preventDefault();
      qs("#vote-panel [data-lv-dialog]")?.close();
    }, { once: true });
  }

  return {
    mountOperatorChrome,
    syncLockBanner,
    handleRealtime(name) {
      if (
        name === "votingCancelled" ||
        name === "votingVersionCreated" ||
        name === "votingOpened" ||
        name === "votingClosed" ||
        name === "motionUpdated"
      ) {
        syncLockBanner(qs("#vote-panel"));
      }
    }
  };
}
