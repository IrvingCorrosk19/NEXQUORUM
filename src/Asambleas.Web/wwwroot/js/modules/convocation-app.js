import { api } from "./api.js";
import { hasPermission, logout, me } from "./auth.js";
import { assemblyIdFromUrl, confirmDialog, escapeHtml, formatDateTime, qs } from "./ui.js?v=agenda-return1";
import { AppFeedback, showPageError } from "./app-feedback.js";
import { runWithButton } from "./loading.js";
import { ensureAssemblyIdOrRedirect } from "./assembly-context.js";
import { bootIaPage } from "./ia-page.js?v=polish9";
import { mountReadinessActionBar } from "./readiness-actions.js";
import { isReadinessReturnContext } from "./return-context.js";
import { assemblyLabel } from "./assembly-labels.js";
import { applyAvatarElement, avatarCacheBust } from "./avatar-ui.js?v=own11";
import { applyTestHooks } from "./query-guard.js?v=polish15";

let assemblyId = assemblyIdFromUrl();
{
  const backNow = document.querySelector("#btn-back-assembly");
  if (backNow && assemblyId) backNow.href = `/dashboard.html?assemblyId=${encodeURIComponent(assemblyId)}`;
}
let selectedId = null;
let selectedPreview = null;
let selectedDetail = null;
let currentRecipients = [];
let createOwners = [];
let phId = null;
let assembly = null;
let createInFlight = false;
let sendInFlight = false;
let lastSendKey = null;
let lastMailboxCount = 0;
let formDirty = false;
let editingId = null;
let modalOpener = null;

function markFormDirty() {
  formDirty = true;
}

function openWorkDialog(opener) {
  const dlg = qs("#dlg-convocation");
  if (!dlg) return;
  if (opener) modalOpener = opener;
  else if (!modalOpener || !document.contains(modalOpener)) modalOpener = document.activeElement;
  if (dlg.parentElement !== document.body) document.body.appendChild(dlg);
  if (!dlg.open) dlg.showModal();
  qs("#conv-dialog-title")?.focus?.({ preventScroll: true });
}

function closeWorkDialog() {
  if (formDirty) {
    const ok = window.confirm("Hay cambios sin guardar. ¿Cerrar de todos modos?");
    if (!ok) return;
  }
  formDirty = false;
  rememberDraft(null);
  const dlg = qs("#dlg-convocation");
  if (dlg?.open) dlg.close();
  restoreModalFocus();
}

function restoreModalFocus() {
  const key = modalOpener?.getAttribute?.("data-id") || "";
  const live = key ? document.querySelector(`.conv-list-item[data-id="${CSS.escape(key)}"]`) : null;
  const opener = live || (modalOpener && document.contains(modalOpener) ? modalOpener : null);
  modalOpener = null;
  opener?.focus?.();
}

function showError(message) {
  showPageError(message, "error");
}

function statusEs(status) {
  const map = {
    Draft: "Borrador",
    Ready: "Lista",
    Approved: "Aprobada",
    Sending: "Enviando",
    Sent: "Enviada",
    Partial: "Parcial",
    Failed: "Fallida"
  };
  return map[status] || assemblyLabel(status);
}

function statusPillClass(status) {
  const key = String(status || "Draft").toLowerCase();
  if (key === "ready" || key === "approved") return "ready";
  if (key === "sending") return "sending";
  if (key === "sent") return "sent";
  if (key === "partial" || key === "failed") return "failed";
  return "draft";
}

function channelLabel(name) {
  const map = { Email: "Email", Portal: "Portal", WhatsApp: "WhatsApp", Sms: "SMS" };
  return map[name] || name;
}

function formatPanama(iso, timeZoneId) {
  if (!iso) return "Fecha por confirmar";
  try {
    const label = new Intl.DateTimeFormat("es-PA", {
      timeZone: timeZoneId || "America/Panama",
      dateStyle: "full",
      timeStyle: "short"
    }).format(new Date(iso));
    return `${label} (hora de Panamá)`;
  } catch {
    return `${formatDateTime(iso)} (hora de Panamá)`;
  }
}

function deliveryBadge(r) {
  const draft = Number(r.recipientCount || 0);
  const pending = Number(r.pendingDeliveryCount || 0);
  const accepted = Number(r.acceptedDeliveryCount || 0);
  const confirmed = Number(r.confirmedDeliveryCount || 0);
  const failed = Number(r.failedDeliveryCount || 0);
  const people = draft === 1 ? "1 destinatario del borrador" : `${draft} destinatarios del borrador`;
  if (pending + accepted + confirmed + failed === 0) {
    return `${people} · sin envío`;
  }
  return `${people} · ${pending} pendientes · ${accepted} aceptados · ${confirmed} entregados · ${failed} fallos`;
}

function syncDialogChrome(mode) {
  const cancel = qs("#conv-dialog-cancel");
  const save = qs("#btn-save-draft");
  if (cancel) cancel.textContent = mode === "detail" ? "Cerrar" : "Cancelar";
  if (save) {
    save.hidden = mode === "detail";
    save.textContent = mode === "edit" ? "Guardar cambios" : "Guardar borrador";
  }
}

function footerForStatus(detail) {
  if (!detail) return;
  if (detail.status === "Ready") {
    setCreateActionStatus("success", "Lista para enviar. Siguiente paso: elige destinatarios y pulsa Enviar convocatoria.");
  } else if (detail.status === "Approved") {
    setCreateActionStatus("success", "Aprobada. Siguiente paso: enviar a los destinatarios seleccionados.");
  } else if (detail.status === "Draft") {
    setCreateActionStatus("pending", "Borrador. Siguiente paso: validar. Validar no envía ni cuenta como entrega.");
  } else if (detail.status === "Sent") {
    setCreateActionStatus("success", "Envío aceptado. Revisa pendientes, entregas confirmadas y fallos.");
  } else if (detail.status === "Partial" || detail.status === "Failed") {
    setCreateActionStatus("error", "El envío no se completó para todos. Revisa cada entrega.");
  } else if (detail.status === "Sending") {
    setCreateActionStatus("pending", "Envío en curso. Espera el resultado por destinatario.");
  }
}

