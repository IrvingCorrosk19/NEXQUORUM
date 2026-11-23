import { api, invalidateCachedGet } from "./api.js";
import { escapeHtml, confirmDialog, showToast, qs } from "./ui.js";
import { showGlobalLoader, hideGlobalLoader, forceHideGlobalLoader, setGlobalLoaderMessage } from "./loading.js";
import { hasPermission } from "./auth.js";
import { openVoting, closeVoting, mapOpenVotingError } from "./voting.js?v=labels-es1";
import { assemblyLabel } from "./assembly-labels.js";

/** Deterministic question order: DisplayOrder → CreatedAt → Id. */
function sortMotionsDeterministic(motions) {
  return [...(motions || [])].sort((a, b) => {
    const ao = Number(a.displayOrder ?? a.DisplayOrder ?? 0);
    const bo = Number(b.displayOrder ?? b.DisplayOrder ?? 0);
    if (ao !== bo) return ao - bo;
    const ac = Date.parse(a.createdAtUtc || a.CreatedAtUtc || 0) || 0;
    const bc = Date.parse(b.createdAtUtc || b.CreatedAtUtc || 0) || 0;
    if (ac !== bc) return ac - bc;
    return String(a.id || a.Id || "").localeCompare(String(b.id || b.Id || ""));
  });
}