function renderChecks(checks) {
  if (!checks?.length) return "";
  return `<ul class="conv-checks">${checks
    .map(
      (c) => `<li class="${c.passed ? "is-pass" : "is-fail"}"><strong>${c.passed ? "Cumple" : "Pendiente"} · ${escapeHtml(c.label)}</strong><span>${escapeHtml(c.detail || "")}</span></li>`
    )
    .join("")}</ul>`;
}

function setStatusPill(el, status, fallback) {
  if (!el) return;
  const label = fallback || statusEs(status);
  el.textContent = label;
  el.className = `conv-status-pill conv-status-pill--${statusPillClass(status)}`;
}

function draftHashId() {
  const h = (location.hash || "").replace(/^#/, "");
  const fromC = h.match(/(?:^|&)c=([0-9a-f-]{36})/i);
  if (fromC) return fromC[1];
  if (/^[0-9a-f-]{36}$/i.test(h)) return h;
  return null;
}

function rememberDraft(id, { push = true } = {}) {
  const url = new URL(location.href);
  url.hash = id ? `c=${id}` : "";
  const next = `${url.pathname}${url.search}${url.hash}`;
  const current = `${location.pathname}${location.search}${location.hash}`;
  if (next === current) return;
  const state = { convocationId: id || null };
  if (push) history.pushState(state, "", next);
  else history.replaceState(state, "", next);
}

function normalizeOwnerList(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.items)) return data.items;
  if (Array.isArray(data.owners)) return data.owners;
  return [];
}

function isMockMailboxAvailable() {
  const host = location.hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
}

function supportRef(error) {
  return error?.correlationId || error?.payload?.correlationId || error?.payload?.extensions?.correlationId || "";
}