function humanQuestionStatus(m, activeMotionId, session) {
  const sid = session?.motionId || session?.MotionId;
  const sessionOpen = session?.status === "Open" || session?.Status === "Open";
  if (sessionOpen && sid && sid === m.id) {
    return { key: "active", label: "Votación abierta" };
  }
  if (m.status === "Voting" && sessionOpen && (!sid || sid === m.id)) {
    return { key: "active", label: "Votación abierta" };
  }
  if (m.status === "Approved") return { key: "answered", label: "Aprobada — Alcanzó los votos requeridos" };
  if (m.status === "Rejected") return { key: "answered", label: "Rechazada — No alcanzó los votos requeridos" };
  if (m.status === "NoValidDecision") return { key: "closed", label: "Sin decisión válida — Quórum insuficiente" };
  if (m.status === "Cancelled") return { key: "closed", label: "Anulada" };
  if (m.status === "Closed") return { key: "closed", label: "Cerrada" };
  if (m.status === "Presented" || (m.id === activeMotionId && m.status === "Presented")) {
    return { key: "pending", label: "Presentada — falta abrir votación" };
  }
  if (m.status === "Draft") return { key: "pending", label: "Borrador — falta presentar" };
  return { key: "pending", label: m.status || "Pendiente" };
}

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
    throw new Error("No hay puntos de agenda. Agrégalos en Agenda antes de abrir una votación.");
  }

  function mountOperatorChrome(root) {
    if (!canManage()) return;
    const host = document.querySelector("#questionnaire-panel") || root;
    if (!host) return;
    if (host.querySelector("[data-live-workspace]")) return;

    const bar = document.createElement("div");
    bar.className = "live-vote-workspace";
    bar.setAttribute("data-live-workspace", "1");
    bar.innerHTML = `
      <div class="live-vote-actions">
        <button type="button" class="btn btn-primary" data-lv="quick">+ Agregar pregunta</button>
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
    host.prepend(bar);

    bar.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-lv]");
      if (!btn) return;
      const action = btn.getAttribute("data-lv");
      try {
        if (action === "quick") await quickCreate(btn);
        if (action === "pick") await pickPrepared(btn);
        if (action === "edit") await editCurrent(btn);
        if (action === "preview") await previewCurrent(btn);
        if (action === "withdraw") await withdrawOpen();
        if (action === "cancel") await cancelOpen(btn);
        if (action === "version") await createVersion();
        if (action === "history") await showHistory(btn);
      } catch (err) {
        showToast(err.message || "Error", "error");
      }
    });
  }

  function questionStatusMark(m, activeMotionId, session) {
    const st = humanQuestionStatus(m, activeMotionId, session);
    if (st.key === "answered") return "✓";
    if (st.key === "closed") return "⊘";
    if (st.key === "active") return "●";
    if (m.id === activeMotionId || m.status === "Presented") return "◐";
    return "○";
  }

  function renderQuestionnaireSection(title, items, { manage, activeMotionId, session, indexOffset = 0, allOrdered }) {
    if (!items.length) return "";
    return `
      <section class="lq-section" aria-label="${escapeHtml(title)}">
        <h4 class="lq-section-title">${escapeHtml(title)}</h4>
        <ol class="live-questionnaire-list" start="${indexOffset + 1}">
          ${items
            .map((m) => {
              const idx = allOrdered.findIndex((x) => x.id === m.id);
              const n = idx >= 0 ? idx + 1 : indexOffset + 1;
              const st = humanQuestionStatus(m, activeMotionId, session);
              const isActive = st.key === "active";
              return `<li class="${isActive ? "is-active" : ""} lq-${st.key}" data-motion-id="${m.id}">
                <span class="lq-mark" aria-hidden="true">${questionStatusMark(m, activeMotionId, session)}</span>
                <span class="lq-text"><strong>Pregunta ${n}.</strong> ${escapeHtml(m.questionText || m.title || m.code)}
                  <small class="muted">${escapeHtml(st.label)}${m.versionNumber > 1 ? ` · v${m.versionNumber}` : ""}</small>
                </span>
                ${
                  manage
                    ? `<span class="lq-ops">
                        ${
                          m.status === "Draft"
                            ? `<button type="button" class="btn btn-secondary btn-xs" data-lq="present" data-id="${m.id}">Presentar pregunta</button>`
                            : ""
                        }
                        ${
                          m.status === "Presented" && !isActive
                            ? `<button type="button" class="btn btn-primary btn-xs" data-lq="open" data-id="${m.id}">Abrir votación</button>`
                            : ""
                        }
                        ${
                          isActive
                            ? `<button type="button" class="btn btn-danger btn-xs" data-lq="close" data-id="${m.id}">Cerrar votación</button>`
                            : ""
                        }
                        <button type="button" class="btn btn-ghost btn-xs" data-lq="up" data-id="${m.id}" title="Subir" ${n <= 1 ? "disabled" : ""}>↑</button>
                        <button type="button" class="btn btn-ghost btn-xs" data-lq="down" data-id="${m.id}" title="Bajar" ${n >= allOrdered.length ? "disabled" : ""}>↓</button>
                        <button type="button" class="btn btn-ghost btn-xs" data-lq="archive" data-id="${m.id}" title="Eliminar" ${m.status === "Draft" || m.status === "Presented" ? "" : "hidden"}>✕</button>
                      </span>`
                    : ""
                }
              </li>`;
            })
            .join("")}
        </ol>
      </section>`;
  }

  function renderQuestionnaire(root, { motions = [], activeMotionId = null, session = null, canManage: manage = false } = {}) {
    // Dedicated host — never prepend into #vote-panel (hides cast UI under fold).
    const hostRoot = document.querySelector("#questionnaire-panel") || root;
    if (!hostRoot) return;
    let host = hostRoot.querySelector("[data-lv-questionnaire]");
    if (!host) {
      host = document.createElement("div");
      host.className = "live-questionnaire";
      host.setAttribute("data-lv-questionnaire", "1");
      const chrome = hostRoot.querySelector("[data-live-workspace]");
      if (chrome) hostRoot.insertBefore(host, chrome.nextSibling);
      else hostRoot.prepend(host);
    }

    const ordered = sortMotionsDeterministic(
      (motions || []).filter((m) => m.designStatus !== "Archived")
    );
    const activeOpen = ordered.filter(
      (m) => humanQuestionStatus(m, activeMotionId, session).key === "active"
    );
    const pending = ordered.filter(
      (m) => humanQuestionStatus(m, activeMotionId, session).key === "pending"
    );
    const answered = ordered.filter(
      (m) => humanQuestionStatus(m, activeMotionId, session).key === "answered"
    );
    const closed = ordered.filter(
      (m) => humanQuestionStatus(m, activeMotionId, session).key === "closed"
    );

    const wrap = document.querySelector("#questionnaire-wrap");
    if (!ordered.length) {
      host.innerHTML = manage
        ? `<p class="empty-state-what">Sin preguntas aún.</p><p class="empty-state-why">Use Agregar pregunta para crear la primera.</p>`
        : "";
      if (wrap) {
        wrap.hidden = !manage;
        if (manage) {
          wrap.open = true;
          const summary = wrap.querySelector("summary");
          if (summary) summary.textContent = "Preguntas";
        }
      }
      return;
    }
    if (wrap) {
      wrap.hidden = false;
      wrap.open = Boolean(manage);
      const summary = wrap.querySelector("summary");
      if (summary) {
        const activeLabel = activeOpen[0]
          ? `Activa: ${(activeOpen[0].questionText || activeOpen[0].title || "").slice(0, 42)}`
          : null;
        summary.textContent = manage
          ? "Cuestionario en vivo"
          : activeLabel
            ? `Ver otras preguntas · ${activeLabel}`
            : "Ver otras preguntas";
      }
    }

    const completed = answered.length;
    const total = ordered.length;
    const pct = total ? Math.round((completed / total) * 10000) / 100 : 0;
    const multiOpen =
      activeOpen.length > 1
        ? `<p class="inline-alert" role="alert">Hay más de una votación abierta. Espere a que la mesa corrija el estado.</p>`
        : "";

    host.innerHTML = `
      <div class="live-questionnaire-head">
        <strong>${manage ? "Cuestionario en vivo" : "Otras preguntas"}</strong>
        <span class="muted">${completed} / ${total} · ${pct}%</span>
      </div>
      ${multiOpen}
      ${
        ordered.length
          ? [
              renderQuestionnaireSection("Activa", activeOpen, {
                manage,
                activeMotionId,
                session,
                allOrdered: ordered
              }),
              renderQuestionnaireSection("Pendientes", pending, {
                manage,
                activeMotionId,
                session,
                allOrdered: ordered
              }),
              renderQuestionnaireSection("Respondidas", answered, {
                manage,
                activeMotionId,
                session,
                allOrdered: ordered
              }),
              renderQuestionnaireSection("Cerradas", closed, {
                manage,
                activeMotionId,
                session,
                allOrdered: ordered
              })
            ].join("")
          : `<p class="muted">Sin preguntas aún.</p>`
      }
    `;

    if (!manage) return;
    host.querySelectorAll("[data-lq]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const action = btn.getAttribute("data-lq");
        const id = btn.getAttribute("data-id");
        try {
          if (action === "archive") await archiveMotion(id);
          if (action === "up" || action === "down") await moveMotion(id, action);
          if (action === "present") await presentMotionById(id);
          if (action === "open") await openMotionVoting(id);
          if (action === "close") await closeActiveVoting();
        } catch (err) {
          showToast(mapMotionActionError(err), "error");
        }
      });
    });
  }

  async function archiveMotion(motionId) {
    const ok = await confirmDialog({
      title: "Eliminar pregunta",
      body: "Solo si no tiene votos. Se quitará del cuestionario y se recalculará el progreso.",
      confirmLabel: "Eliminar",
      danger: true
    });
    if (!ok) return;
    await api(`/api/assemblies/${getAssemblyId()}/motions/${motionId}/archive`, { method: "POST" });
    showToast("Pregunta eliminada", "success");
    await refreshRoom?.();
    onMotionChanged?.();
  }

  async function moveMotion(motionId, direction) {
    const list = sortMotionsDeterministic(
      (getMotions() || []).filter((m) => m.designStatus !== "Archived")
    );
    const idx = list.findIndex((m) => m.id === motionId);
    if (idx < 0) return;
    const swap = direction === "up" ? idx - 1 : idx + 1;
    if (swap < 0 || swap >= list.length) return;
    const ordered = list.map((m) => m.id);
    const tmp = ordered[idx];
    ordered[idx] = ordered[swap];
    ordered[swap] = tmp;
    await api(`/api/assemblies/${getAssemblyId()}/motions/reorder`, {
      method: "POST",
      body: { orderedMotionIds: ordered }
    });
    showToast("Orden actualizado", "success");
    await refreshRoom?.();
    onMotionChanged?.();
  }

  function mapMotionActionError(err) {
    const mapped = mapOpenVotingError(err);
    if (mapped && mapped !== (err?.message || "")) return mapped;
    const msg = String(err?.message || err || "");
    if (/cannot be presented while assembly/i.test(msg) || /Motions cannot be presented/i.test(msg)) {
      return "La asamblea debe estar en curso (iniciada) para presentar una pregunta. Inicie la asamblea e intente de nuevo.";
    }
    if (/while a voting session is open/i.test(msg)) {
      return "Hay una votación abierta. Ciérrela antes de presentar otra pregunta.";
    }
    if (/403|Forbidden|permission/i.test(msg)) {
      return "No tiene permiso para crear o presentar preguntas (requiere motion:create).";
    }
    return msg || "No se pudo completar la acción sobre la pregunta.";
  }

  async function presentMotionById(motionId) {
    if (!motionId) throw new Error("Falta el identificador de la pregunta.");
    if (!hasPermission(getUser(), "motion:create")) {
      throw new Error("No tiene permiso para presentar preguntas.");
    }
    const openSession = await api(`/api/assemblies/${getAssemblyId()}/voting/open`).catch(() => null);
    const openId = openSession?.id || openSession?.Id;
    if (openId) {
      const ok = await confirmDialog({
        title: "Hay una votación abierta",
        body: "Debe cerrar la votación actual antes de presentar otra pregunta. ¿Cerrar ahora y continuar?",
        confirmLabel: "Cerrar y presentar",
        danger: true
      });
      if (!ok) return;
      await closeVoting(getAssemblyId(), openId);
    }
    showGlobalLoader("Presentando pregunta…", { immediate: true });
    try {
      invalidateCachedGet(`/api/assemblies/${getAssemblyId()}/`);
      const motions = getMotions() || [];
      const motion = motions.find((m) => m.id === motionId);
      if (motion?.designStatus && motion.designStatus !== "Ready" && motion.designStatus !== "Published") {
        await api(`/api/assemblies/${getAssemblyId()}/motions/${motionId}/publish`, { method: "POST" }).catch(
          () => null
        );
      }
      await api(`/api/assemblies/${getAssemblyId()}/motions/present`, {
        method: "POST",
        body: { motionId }
      });
      showToast("Pregunta presentada. Falta abrir la votación.", "success");
      await refreshRoom?.();
      onMotionChanged?.();
    } finally {
      hideGlobalLoader();
    }
  }

  async function openMotionVoting(motionId) {
    if (!motionId) throw new Error("Falta el identificador de la pregunta.");
    if (!hasPermission(getUser(), "vote:open") && !hasPermission(getUser(), "motion:create")) {
      throw new Error("No tiene permiso para abrir votaciones.");
    }
    showGlobalLoader("Abriendo votación…", { immediate: true });
    try {
      await openVoting(getAssemblyId(), motionId, true, null);
      showToast("Votación abierta.", "success");
      await refreshRoom?.();
      onMotionChanged?.();
    } finally {
      hideGlobalLoader();
    }
  }

  async function closeActiveVoting() {
    const session = getSession();
    const sessionId = session?.id || session?.Id;
    if (!sessionId) throw new Error("No hay votación abierta.");
    const ok = await confirmDialog({
      title: "Cerrar votación",
      body: "Se cerrará la votación activa. Los votos ya registrados se conservarán.",
      confirmLabel: "Cerrar votación",
      danger: true
    });
    if (!ok) return;
    showGlobalLoader("Cerrando votación…", { immediate: true });
    try {
      await closeVoting(getAssemblyId(), sessionId);
      showToast("Votación cerrada.", "success");
      await refreshRoom?.();
      onMotionChanged?.();
    } finally {
      hideGlobalLoader();
    }
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

  function formSnapshot(form) {
    return JSON.stringify([...new FormData(form).entries()]);
  }

  function rememberForm(form) {
    form.dataset.initial = formSnapshot(form);
  }

  function formIsDirty(form) {
    return form.dataset.initial !== formSnapshot(form);
  }

  function persistedVoteState(form) {
    return {
      id: form?.dataset.motionId || "",
      presented: form?.dataset.motionPresented === "1"
    };
  }

  async function dismissVoteDialog(dialog, form) {
    const saved = persistedVoteState(form);
    if (saved.id) {
      const ok = await confirmDialog({
        title: saved.presented ? "La pregunta ya está presentada" : "La pregunta ya está guardada",
        body: saved.presented
          ? "La pregunta quedó guardada y presentada. Cerrar no la borra y no crea otra. La votación sigue sin abrir."
          : "La pregunta ya está guardada. Cerrar no la borra y no crea otra.",
        confirmLabel: "Cerrar"
      });
      if (!ok) return;
    } else if (formIsDirty(form)) {
      const ok = await confirmDialog({
        title: "Descartar cambios",
        body: "Hay cambios sin guardar. Si cierra ahora, no se crea ninguna pregunta.",
        confirmLabel: "Descartar",
        danger: true
      });
      if (!ok) return;
    }
    dialog.close();
  }

  let voteReturnFocus = null;

  function openDialog(html, opener) {
    const root = document.querySelector("#questionnaire-panel") || qs("#vote-panel");
    const dialog = root?.querySelector("[data-lv-dialog]");
    const form = root?.querySelector("[data-lv-form]");
    if (!dialog || !form) return null;
    voteReturnFocus = opener instanceof HTMLElement ? opener : document.activeElement;
    form.innerHTML = html;
    rememberForm(form);
    if (!form.dataset.dismissBound) {
      form.dataset.dismissBound = "1";
      form.addEventListener("click", (ev) => {
        const dismiss = ev.target.closest("[data-dismiss]");
        if (!dismiss) return;
        ev.preventDefault();
        dismissVoteDialog(dialog, form);
      });
      dialog.addEventListener("cancel", (ev) => {
        if (!formIsDirty(form)) return;
        ev.preventDefault();
        dismissVoteDialog(dialog, form);
      });
      dialog.addEventListener("close", () => {
        const el = voteReturnFocus;
        voteReturnFocus = null;
        if (el instanceof HTMLElement && document.contains(el)) el.focus();
      });
    }
    dialog.showModal();
    return { dialog, form };
  }

  async function assemblyCanPresent() {
    const assembly = await api(`/api/assemblies/${getAssemblyId()}`);
    const status = assembly.status || assembly.Status || "";
    const allowed = status === "InProgress" || status === "Paused";
    return {
      allowed,
      status,
      reason: allowed
        ? ""
        : `Para presentar o abrir, la asamblea debe estar en curso. Ahora está en «${assemblyStatusEs(status)}». Puede guardar un borrador.`
    };
  }

  function assemblyStatusEs(status) {
    const map = {
      Draft: "Borrador",
      Scheduled: "Programada",
      CheckIn: "Mesa abierta",
      InProgress: "En curso",
      Paused: "En receso",
      Completed: "Finalizada",
      Cancelled: "Cancelada"
    };
    return map[status] || "Estado no disponible";
  }

  async function quickCreate(opener) {
    const agenda = await ensureAgendaItem();
    let gate = { allowed: false, status: "", reason: "Comprobando el estado de la asamblea…" };
    try {
      gate = await assemblyCanPresent();
    } catch (err) {
      gate.reason = err.message || "No se pudo leer el estado de la asamblea.";
    }
    const ui = openDialog(`
      <header class="lv-head">
        <h3 id="lv-quick-title">Votación rápida</h3>
        <button type="button" class="btn btn-ghost" data-dismiss aria-label="Cerrar">✕</button>
      </header>
      <div class="lv-body">
        <p class="muted">Escribe la pregunta que verán los participantes.</p>
        <label>Pregunta<textarea name="question" rows="3" required placeholder="Escribe la pregunta que verán los participantes"></textarea></label>
        <label>Código<input name="code" value="VQ-${Date.now().toString().slice(-5)}" required /></label>
        <label>Método
          <select name="calc">
            <option value="Coefficient" selected>Coeficiente</option>
            <option value="PerPerson">Por persona</option>
            <option value="PerUnit">Por unidad</option>
          </select>
        </label>
        <label>Mayoría
          <select name="rule">
            <option value="SimpleMajority" selected>Simple</option>
            <option value="QualifiedMajority">Mayoría calificada</option>
          </select>
        </label>
        <label data-threshold hidden>Umbral %
          <input name="threshold" type="number" step="0.01" min="0.01" max="100" placeholder="Indique el porcentaje" />
          <span class="muted">Indica el porcentaje exigido para aprobar.</span>
        </label>
        <label>Resultados
          <select name="vis">
            <option value="HiddenUntilClose" selected>Ocultos hasta cierre</option>
            <option value="PresidentOnlyLive">Solo mesa</option>
            <option value="LiveResults">En vivo</option>
          </select>
        </label>
        ${gate.allowed ? "" : `<p role="status">${escapeHtml(gate.reason)}</p>`}
      </div>
      <footer class="live-vote-dialog-actions">
        <button type="button" class="btn btn-ghost" data-dismiss>Cancelar</button>
        <button type="submit" class="btn ${gate.allowed ? "btn-secondary" : "btn-primary"}" value="save">Guardar borrador</button>
        ${gate.allowed ? `<button type="submit" class="btn btn-secondary" value="present">Guardar y presentar</button>
        <button type="submit" class="btn btn-primary" value="open">Guardar, presentar y abrir</button>` : ""}
      </footer>
    `, opener);
    if (!ui) return;
    rememberForm(ui.form);
    const rule = ui.form.querySelector('[name="rule"]');
    const thresholdWrap = ui.form.querySelector("[data-threshold]");
    rule?.addEventListener("change", () => {
      if (thresholdWrap) thresholdWrap.hidden = rule.value !== "QualifiedMajority";
    });

    let submitting = false;
    ui.form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      if (submitting) return;
      const submitter = ev.submitter;
      const action = submitter?.value || "";
      if (!action || action === "cancel") return;
      const fd = new FormData(ui.form);
      const question = String(fd.get("question") || "").trim();
      if (!question) {
        showToast("Escribe la pregunta que verán los participantes.", "error");
        return;
      }
      const ruleCode = String(fd.get("rule"));
      const thresholdRaw = String(fd.get("threshold") || "").trim();
      if (ruleCode === "QualifiedMajority" && !thresholdRaw) {
        showToast("Indique el porcentaje de mayoría calificada.", "error");
        return;
      }
      if ((action === "present" || action === "open") && !gate.allowed) {
        showToast(gate.reason || "La asamblea no está en curso.", "error");
        return;
      }
      if (submitting) return;
      submitting = true;
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
          ruleCode === "QualifiedMajority" ? Number(thresholdRaw) : null,
        defaultResultVisibilityPolicy: String(fd.get("vis")),
        optionsJson: JSON.stringify(["A favor", "En contra", "Abstención"])
      };
      if (action === "open") {
        const ok = await confirmDialog({
          title: "Guardar, presentar y abrir",
          body: "Se creará la pregunta, se presentará y se abrirá la votación en tres pasos. Si alguno falla, se detiene el flujo.",
          confirmLabel: "Continuar"
        });
        if (!ok) {
          submitting = false;
          return;
        }
      }
      showGlobalLoader("Guardando pregunta…", { immediate: true });
      let motionId = ui.form.dataset.motionId || "";
      try {
        invalidateCachedGet(`/api/assemblies/${getAssemblyId()}/`);
        if (!motionId) {
          const created = await api(`/api/assemblies/${getAssemblyId()}/motions`, { method: "POST", body });
          motionId = created.id;
          ui.form.dataset.motionId = motionId;
        }

        if (action === "save") {
          ui.dialog.close();
          showToast("Borrador guardado. Presente la pregunta y luego abra la votación.", "success");
          await refreshRoom?.();
          onMotionChanged?.();
          return;
        }

        const openSession = await api(`/api/assemblies/${getAssemblyId()}/voting/open`).catch(() => null);
        const openId = openSession?.id || openSession?.Id;
        if (openId) {
          forceHideGlobalLoader();
          const okClose = await confirmDialog({
            title: "Hay una votación abierta",
            body: "Debe cerrar la votación actual antes de presentar otra pregunta. ¿Cerrar ahora y continuar?",
            confirmLabel: "Cerrar y continuar",
            danger: true
          });
          if (!okClose) return;
          showGlobalLoader("Cerrando votación…", { immediate: true });
          await closeVoting(getAssemblyId(), openId);
        }

        if (ui.form.dataset.motionPresented !== "1") {
          setGlobalLoaderMessage("Presentando pregunta…");
          await api(`/api/assemblies/${getAssemblyId()}/motions/${motionId}/publish`, { method: "POST" });
          await api(`/api/assemblies/${getAssemblyId()}/motions/present`, {
            method: "POST",
            body: { motionId }
          });
          ui.form.dataset.motionPresented = "1";
        }

        if (action === "present") {
          ui.dialog.close();
          showToast("Pregunta presentada. Falta abrir la votación.", "success");
          await refreshRoom?.();
          onMotionChanged?.();
          return;
        }

        setGlobalLoaderMessage("Abriendo votación…");
        await openVoting(
          getAssemblyId(),
          motionId,
          body.defaultResultVisibilityPolicy !== "LiveResults",
          body.defaultResultVisibilityPolicy
        );
        ui.dialog.close();
        showToast("Votación abierta. Los participantes ya pueden votar.", "success");
        await refreshRoom?.();
        onMotionChanged?.();
      } catch (err) {
        const reason = mapMotionActionError(err);
        const presented = ui.form.dataset.motionPresented === "1";
        const saved = Boolean(ui.form.dataset.motionId);
        const status = ui.form.querySelector("[data-partial-status]") || document.createElement("p");
        status.dataset.partialStatus = "1";
        status.setAttribute("role", "alert");
        status.textContent = presented
          ? `Pregunta guardada y presentada; no se pudo abrir. ${reason}`
          : saved
            ? `Pregunta guardada; no se pudo presentar. ${reason}`
            : reason;
        ui.form.querySelector(".lv-body")?.append(status);
        showToast(status.textContent, "error");
        await refreshRoom?.();
      } finally {
        submitting = false;
        forceHideGlobalLoader();
      }
    });
  }

  async function pickPrepared(opener) {
    const ui = openDialog(`
      <header><h3>Votaciones preparadas</h3></header>
      <p role="status">Cargando preguntas elegibles…</p>
    `, opener);
    if (!ui) return;
    let motions;
    try {
      motions = await api(`/api/assemblies/${getAssemblyId()}/motions`);
    } catch (err) {
      ui.form.innerHTML = `
        <header><h3>Votaciones preparadas</h3></header>
        <p role="alert">${escapeHtml(err.message || "No se pudieron cargar las preguntas.")}</p>
        <footer class="live-vote-dialog-actions">
          <button type="button" class="btn btn-secondary" data-retry>Reintentar</button>
          <button type="button" class="btn btn-ghost" data-dismiss>Cerrar</button>
        </footer>`;
      rememberForm(ui.form);
      ui.form.querySelector("[data-retry]")?.addEventListener("click", () => {
        ui.dialog.close();
        pickPrepared(opener);
      });
      return;
    }
    const list = (Array.isArray(motions) ? motions : []).filter(
      (m) => m.status === "Draft" || m.status === "Presented" || m.designStatus === "Ready"
    );
    if (!list.length) {
      ui.form.innerHTML = `
        <header><h3>Votaciones preparadas</h3></header>
        <p>No hay preguntas en borrador ni presentadas. Prepare una en el estudio o cree un borrador rápido.</p>
        <footer class="live-vote-dialog-actions">
          <button type="button" class="btn btn-secondary" data-dismiss>Cerrar</button>
          <a class="btn btn-primary" href="/voting-studio.html?assemblyId=${encodeURIComponent(getAssemblyId())}">Preparar votación</a>
        </footer>`;
      rememberForm(ui.form);
      return;
    }
    let gate = { allowed: false, reason: "Comprobando si la asamblea está en curso…" };
    try {
      gate = await assemblyCanPresent();
    } catch (err) {
      gate.reason = err.message || "No se pudo leer el estado de la asamblea.";
    }
    ui.form.innerHTML = `
      <header><h3>Votaciones preparadas</h3></header>
      <p role="status">${escapeHtml(gate.reason)}</p>
      <div class="stack">${list
        .map(
          (m) => `
        <label class="live-pick-row">
          <input type="radio" name="motionId" value="${m.id}" />
          <span><strong>${escapeHtml(m.code)}</strong> — ${escapeHtml(m.title)}
          <small class="muted">v${m.versionNumber || 1} · ${escapeHtml(assemblyLabel(m.status))}</small></span>
        </label>`
        )
        .join("")}</div>
      <footer class="live-vote-dialog-actions">
        <button type="button" class="btn btn-secondary" data-dismiss>Cancelar</button>
        <button type="submit" class="btn btn-primary" value="use" ${gate.allowed ? "" : "disabled"}>Usar / Presentar</button>
      </footer>
    `;
    rememberForm(ui.form);
    ui.form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      if (ev.submitter?.value === "cancel") {
        ui.dialog.close();
        return;
      }
      if (!gate.allowed) {
        showToast(gate.reason, "error");
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
        showToast("Pregunta presentada. Falta abrir la votación.", "success");
      } catch (err) {
        showToast(mapMotionActionError(err), "error");
      } finally {
        hideGlobalLoader();
      }
    }, { once: true });
  }

  async function editCurrent(opener) {
    const motion = getMotion();
    if (!motion) {
      showToast("No hay moción activa", "info");
      return;
    }
    const policy = await api(`/api/assemblies/${getAssemblyId()}/motions/${motion.id}/edit-policy`);
    if (!policy.canEditCritical) {
      const ui = openDialog(`
        <header><h3>No se puede editar ahora</h3></header>
        <p>Esta votación está actualmente en curso o ya tiene actividad.</p>
        <p class="muted">${escapeHtml(policy.message || "Para cambiar la pregunta debes cerrar o anular esta votación.")}</p>
        <footer class="live-vote-dialog-actions">
          <button type="button" class="btn btn-secondary" data-dismiss>Volver</button>
          ${policy.editMode === "WithdrawRequired" ? `<button type="submit" class="btn btn-primary" value="withdraw">Retirar apertura</button>` : ""}
          ${policy.editMode === "CancelRequired" ? `<button type="submit" class="btn btn-danger" value="void">Anular votación</button>` : ""}
        </footer>
      `, opener);
      if (!ui) return;
      ui.form.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const v = ev.submitter?.value;
        ui.dialog.close();
        if (v === "withdraw") await withdrawOpen();
        if (v === "void") await cancelOpen();
      }, { once: true });
      await syncLockBanner(document.querySelector("#questionnaire-panel"));
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
      <label>Umbral %<input name="threshold" type="number" step="0.01" value="${motion.requiredThresholdPercent ?? ""}" placeholder="Solo mayoría calificada" /></label>
      <label>Resultados
        <select name="vis">
          <option value="HiddenUntilClose">Ocultos hasta cierre</option>
          <option value="PresidentOnlyLive">Solo mesa</option>
          <option value="LiveResults">En vivo</option>
        </select>
      </label>
      <footer class="live-vote-dialog-actions">
        <button type="button" class="btn btn-secondary" data-dismiss>Cancelar</button>
        <button type="submit" class="btn btn-ghost" value="preview">Vista previa</button>
        <button type="submit" class="btn btn-primary" value="save">Guardar</button>
      </footer>
    `, opener);
    if (!ui) return;
    ui.form.querySelector('[name="calc"]').value = motion.calculationMethod || "Coefficient";
    ui.form.querySelector('[name="rule"]').value = motion.decisionRuleCode || "SimpleMajority";
    ui.form.querySelector('[name="vis"]').value = motion.defaultResultVisibilityPolicy || "HiddenUntilClose";
    rememberForm(ui.form);

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

  async function previewCurrent(opener) {
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
        <button type="button" class="btn btn-secondary" data-dismiss>Cerrar</button>
      </footer>
    `, opener);
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

  async function cancelOpen(opener) {
    const session = getSession();
    if (!session) return;
    const ui = openDialog(`
      <header><h3>Anular votación</h3></header>
      <p class="muted">Los votos ya registrados se conservan como evidencia y no se migran.</p>
      <label>Motivo de anulación (obligatorio)
        <textarea name="reason" rows="3" required minlength="5" placeholder="Ej. Se corrigió el monto indicado en la moción."></textarea>
      </label>
      <footer class="live-vote-dialog-actions">
        <button type="button" class="btn btn-secondary" data-dismiss>Cancelar</button>
        <button type="submit" class="btn btn-danger" value="confirm">Confirmar anulación</button>
      </footer>
    `, opener);
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

  async function showHistory(opener) {
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
          (h) => `<li><strong>V${h.versionNumber}</strong> · ${escapeHtml(assemblyLabel(h.status))}
          · votos ${h.acceptedBallots}
          ${h.cancellationReason ? `<br/><em>${escapeHtml(h.cancellationReason)}</em>` : ""}
          ${h.decisionStatus ? ` · ${escapeHtml(assemblyLabel(h.decisionStatus))}` : ""}</li>`
        )
        .join("") || "<li>Sin sesiones aún</li>"}</ul>
      <footer class="live-vote-dialog-actions">
        <button type="button" class="btn btn-secondary" data-dismiss>Cerrar</button>
      </footer>
    `, opener);
  }

  return {
    mountOperatorChrome,
    syncLockBanner,
    renderQuestionnaire,
    handleRealtime(name) {
      if (
        name === "votingCancelled" ||
        name === "votingVersionCreated" ||
        name === "votingOpened" ||
        name === "votingClosed" ||
        name === "motionUpdated"
      ) {
        syncLockBanner(document.querySelector("#questionnaire-panel"));
      }
    }
  };
}