function setCreateActionStatus(kind, message, correlationId) {
  const el = qs("#create-action-status");
  if (!el) return;
  if (!message) {
    el.hidden = true;
    el.textContent = "";
    el.className = "conv-action-status";
    el.removeAttribute("role");
    return;
  }
  el.hidden = false;
  el.className = `conv-action-status conv-action-status--${kind || "pending"}`;
  el.setAttribute("role", kind === "error" ? "alert" : "status");
  const ref = correlationId ? ` Ref. ${correlationId}` : "";
  el.textContent = `${message}${ref}`;
  el.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

async function sha256Hex(text) {
  if (globalThis.crypto?.subtle) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  let h = 0xcbf29ce484222325n;
  for (const ch of String(text)) {
    h ^= BigInt(ch.charCodeAt(0));
    h = (h * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return h.toString(16).padStart(16, "0");
}

async function compactIdempotencyKey(prefix, parts) {
  const material = [prefix, ...parts.map((p) => String(p ?? ""))].join("|");
  const digest = await sha256Hex(material);
  return `${prefix}:${digest}`;
}

function showCreateChannelError(message) {
  const err = qs("#create-channels-error");
  const host = qs(".conv-channels");
  if (err) {
    err.hidden = !message;
    err.textContent = message || "";
  }
  host?.classList.toggle("is-invalid", Boolean(message));
  if (message) {
    qs('input[name="ch"]')?.focus?.({ preventScroll: true });
  }
}

function applyCreateServerError(error) {
  const code = String(error?.code || "");
  const msg = String(error?.message || "");
  if (code === "OWNER_NOT_ELIGIBLE" || code === "OWNER_IDS_REQUIRED" || code === "NO_RECIPIENTS") {
    showCreateRecipientError(msg || "Revisa los destinatarios del borrador.");
    return true;
  }
  if (code === "CHANNELS_REQUIRED" || /channel/i.test(msg)) {
    showCreateChannelError(msg || "Selecciona al menos un canal.");
    return true;
  }
  if (code === "TITLE_REQUIRED") {
    AppFeedback.field.error(qs("#c-title"), msg || "Indica un título para el borrador.");
    qs("#c-title")?.focus?.();
    return true;
  }
  if (code === "SUBJECT_REQUIRED") {
    AppFeedback.field.error(qs("#c-subject"), msg || "Indica un asunto para el borrador.");
    qs("#c-subject")?.focus?.();
    return true;
  }
  return false;
}

async function snapshotMailbox() {
  if (!isMockMailboxAvailable()) {
    lastMailboxCount = -1;
    return;
  }
  try {
    const rows = await api("/api/dev/mock-mailbox");
    lastMailboxCount = Array.isArray(rows) ? rows.length : 0;
  } catch {
    lastMailboxCount = -1;
  }
}

function openCreateDialog(opener) {
  const sheet = qs("#create-sheet");
  const panel = qs("#detail-panel");
  if (sheet) {
    sheet.hidden = false;
    sheet.open = true;
  }
  if (panel) panel.hidden = true;
  editingId = null;
  syncDialogChrome("create");
  const title = qs("#conv-dialog-title");
  if (title) title.textContent = "Nueva convocatoria";
  formDirty = false;
  setCreateActionStatus("", "");
  openWorkDialog(opener);
}

function collapseCreateForm() {
  const sheet = qs("#create-sheet");
  if (sheet) sheet.open = false;
}

function expandCreateForm() {
  const sheet = qs("#create-sheet");
  if (sheet) sheet.open = true;
}

function showCreateRecipientError(message) {
  const err = qs("#create-recipients-error");
  const host = qs("#create-owner-picker");
  const list = host?.querySelector(".conv-picker");
  if (err) {
    err.hidden = !message;
    err.textContent = message || "";
  }
  list?.classList.toggle("is-invalid", Boolean(message));
  if (!message) return;
  const first = host?.querySelector(".create-owner-check");
  (first || host)?.focus?.({ preventScroll: true });
  host?.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

async function loadCreateOwnerPicker() {
  const host = qs("#create-owner-picker");
  if (!host || !phId) {
    if (host) host.innerHTML = `<p class="text-secondary">No se pudo cargar el PH.</p>`;
    return;
  }
  try {
    const [active, invited] = await Promise.all([
      api(`/api/ph/${phId}/owners?status=Active`),
      api(`/api/ph/${phId}/owners?status=Invited`).catch(() => [])
    ]);
    const map = new Map();
    for (const o of [...normalizeOwnerList(active), ...normalizeOwnerList(invited)]) {
      if (o?.id) map.set(String(o.id), o);
    }
    createOwners = [...map.values()].sort((a, b) =>
      String(a.displayName || "").localeCompare(String(b.displayName || ""), "es")
    );
    if (!createOwners.length) {
      host.innerHTML = `<p class="text-secondary">No hay propietarios Activo/Invitado con unidad. Asigna unidades antes de convocar.</p>`;
      return;
    }
    host.innerHTML = `
      <ul class="conv-picker" id="create-owner-list">
        ${createOwners
          .map(
            (o) => `
          <li>
            <input type="checkbox" class="create-owner-check form-check-input" value="${escapeHtml(o.id)}" data-name="${escapeHtml(o.displayName || "")}" />
            <span style="flex:1">
              <strong>${escapeHtml(o.displayName || "—")}</strong>
              <span class="text-secondary"> · ${escapeHtml(o.email || "sin email")}</span>
              <span class="text-secondary"> · ${(o.unitCodes || []).join(", ") || "sin unidad"}</span>
            </span>
            <span class="badge">${escapeHtml(assemblyLabel(o.status))}</span>
          </li>`
          )
          .join("")}
      </ul>`;
  } catch (e) {
    host.innerHTML = `<p class="text-secondary">${escapeHtml(e.message || "Error al cargar propietarios.")}</p>`;
  }
}

function selectedCreateOwnerIds() {
  return [...document.querySelectorAll(".create-owner-check:checked")].map((el) => el.value);
}

function paintHeader(status) {
  const phLine = qs("#conv-ph-line");
  const whenLine = qs("#conv-when-line");
  const title = qs("#conv-page-title");
  if (title) title.textContent = assembly?.title || "Preparar convocatoria";
  if (phLine) phLine.textContent = assembly?.propertyHorizontalName || "PH activo";
  if (whenLine) {
    whenLine.textContent = formatPanama(
      assembly?.scheduledAtUtc || assembly?.scheduledAt,
      assembly?.timeZoneId || "America/Panama"
    );
  }
  if (status) setStatusPill(qs("#conv-status-pill"), status, statusEs(status));
  const back = qs("#btn-back-assembly");
  if (back && assemblyId) {
    back.href = `/dashboard.html?assemblyId=${encodeURIComponent(assemblyId)}`;
    back.textContent = "Volver a la asamblea";
  }
}

async function refreshList() {
  const panel = qs("#list-panel");
  try {
    if (window.__ASAM_TEST_LIST_FAIL) {
      window.__ASAM_TEST_LIST_FAIL = false;
      throw new Error("No se pudieron cargar los borradores.");
    }
    const rows = await api(`/api/assemblies/${assemblyId}/convocations`);
    if (!Array.isArray(rows)) {
      throw new Error("No se pudieron cargar los borradores.");
    }
    const scope = qs("#conv-scope-line");
    if (!rows.length) {
      panel.innerHTML = `<div class="empty-state">Sin borrador. Crea la primera convocatoria para este PH.</div>`;
      setStatusPill(qs("#conv-status-pill"), "Draft", "Sin borrador");
      if (scope) scope.textContent = "No hay convocatorias en esta asamblea.";
      return rows;
    }
    const active = rows.find((r) => r.id === selectedId) || rows[0];
    if (scope) {
      scope.textContent = rows.length === 1
        ? `Esta página resume «${active.title}», versión ${active.version || 1}.`
        : `Hay ${rows.length} convocatorias. La resumida ahora es «${active.title}», versión ${active.version || 1}.`;
    }
    panel.innerHTML = rows
      .map((r) => {
        const when = r.sentAtUtc;
        const whenLabel = when ? formatDateTime(when) : "Sin fecha de envío";
        return `
    <button type="button" class="conv-list-item${selectedId === r.id ? " is-active" : ""}" data-id="${r.id}">
      <span><strong>${escapeHtml(r.title)}</strong><br><span class="text-secondary">${escapeHtml(whenLabel)} · ${escapeHtml(statusEs(r.status))} · v${r.version || 1}</span></span>
      <span class="badge">${escapeHtml(deliveryBadge(r))}</span>
    </button>`;
      })
      .join("");
    panel.querySelectorAll("[data-id]").forEach((btn) => {
      btn.addEventListener("click", () => openDetail(btn.getAttribute("data-id"), btn));
    });
    if (!selectedId) paintHeader(rows[0].status);
    return rows;
  } catch (e) {
    const ref = supportRef(e);
    panel.innerHTML = `<div class="alert alert-danger" role="alert">No se pudieron cargar los borradores.${
      ref ? ` Ref. ${escapeHtml(ref)}` : ""
    }</div>`;
    return null;
  }
}

function renderDraftRecipients(recipients) {
  if (!recipients?.length) {
    return `<p class="text-secondary">Este borrador no tiene destinatarios.</p>`;
  }
  return `
    <ul class="conv-readonly">
      ${recipients
        .map(
          (r) => `<li>
            <strong>${escapeHtml(r.displayName)}</strong>
            <span class="text-secondary"> · ${escapeHtml(r.email || "sin email")}</span>
            ${r.isValid ? "" : ` <span class="badge">Datos incompletos</span>`}
          </li>`
        )
        .join("")}
    </ul>`;
}

function renderRecipientPicker(recipients) {
  currentRecipients = Array.isArray(recipients) ? recipients : [];
  const valid = currentRecipients.filter((r) => r.isValid);
  if (!valid.length) {
    return `<div class="empty-state">No hay destinatarios válidos para este envío.</div>`;
  }
  return `
    <div class="conv-recipients">
      <div class="conv-section__head">
        <h3 class="conv-section__title">Destinatarios de este envío</h3>
        <div class="cta-row conv-section__actions">
          <button type="button" class="btn btn-ghost btn-sm" id="btn-select-all">Todos</button>
          <button type="button" class="btn btn-ghost btn-sm" id="btn-select-none">Ninguno</button>
        </div>
      </div>
      <p class="text-secondary">Marca solo a quienes quieres notificar ahora. El resto permanece en el borrador.</p>
      <p id="send-recipients-error" class="field-error" hidden role="alert"></p>
      <ul class="conv-picker" id="recipient-list">
        ${valid
          .map(
            (r) => `
          <li>
            <input type="checkbox" class="rcpt-check form-check-input" value="${escapeHtml(r.id)}" data-name="${escapeHtml(r.displayName)}" checked />
            <span style="flex:1">
              <strong>${escapeHtml(r.displayName)}</strong>
              <span class="text-secondary"> · ${escapeHtml(r.email || "sin email")}</span>
            </span>
            <span class="badge badge-success">OK</span>
          </li>`
          )
          .join("")}
      </ul>
      ${
        currentRecipients.some((r) => !r.isValid)
          ? `<p class="text-secondary" style="margin-top:0.75rem">Omitidos por datos incompletos: ${currentRecipients
              .filter((r) => !r.isValid)
              .map((r) => escapeHtml(r.displayName))
              .join(", ")}</p>`
          : ""
      }
      <p class="conv-send-summary" id="send-summary" role="status"></p>
    </div>`;
}

function selectedRecipientIds() {
  return [...document.querySelectorAll(".rcpt-check:checked")].map((el) => el.value);
}

function updateSendSummary() {
  const el = qs("#send-summary");
  if (!el || !selectedDetail) return;
  const ids = selectedRecipientIds();
  const channels = (selectedDetail.channels || []).map(channelLabel);
  const channelText = channels.length ? channels.join(" y ") : "ningún canal";
  const people = ids.length === 1 ? "1 destinatario seleccionado para enviar" : `${ids.length} destinatarios seleccionados para enviar`;
  const draftCount = currentRecipients.length;
  el.textContent = ids.length
    ? `${draftCount} en el borrador. ${people} por ${channelText}. Todavía no hay entrega.`
    : `${draftCount} en el borrador. No hay destinatarios seleccionados para este envío.`;
}

function showSendRecipientError(message) {
  const err = qs("#send-recipients-error");
  const list = qs("#recipient-list");
  if (err) {
    err.hidden = !message;
    err.textContent = message || "";
  }
  list?.classList.toggle("is-invalid", Boolean(message));
  if (message) {
    const first = list?.querySelector(".rcpt-check");
    (first || list)?.focus?.({ preventScroll: true });
  }
}

function wireRecipientPicker() {
  qs("#btn-select-all")?.addEventListener("click", () => {
    document.querySelectorAll(".rcpt-check").forEach((el) => {
      el.checked = true;
    });
    showSendRecipientError("");
    updateSendSummary();
  });
  qs("#btn-select-none")?.addEventListener("click", () => {
    document.querySelectorAll(".rcpt-check").forEach((el) => {
      el.checked = false;
    });
    updateSendSummary();
  });
  document.querySelectorAll(".rcpt-check").forEach((el) => {
    el.addEventListener("change", () => {
      showSendRecipientError("");
      updateSendSummary();
    });
  });
  updateSendSummary();
}

async function loadEmailPreview(id) {
  const frame = qs("#conv-preview-frame");
  if (!frame) return;
  const subj = qs("#conv-preview-subject");
  if (subj) subj.textContent = "Cargando vista previa…";
  frame.srcdoc = `<body style="font-family:DM Sans,sans-serif;padding:24px;color:#3e536b"><p>Cargando vista previa…</p></body>`;
  try {
    const preview = await api(`/api/convocations/${id}/email-preview`);
    frame.srcdoc = preview.html || "";
    frame.onload = () => {
      const height = frame.contentDocument?.documentElement?.scrollHeight || 0;
      if (height > 0) frame.style.height = `${height + 8}px`;
    };
    const subj = qs("#conv-preview-subject");
    if (subj) subj.textContent = preview.subject || "Vista previa";
  } catch (e) {
    frame.srcdoc = `<body style="font-family:DM Sans,sans-serif;padding:24px;color:#5c6f89"><p>${escapeHtml(e.message || "No se pudo cargar la vista previa.")}</p></body>`;
  }
}

async function openDetail(id, opener, { pushHash = true } = {}) {
  selectedId = id;
  rememberDraft(id, { push: pushHash });
  const detail = await api(`/api/convocations/${id}`);
  selectedDetail = detail;
  const panel = qs("#detail-panel");
  const sheet = qs("#create-sheet");
  if (sheet) sheet.hidden = true;
  panel.hidden = false;
  const save = qs("#btn-save-draft");
  if (save) save.hidden = true;
  const dialogTitle = qs("#conv-dialog-title");
  if (dialogTitle) dialogTitle.textContent = detail.title || "Convocatoria";
  openWorkDialog(opener);
  selectedPreview = detail.preview || null;
  paintHeader(detail.status);
  setStatusPill(qs("#detail-status-pill"), detail.status);

  const alreadySent = ["Sending", "Sent", "Partial", "Failed"].includes(detail.status);
  const sendBtn = qs("#btn-send");
  const validateBtn = qs("#btn-validate");
  if (sendBtn) {
    sendBtn.disabled = alreadySent;
    sendBtn.textContent = "Enviar convocatoria";
  }
  if (validateBtn) validateBtn.disabled = alreadySent;
  qs("#detail-actions").hidden = alreadySent;
  lastSendKey = alreadySent ? null : lastSendKey;
  syncDialogChrome("detail");
  footerForStatus(detail);

  const titleEl = qs("#detail-title");
  if (titleEl) titleEl.textContent = detail.title || "Detalle y envío";
  const notes = String(detail.bodyText || "").trim();
  const internalNotes = notes && !/^Convocatoria institucional\.?$/.test(notes) ? notes : "";

  qs("#detail-body").innerHTML = `
    <div class="conv-detail-nav" role="tablist" aria-label="Secciones de la convocatoria">
      <button type="button" class="btn btn-secondary btn-sm" data-conv-tab="summary" aria-selected="true">Resumen</button>
      <button type="button" class="btn btn-ghost btn-sm" data-conv-tab="recipients" aria-selected="false">Destinatarios</button>
      <button type="button" class="btn btn-ghost btn-sm" data-conv-tab="preview" aria-selected="false">Vista previa</button>
      <button type="button" class="btn btn-ghost btn-sm" data-conv-tab="deliveries" aria-selected="false">Entregas</button>
    </div>
    <section class="conv-section" data-conv-panel="summary">
      <p class="text-secondary">Asunto que verá el destinatario: ${escapeHtml(detail.subject || "sin asunto")}</p>
      <p>Canales del borrador: ${detail.channels.map((ch) => escapeHtml(channelLabel(ch))).join(", ") || "ninguno"} · versión ${detail.version || 1}</p>
      ${internalNotes ? `<p class="text-secondary">Notas internas (no se envían): ${escapeHtml(internalNotes)}</p>` : `<p class="text-secondary">Sin notas internas.</p>`}
      ${renderChecks(detail.checks)}
      ${alreadySent ? "" : `<button type="button" class="btn btn-secondary" id="btn-edit-convocation">Editar</button>`}
      ${
        selectedPreview
          ? `<details class="mt-2"><summary>Detalle técnico</summary><p class="text-secondary">${selectedPreview.sandboxMode ? "Modo prueba (sandbox): no se usa SMTP real." : "SMTP real activo."}${selectedPreview.testRecipientOverride ? ` Destino de prueba: ${escapeHtml(selectedPreview.testRecipientOverride)}.` : ""} Entorno: ${escapeHtml(selectedPreview.environmentLabel || "—")}.</p></details>`
          : ""
      }
    </section>
    <section class="conv-section" data-conv-panel="recipients" hidden>
      <h3 class="conv-section__title">Destinatarios del borrador (${detail.recipients?.length || 0})</h3>
      ${renderDraftRecipients(detail.recipients)}
      ${alreadySent ? "" : renderRecipientPicker(detail.recipients)}
    </section>
    <section class="conv-section" data-conv-panel="preview" hidden>
      <h3 class="conv-section__title">Vista previa del envío</h3>
      <p class="text-secondary" id="conv-preview-subject">Cargando el mismo asunto que se enviará…</p>
      <p class="text-secondary">El botón del correo es un enlace demostrativo. El envío real crea un enlace personal de acceso.</p>
      <div class="conv-email-preview">
        <iframe id="conv-preview-frame" title="Vista previa del correo de convocatoria" sandbox="" scrolling="no"></iframe>
      </div>
    </section>
    <section class="conv-section" data-conv-panel="deliveries" hidden>
      <div id="deliveries" class="conv-deliveries"></div>
    </section>
  `;
  qs("#detail-body").querySelectorAll("[data-conv-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const name = btn.getAttribute("data-conv-tab");
      qs("#detail-body").querySelectorAll("[data-conv-tab]").forEach((other) => {
        const on = other === btn;
        other.setAttribute("aria-selected", on ? "true" : "false");
        other.classList.toggle("btn-secondary", on);
        other.classList.toggle("btn-ghost", !on);
      });
      qs("#detail-body").querySelectorAll("[data-conv-panel]").forEach((panel) => {
        panel.hidden = panel.getAttribute("data-conv-panel") !== name;
      });
    });
  });
  qs("#btn-edit-convocation")?.addEventListener("click", () => beginEdit(detail));

  if (!alreadySent) wireRecipientPicker();

  titleEl?.focus?.({ preventScroll: true });
  await loadEmailPreview(id);
  await refreshList();

  try {
    const deliveries = await api(`/api/convocations/${id}/deliveries`);
    const host = qs("#deliveries");
    const names = new Map((detail.recipients || []).map((r) => [String(r.id), r.displayName || r.email || "Destinatario"]));
    if (host) {
      host.innerHTML = deliveries.length
        ? `<h3 class="conv-section__title">Entregas</h3>` +
          deliveries
            .map((d) => {
              const who = names.get(String(d.recipientId)) || "Destinatario";
              const when = d.deliveredAtUtc || d.sentAtUtc;
              return `<article class="conv-list-item" tabindex="-1">
              <span><strong>${escapeHtml(who)}</strong><br><span class="text-secondary">${escapeHtml(channelLabel(d.channel))} · ${escapeHtml(when ? formatDateTime(when) : "Sin fecha")}</span></span>
              <span class="badge">${escapeHtml(deliveryStatusEs(d.status))}</span>
              <details><summary>Detalle técnico</summary><p class="text-secondary mb-0">${escapeHtml(d.destination || "sin destino")}${d.wasRedirectedToTestOverride ? " · redirigido a prueba" : ""}${d.providerType ? ` · ${escapeHtml(d.providerType)}` : ""}${d.providerMessageId ? ` · id ${escapeHtml(d.providerMessageId)}` : ""}</p></details>
            </article>`;
            })
            .join("")
        : `<p class="text-secondary">Sin envíos. Seleccionar o validar destinatarios no crea una entrega.</p>`;
    }
  } catch {
    const host = qs("#deliveries");
    if (host) host.innerHTML = `<p class="text-secondary">No se pudieron cargar las entregas.</p>`;
  }
  if (alreadySent) await renderDeliveryPanel(id);
}

function deliveryStatusEs(status) {
  const map = {
    Pending: "Pendiente",
    Queued: "En cola",
    Sent: "Enviada al proveedor",
    Delivered: "Entregada al destinatario",
    Failed: "Fallida",
    Bounced: "Rebotada",
    Skipped: "Omitida",
    NotSent: "No enviada"
  };
  return map[status] || assemblyLabel(status);
}

function beginEdit(detail) {
  editingId = detail.id;
  const sheet = qs("#create-sheet");
  if (sheet) {
    sheet.hidden = false;
    sheet.open = true;
  }
  const title = qs("#c-title");
  const subject = qs("#c-subject");
  const notes = qs("#c-html");
  if (title) title.value = detail.title || "";
  if (subject) subject.value = detail.subject || "";
  const stored = String(detail.bodyText || "").trim();
  if (notes) notes.value = /^Convocatoria institucional\.?$/.test(stored) ? "" : stored;
  document.querySelectorAll('input[name="ch"]').forEach((el) => {
    el.checked = (detail.channels || []).includes(el.value);
  });
  const ownerIds = new Set((detail.recipients || []).map((r) => r.ownerId).filter(Boolean).map(String));
  document.querySelectorAll(".create-owner-check").forEach((el) => {
    el.checked = ownerIds.has(el.value);
  });
  syncDialogChrome("edit");
  formDirty = false;
  setCreateActionStatus("pending", "Editas el borrador. Guardar cambios invalida la validación anterior.");
  title?.focus?.();
}

async function renderDeliveryPanel(convocationId) {
  const host = qs("#deliveries") || qs("#detail-body");
  try {
    const rows = await api(`/api/convocations/${convocationId}/recipient-deliveries`);
    const pending = rows.filter((r) => r.deliveryStatus === "NotSent" || r.deliveryStatus === "Failed" || r.deliveryStatus === "Pending");
    host.insertAdjacentHTML(
      "beforeend",
      `
      <div style="margin-top:1.25rem">
        <div class="conv-section__head">
          <h3 class="conv-section__title">Destinatarios y reenvío</h3>
          <div class="cta-row conv-section__actions">
            <button type="button" class="btn btn-secondary" id="btn-resend-selected">Reenviar seleccionados</button>
            <button type="button" class="btn btn-primary" id="btn-resend-pending"${pending.length ? "" : " disabled"}>Reenviar pendientes (${pending.length})</button>
          </div>
        </div>
        <ul class="conv-picker">
          ${rows
            .map(
              (r) => `
            <li>
              <input type="checkbox" class="rcpt-check form-check-input" value="${escapeHtml(r.recipientId)}" ${r.canResend ? "checked" : "disabled"} />
              <span style="flex:1">
                <strong>${escapeHtml(r.displayName)}</strong>
                <span class="text-secondary"> · ${escapeHtml(r.email || "sin email")}</span>
                <span class="text-secondary"> · intentos ${r.emailAttemptCount}</span>
              </span>
              <span class="badge">${escapeHtml(deliveryStatusEs(r.deliveryStatus))}</span>
              <button type="button" class="btn btn-ghost btn-sm" data-resend-one="${escapeHtml(r.recipientId)}" ${r.canResend ? "" : "disabled"}>Reenviar</button>
              <button type="button" class="btn btn-ghost btn-sm" data-regen-one="${escapeHtml(r.recipientId)}" ${r.canResend ? "" : "disabled"} title="Invalida el enlace anterior">Regenerar enlace</button>
            </li>`
            )
            .join("")}
        </ul>
      </div>`
    );

    qs("#btn-resend-selected")?.addEventListener("click", () => resendSelected(false));
    qs("#btn-resend-pending")?.addEventListener("click", () => resendSelected(true));
    document.querySelectorAll("[data-resend-one]").forEach((btn) => {
      btn.addEventListener("click", () => resendOne(btn.getAttribute("data-resend-one")));
    });
    document.querySelectorAll("[data-regen-one]").forEach((btn) => {
      btn.addEventListener("click", () => regenerateOne(btn.getAttribute("data-regen-one")));
    });

    if (phId) {
      const presentOwnerEmails = new Set(
        rows.map((r) => String(r.email || "").trim().toLowerCase()).filter(Boolean)
      );
      const missing = createOwners.filter(
        (o) => o.email && !presentOwnerEmails.has(String(o.email).trim().toLowerCase())
      );
      if (missing.length) {
        host.insertAdjacentHTML(
          "beforeend",
          `
          <div style="margin-top:1.25rem" id="add-recipients-box">
            <h3 class="conv-section__title">Agregar destinatarios faltantes</h3>
            <p class="text-secondary">Marca propietarios elegibles que no están en esta convocatoria y reenvía solo a ellos.</p>
            <ul class="conv-picker" style="max-height:12rem">
              ${missing
                .map(
                  (o) => `
                <li>
                  <input type="checkbox" class="add-owner-check form-check-input" value="${escapeHtml(o.id)}" />
                  <span>${escapeHtml(o.displayName || "—")} · ${escapeHtml(o.email || "")}</span>
                </li>`
                )
                .join("")}
            </ul>
            <button type="button" class="btn btn-primary" id="btn-add-and-resend">Agregar y reenviar</button>
          </div>`
        );
        qs("#btn-add-and-resend")?.addEventListener("click", addAndResend);
      }
    }
  } catch (e) {
    host.insertAdjacentHTML("beforeend", `<p class="text-secondary">${escapeHtml(e.message || "No se pudo cargar el historial.")}</p>`);
  }
}

async function addAndResend() {
  if (!selectedId) return;
  const ownerIds = [...document.querySelectorAll(".add-owner-check:checked")].map((el) => el.value);
  if (!ownerIds.length) {
    AppFeedback.warning("Selecciona al menos un propietario para agregar.", { title: "Sin selección" });
    return;
  }
  try {
    const detail = await api(`/api/convocations/${selectedId}/recipients`, {
      method: "POST",
      body: { ownerIds }
    });
    const emails = new Set(
      createOwners.filter((o) => ownerIds.includes(String(o.id))).map((o) => String(o.email || "").toLowerCase())
    );
    const recipientIds = (detail.recipients || [])
      .filter((r) => emails.has(String(r.email || "").toLowerCase()) || ownerIds.includes(String(r.ownerId || "")))
      .map((r) => r.id);
    if (!recipientIds.length) {
      AppFeedback.warning("Se agregaron, pero no hay IDs de destinatario para reenviar. Abre el detalle e intenta reenviar.", {
        title: "Destinatarios agregados"
      });
      await openDetail(selectedId);
      return;
    }
    await doResend({ recipientIds, onlyFailedOrPending: false });
    AppFeedback.success(`Se agregó y notificó a ${recipientIds.length} destinatario(s).`, {
      title: "Invitación enviada"
    });
    await openDetail(selectedId);
    await refreshList();
  } catch (e) {
    AppFeedback.fromError(e, "No se pudieron agregar los destinatarios.");
  }
}

async function resendOne(recipientId) {
  if (!selectedId || !recipientId) return;
  const ok = await confirmDialog({
    title: "Reenviar convocatoria",
    body: "Se reenviará el mismo enlace activo (no se genera un token nuevo).",
    confirmLabel: "Reenviar"
  });
  if (!ok) return;
  await doResend({ recipientIds: [recipientId], onlyFailedOrPending: false });
}

async function regenerateOne(recipientId) {
  if (!selectedId || !recipientId) return;
  const ok = await confirmDialog({
    title: "Regenerar enlace",
    body: "Al generar un nuevo enlace, el enlace anterior dejará de funcionar inmediatamente.",
    confirmLabel: "Regenerar y enviar",
    danger: true
  });
  if (!ok) return;
  const reason = window.prompt("Motivo de la regeneración (obligatorio):", "Solicitud del propietario")?.trim();
  if (!reason || reason.length < 3) {
    AppFeedback.warning("Debe indicar un motivo de al menos 3 caracteres.", { title: "Motivo requerido" });
    return;
  }
  try {
    const batch = await api(`/api/convocations/${selectedId}/recipients/${recipientId}/regenerate-link`, {
      method: "POST",
      body: {
        confirmed: true,
        reason,
        idempotencyKey: `regen-${selectedId}-${recipientId}`
      }
    });
    AppFeedback.success(`Enlace regenerado. Envíos: ${batch.sentCount ?? 0}.`, { title: "Enlace nuevo" });
    await openDetail(selectedId);
  } catch (e) {
    AppFeedback.error(e.message || "No se pudo regenerar el enlace.", { title: "Error" });
  }
}

async function resendSelected(onlyPending) {
  if (!selectedId) return;
  const ids = onlyPending ? null : selectedRecipientIds();
  if (!onlyPending && (!ids || !ids.length)) {
    AppFeedback.warning("Marca al menos un destinatario antes de reenviar.", { title: "Selección requerida" });
    return;
  }
  const ok = await confirmDialog({
    title: onlyPending ? "Reenviar pendientes" : "Reenviar seleccionados",
    body: onlyPending
      ? "Se reenviará a destinatarios sin envío exitoso."
      : `Se reenviará a ${ids.length} destinatario(s).`,
    confirmLabel: "Reenviar"
  });
  if (!ok) return;
  await doResend({
    recipientIds: onlyPending ? undefined : ids,
    onlyFailedOrPending: onlyPending
  });
}

async function doResend({ recipientIds, onlyFailedOrPending }) {
  try {
    const keyParts = (recipientIds || []).slice().sort().join("-") || "pending";
    const batch = await api(`/api/convocations/${selectedId}/resend`, {
      method: "POST",
      body: {
        confirmed: true,
        recipientIds: recipientIds || null,
        onlyFailedOrPending: Boolean(onlyFailedOrPending),
        idempotencyKey: `resend-${selectedId}-${keyParts}`
      }
    });
    if (batch.failedCount) {
      AppFeedback.warning(`Enviados ${batch.sentCount} · ${batch.failedCount} pendientes.`, {
        title: "Reenvío parcial"
      });
    } else {
      AppFeedback.success(`Se reenvió correctamente a ${batch.sentCount} destinatario(s).`, {
        title: "Convocatorias reenviadas"
      });
    }
    await openDetail(selectedId);
    await refreshList();
  } catch (e) {
    AppFeedback.fromError(e, "No pudimos completar el reenvío.");
  }
}

async function init() {
  if (!assemblyId) {
    assemblyId = await ensureAssemblyIdOrRedirect();
    if (!assemblyId) {
      showError("Falta assemblyId.");
      return;
    }
    return;
  }

  let user;
  try {
    user = await me();
  } catch {
    location.href = "/";
    return;
  }

  if (qs("#user-chip")) qs("#user-chip").textContent = user.displayName;
  if (qs("#account-role-label")) qs("#account-role-label").textContent = user.displayName || user.email || "Cuenta";
  const avatar = qs("#user-avatar");
  if (avatar) {
    const url = user.avatarUrl ? avatarCacheBust(user.avatarUrl) : null;
    applyAvatarElement(avatar, { url, label: user.displayName || user.email || "AS" });
  }
  await bootIaPage({ current: "asm-convocation", pageLabel: "Convocatoria" });
  qs("#btn-logout")?.addEventListener("click", async (ev) => {
    ev.preventDefault();
    await logout();
    location.href = "/";
  });

  try {
    assembly = await api(`/api/assemblies/${assemblyId}`);
    phId = assembly.propertyHorizontalId || assembly.propertyHorizontal?.id || null;
  } catch {
    phId = null;
  }
  paintHeader(null);
  await loadCreateOwnerPicker();
  await snapshotMailbox();

  qs("#create-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (createInFlight) return;
    if (!hasPermission(user, "convocations:create")) {
      AppFeedback.warning("No tienes permiso para crear convocatorias.", { title: "Sin permiso" });
      return;
    }
    const channels = [...document.querySelectorAll('input[name="ch"]:checked')].map((el) => el.value);
    const title = qs("#c-title").value.trim();
    const subject = qs("#c-subject").value.trim() || title;
    const notes = qs("#c-html").value.trim();
    const ownerIds = selectedCreateOwnerIds();
    AppFeedback.field.clearForm(qs("#create-form"));
    showCreateChannelError("");
    if (!channels.length) {
      showCreateChannelError("Selecciona al menos un canal.");
      setCreateActionStatus("error", "No se pudo guardar el borrador");
      return;
    }
    if (!ownerIds.length) {
      showCreateRecipientError("Selecciona al menos un destinatario del borrador.");
      setCreateActionStatus("error", "No se pudo guardar el borrador");
      return;
    }
    showCreateRecipientError("");
    const saveBtn = qs("#btn-save-draft");
    createInFlight = true;
    setCreateActionStatus("pending", "Guardando…");
    try {
      const created = await runWithButton(saveBtn, "Guardando…", async () => {
        await applyTestHooks();
        const idempotencyKey = await compactIdempotencyKey("draft", [
          assemblyId,
          title,
          channels.slice().sort().join(","),
          ownerIds.slice().sort().join(",")
        ]);
        const payload = {
          assemblyId,
          title,
          subject,
          bodyHtml: notes,
          bodyText: notes,
          channels,
          ownerIds,
          idempotencyKey
        };
        if (editingId) {
          return api(`/api/convocations/${editingId}`, { method: "PUT", body: payload });
        }
        return api(`/api/assemblies/${assemblyId}/convocations`, {
          method: "POST",
          body: payload
        });
      });
      const mailboxAfter = lastMailboxCount;
      await snapshotMailbox();
      const mailed = lastMailboxCount > mailboxAfter && mailboxAfter >= 0;
      if (mailed) {
        setCreateActionStatus("error", "Borrador guardado, pero el buzón de prueba recibió correo");
        AppFeedback.warning("El borrador se guardó, pero el buzón de prueba recibió correo. Revisa el envío.", {
          title: "Atención"
        });
      } else if (editingId) {
        setCreateActionStatus("success", "Cambios guardados. La validación anterior quedó invalidada. Siguiente paso: validar de nuevo.");
      } else {
        setCreateActionStatus("success", "Borrador guardado. Siguiente paso: validar. Guardar no envía.");
      }
      editingId = null;
      formDirty = false;
      collapseCreateForm();
      await refreshList();
      await openDetail(created.id);
    } catch (e) {
      expandCreateForm();
      const mapped = applyCreateServerError(e);
      const ref = supportRef(e);
      setCreateActionStatus("error", "No se pudo guardar el borrador", mapped ? "" : ref);
      if (!mapped) {
        const statusEl = qs("#create-action-status");
        statusEl?.focus?.({ preventScroll: true });
        statusEl?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    } finally {
      createInFlight = false;
      if (saveBtn) saveBtn.textContent = "Guardar borrador";
    }
  });

  qs("#btn-new-convocation")?.addEventListener("click", (ev) => openCreateDialog(ev.currentTarget));
  qs("#conv-dialog-close")?.addEventListener("click", () => closeWorkDialog());
  qs("#conv-dialog-cancel")?.addEventListener("click", () => closeWorkDialog());
  qs("#create-form")?.addEventListener("input", markFormDirty);
  qs("#dlg-convocation")?.addEventListener("cancel", (ev) => {
    ev.preventDefault();
    closeWorkDialog();
  });
  qs("#dlg-convocation")?.addEventListener("keydown", (ev) => {
    if (ev.key !== "Escape") return;
    ev.preventDefault();
    closeWorkDialog();
  });

  qs("#btn-create-select-all")?.addEventListener("click", () => {
    document.querySelectorAll(".create-owner-check").forEach((el) => {
      el.checked = true;
    });
    showCreateRecipientError("");
  });
  qs("#btn-create-select-none")?.addEventListener("click", () => {
    document.querySelectorAll(".create-owner-check").forEach((el) => {
      el.checked = false;
    });
  });

  qs("#btn-validate")?.addEventListener("click", async () => {
    if (!selectedId) return;
    try {
      const validated = await runWithButton(qs("#btn-validate"), "Validando…", () =>
        api(`/api/convocations/${selectedId}/validate`, { method: "POST", body: {} })
      );
      const failed = (validated?.checks || []).filter((c) => !c.passed);
      if (validated?.status === "Ready" && !failed.length) {
        AppFeedback.success("Cada comprobación pasó. Siguiente paso: selecciona destinatarios y envía.", {
          title: "Lista para enviar"
        });
      } else {
        AppFeedback.warning(
          failed.length
            ? failed.map((c) => c.label).join(", ")
            : "Revisa el resultado de cada comprobación.",
          { title: "Validación incompleta" }
        );
      }
      await openDetail(selectedId);
      await refreshList();
    } catch (e) {
      AppFeedback.fromError(e, "La convocatoria tiene pendientes por corregir.");
    }
  });

  qs("#btn-send")?.addEventListener("click", async () => {
    if (!selectedId) return;
    if (sendInFlight) return;
    if (!hasPermission(user, "convocations:send")) {
      AppFeedback.warning("No tienes permiso para enviar convocatorias.", { title: "Sin permiso" });
      return;
    }
    const sendBtn = qs("#btn-send");
    if (sendBtn?.disabled) return;

    const ids = selectedRecipientIds();
    if (!ids.length) {
      showSendRecipientError("Selecciona al menos un destinatario de este envío.");
      return;
    }
    showSendRecipientError("");

    const sandbox = Boolean(selectedPreview?.sandboxMode);
    const channels = (selectedDetail?.channels || []).map(channelLabel).join(" y ");
    const people = ids.length === 1 ? "1 persona" : `${ids.length} personas`;
    const ok = await confirmDialog({
      title: "Enviar convocatoria",
      body: sandbox
        ? `Se notificará a ${people} por ${channels || "los canales del borrador"} en modo prueba.`
        : `Se notificará a ${people} por ${channels || "los canales del borrador"}. Confirma para enviar ahora.`,
      confirmLabel: "Enviar convocatoria"
    });
    if (!ok) return;

    sendInFlight = true;
    lastSendKey =
      lastSendKey ||
      (await compactIdempotencyKey("send", [selectedId, ids.slice().sort().join(",")]));

    AppFeedback.info("Estamos preparando y enviando las notificaciones.", {
      title: "Enviando convocatoria…",
      ttlMs: 3500
    });

    try {
      const batch = await runWithButton(sendBtn, "Enviando…", async () =>
        api(`/api/convocations/${selectedId}/send`, {
          method: "POST",
          body: {
            confirmed: true,
            recipientIds: ids,
            idempotencyKey: lastSendKey
          }
        })
      );

      const count = batch.sentCount ?? ids.length;
      const failed = batch.failedCount ?? 0;
      if (failed > 0) {
        AppFeedback.warning(
          `${count} enviados · ${failed} no pudieron completarse. Revisa el resultado por destinatario.`,
          {
            title: "Envío parcial",
            actionLabel: "Ver entregas",
            onAction: () => {
              location.hash = `c=${selectedId}`;
              openDetail(selectedId);
            },
            ttlMs: 12000
          }
        );
      } else {
        const recipientLabel =
          count === 1 ? "1 persona fue notificada correctamente." : `${count} personas fueron notificadas correctamente.`;
        AppFeedback.success(recipientLabel, {
          title: count === 1 ? "Convocatoria enviada" : "Convocatorias enviadas",
          actionLabel: "Ver entregas",
          onAction: () => openDetail(selectedId)
        });
      }
      lastSendKey = null;
      await openDetail(selectedId);
      await refreshList();
    } catch (e) {
      if (e?.code === "ALREADY_SENT" || /already submitted/i.test(e?.message || "")) {
        AppFeedback.info("Este envío ya está en curso o se completó. No se duplicó.", { title: "Sin duplicados" });
        await openDetail(selectedId);
      } else {
        AppFeedback.error("Verifica tu conexión e inténtalo nuevamente.", {
          title: "No pudimos enviar la convocatoria",
          actionLabel: "Intentar nuevamente",
          onAction: () => {
            sendInFlight = false;
            sendBtn?.click();
          }
        });
      }
    } finally {
      sendInFlight = false;
      if (sendBtn) sendBtn.textContent = "Enviar convocatoria";
    }
  });

  await refreshList();
  const reopen = draftHashId();
  if (reopen) {
    collapseCreateForm();
    await openDetail(reopen, qs("#btn-new-convocation"), { pushHash: false });
  }
  window.addEventListener("popstate", async () => {
    const id = draftHashId();
    const dlg = qs("#dlg-convocation");
    if (id) {
      formDirty = false;
      await openDetail(id, modalOpener, { pushHash: false });
      return;
    }
    formDirty = false;
    if (dlg?.open) dlg.close();
  });

  if (isReadinessReturnContext()) {
    mountReadinessActionBar({
      assemblyId,
      hint: "Estás completando la preparación de esta asamblea — Convocatoria y documentos."
    });
  }
}

init().catch((error) => {
  console.error(error);
  showError(error.message || "Error");
});
