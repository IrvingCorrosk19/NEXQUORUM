import { api } from "./api.js";
import { hasPermission, logout, me } from "./auth.js";
import { assemblyIdFromUrl, confirmDialog, escapeHtml, qs, showToast } from "./ui.js";
import { ensureAssemblyIdOrRedirect } from "./assembly-context.js";
import { bootIaPage } from "./ia-page.js";
import { mountReadinessActionBar } from "./readiness-actions.js";
import { isReadinessReturnContext } from "./return-context.js";

let assemblyId = assemblyIdFromUrl();
let selectedId = null;
let selectedPreview = null;
let currentRecipients = [];

function showError(message) {
  const el = qs("#page-alert");
  if (!el) return;
  el.hidden = !message;
  el.textContent = message || "";
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
  return map[status] || status || "—";
}

async function refreshList() {
  const rows = await api(`/api/assemblies/${assemblyId}/convocations`);
  const panel = qs("#list-panel");
  if (!rows.length) {
    panel.innerHTML = `<div class="empty-state">No hay convocatorias.</div>`;
    return;
  }
  panel.innerHTML = rows
    .map(
      (r) => `
    <button type="button" class="readiness-item" data-id="${r.id}" style="width:100%;text-align:left;cursor:pointer">
      <span>${escapeHtml(r.title)} · ${escapeHtml(statusEs(r.status))}</span>
      <span class="badge">${r.validRecipientCount}/${r.recipientCount}</span>
    </button>`
    )
    .join("");
  panel.querySelectorAll("[data-id]").forEach((btn) => {
    btn.addEventListener("click", () => openDetail(btn.getAttribute("data-id")));
  });
}

function renderRecipientPicker(recipients) {
  currentRecipients = Array.isArray(recipients) ? recipients : [];
  const valid = currentRecipients.filter((r) => r.isValid);
  if (!valid.length) {
    return `<div class="empty-state">No hay destinatarios válidos.</div>`;
  }
  return `
    <div class="conv-recipients" style="margin-top:1rem">
      <div class="cluster" style="justify-content:space-between;margin-bottom:0.5rem;flex-wrap:wrap;gap:0.5rem">
        <strong>Destinatarios</strong>
        <div class="cta-row" style="margin:0">
          <button type="button" class="btn btn-ghost" id="btn-select-all">Seleccionar todos</button>
          <button type="button" class="btn btn-ghost" id="btn-select-none">Ninguno</button>
        </div>
      </div>
      <ul class="blocker-list" id="recipient-list" style="list-style:none;padding:0;margin:0;display:grid;gap:0.35rem">
        ${valid
          .map(
            (r) => `
          <li style="display:flex;align-items:center;gap:0.65rem;padding:0.45rem 0.55rem;border:1px solid rgba(255,255,255,.08);border-radius:0.5rem">
            <input type="checkbox" class="rcpt-check" value="${escapeHtml(r.id)}" checked data-name="${escapeHtml(r.displayName)}" />
            <span style="flex:1">
              <strong>${escapeHtml(r.displayName)}</strong>
              <span class="muted"> · ${escapeHtml(r.email || "sin email")}</span>
            </span>
            <span class="badge badge-success">OK</span>
          </li>`
          )
          .join("")}
      </ul>
      ${
        currentRecipients.some((r) => !r.isValid)
          ? `<p class="muted" style="margin-top:0.75rem">Omitidos por datos incompletos: ${currentRecipients
              .filter((r) => !r.isValid)
              .map((r) => escapeHtml(r.displayName))
              .join(", ")}</p>`
          : ""
      }
    </div>`;
}

function selectedRecipientIds() {
  return [...document.querySelectorAll(".rcpt-check:checked")].map((el) => el.value);
}

function wireRecipientPicker() {
  qs("#btn-select-all")?.addEventListener("click", () => {
    document.querySelectorAll(".rcpt-check").forEach((el) => {
      el.checked = true;
    });
  });
  qs("#btn-select-none")?.addEventListener("click", () => {
    document.querySelectorAll(".rcpt-check").forEach((el) => {
      el.checked = false;
    });
  });
}

async function openDetail(id) {
  selectedId = id;
  const detail = await api(`/api/convocations/${id}`);
  const panel = qs("#detail-panel");
  panel.hidden = false;
  const preview = detail.preview;
  selectedPreview = preview || null;
  const chip = qs("#sandbox-chip");
  if (chip) chip.hidden = !preview?.sandboxMode;

  const alreadySent = ["Sending", "Sent", "Partial", "Failed"].includes(detail.status);
  qs("#btn-send").disabled = alreadySent;
  qs("#btn-validate").disabled = alreadySent;

  qs("#detail-body").innerHTML = `
    <p><strong>${escapeHtml(detail.title)}</strong> · ${escapeHtml(statusEs(detail.status))}</p>
    <p class="muted">${escapeHtml(detail.subject)}</p>
    <p>Canales: ${detail.channels.map(escapeHtml).join(", ")}</p>
    ${
      preview
        ? `<div class="readiness-summary ${preview.sandboxMode ? "blocked" : "ready"}">
            ${preview.sandboxMode ? "Modo prueba: no se usará SMTP real." : "Envío real por SMTP (sandbox desactivado)."}
            ${preview.testRecipientOverride ? ` Override: ${escapeHtml(preview.testRecipientOverride)}.` : ""}
          </div>`
        : ""
    }
    ${alreadySent ? "" : renderRecipientPicker(detail.recipients)}
  `;

  if (!alreadySent) wireRecipientPicker();
  else await renderDeliveryPanel(id);

  try {
    const deliveries = await api(`/api/convocations/${id}/deliveries`);
    qs("#deliveries").innerHTML = deliveries.length
      ? `<h3 class="section-title">Historial de entregas</h3>` +
        deliveries
          .map(
            (d) =>
              `<div class="readiness-item"><span>${escapeHtml(d.channel)} → ${escapeHtml(d.destination || "—")}${d.providerType ? ` · ${escapeHtml(d.providerType)}` : ""}</span><span class="badge">${escapeHtml(deliveryStatusEs(d.status))}</span></div>`
          )
          .join("")
      : "";
  } catch {
    qs("#deliveries").innerHTML = "";
  }
}

function deliveryStatusEs(status) {
  const map = {
    Pending: "Pendiente",
    Queued: "En cola",
    Sent: "Enviada",
    Delivered: "Entregada",
    Failed: "Fallida",
    Bounced: "Rebotada",
    Skipped: "Omitida",
    NotSent: "No enviada"
  };
  return map[status] || status || "—";
}

async function renderDeliveryPanel(convocationId) {
  const host = qs("#detail-body");
  try {
    const rows = await api(`/api/convocations/${convocationId}/recipient-deliveries`);
    const pending = rows.filter((r) => r.deliveryStatus === "NotSent" || r.deliveryStatus === "Failed" || r.deliveryStatus === "Pending");
    host.insertAdjacentHTML(
      "beforeend",
      `
      <div style="margin-top:1.25rem">
        <div class="cluster" style="justify-content:space-between;flex-wrap:wrap;gap:0.5rem;margin-bottom:0.75rem">
          <strong>Destinatarios y reenvío</strong>
          <div class="cta-row" style="margin:0">
            <button type="button" class="btn btn-secondary" id="btn-resend-selected">Reenviar seleccionados</button>
            <button type="button" class="btn btn-primary" id="btn-resend-pending"${pending.length ? "" : " disabled"}>Reenviar pendientes (${pending.length})</button>
          </div>
        </div>
        <ul class="blocker-list" style="list-style:none;padding:0;margin:0;display:grid;gap:0.35rem">
          ${rows
            .map(
              (r) => `
            <li style="display:flex;align-items:center;gap:0.65rem;padding:0.45rem 0.55rem;border:1px solid rgba(255,255,255,.08);border-radius:0.5rem">
              <input type="checkbox" class="rcpt-check" value="${escapeHtml(r.recipientId)}" ${r.canResend ? "checked" : "disabled"} />
              <span style="flex:1">
                <strong>${escapeHtml(r.displayName)}</strong>
                <span class="muted"> · ${escapeHtml(r.email || "sin email")}</span>
                <span class="muted"> · intentos ${r.emailAttemptCount}</span>
              </span>
              <span class="badge">${escapeHtml(deliveryStatusEs(r.deliveryStatus))}</span>
              <button type="button" class="btn btn-ghost" data-resend-one="${escapeHtml(r.recipientId)}" ${r.canResend ? "" : "disabled"}>Reenviar</button>
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
  } catch (e) {
    host.insertAdjacentHTML("beforeend", `<p class="muted">${escapeHtml(e.message || "No se pudo cargar el historial.")}</p>`);
  }
}

async function resendOne(recipientId) {
  if (!selectedId || !recipientId) return;
  const ok = await confirmDialog({
    title: "Reenviar convocatoria",
    body: "Se enviará nuevamente el correo profesional a este destinatario.",
    confirmLabel: "Reenviar"
  });
  if (!ok) return;
  await doResend({ recipientIds: [recipientId], onlyFailedOrPending: false });
}

async function resendSelected(onlyPending) {
  if (!selectedId) return;
  const ids = onlyPending ? null : selectedRecipientIds();
  if (!onlyPending && (!ids || !ids.length)) {
    showToast("Selecciona al menos un destinatario", "warn");
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
    const batch = await api(`/api/convocations/${selectedId}/resend`, {
      method: "POST",
      body: {
        confirmed: true,
        recipientIds: recipientIds || null,
        onlyFailedOrPending: Boolean(onlyFailedOrPending),
        idempotencyKey: `resend-${selectedId}-${Date.now()}`
      }
    });
    showToast(
      `Reenvío ${statusEs(batch.status)}: enviados ${batch.sentCount}, fallidos ${batch.failedCount}`,
      batch.failedCount ? "warn" : "success"
    );
    await openDetail(selectedId);
    await refreshList();
  } catch (e) {
    showToast(e.message, "warn");
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

  qs("#user-chip").textContent = user.displayName;
  qs("#nav-tenant") && (qs("#nav-tenant").textContent = user.tenantCode || user.tenantName || "Gobernanza");
  await bootIaPage({ current: "asm-convocation", pageLabel: "Convocatoria" });
  const q = `assemblyId=${encodeURIComponent(assemblyId)}`;
  qs("#nav-dashboard")?.setAttribute("href", `/dashboard.html?${q}`);
  qs("#nav-comms")?.setAttribute("href", `/communications.html?${q}`);
  qs("#nav-assembly")?.setAttribute("href", `/assembly.html?${q}`);
  qs("#btn-logout")?.addEventListener("click", async () => {
    await logout();
    location.href = "/";
  });

  qs("#create-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (!hasPermission(user, "convocations:create")) {
      showToast("Sin permiso", "warn");
      return;
    }
    const channels = [...document.querySelectorAll('input[name="ch"]:checked')].map((el) => el.value);
    const title = qs("#c-title").value.trim();
    const subject = qs("#c-subject").value.trim() || title;
    const notes = qs("#c-html").value.trim();
    try {
      const created = await api(`/api/assemblies/${assemblyId}/convocations`, {
        method: "POST",
        body: {
          assemblyId,
          title,
          subject,
          bodyHtml: notes || "<p>Convocatoria institucional (plantilla premium al enviar).</p>",
          bodyText: notes || "Convocatoria institucional.",
          channels,
          idempotencyKey: `ui-${Date.now()}`
        }
      });
      showToast("Borrador creado", "success");
      await refreshList();
      await openDetail(created.id);
    } catch (e) {
      showToast(e.message, "warn");
    }
  });

  qs("#btn-validate")?.addEventListener("click", async () => {
    if (!selectedId) return;
    try {
      await api(`/api/convocations/${selectedId}/validate`, { method: "POST", body: {} });
      showToast("Validación ejecutada", "success");
      await openDetail(selectedId);
      await refreshList();
    } catch (e) {
      showToast(e.message, "warn");
    }
  });

  qs("#btn-send")?.addEventListener("click", async () => {
    if (!selectedId) return;
    if (!hasPermission(user, "convocations:send")) {
      showToast("Sin permiso de envío", "warn");
      return;
    }
    const sendBtn = qs("#btn-send");
    if (sendBtn?.disabled) return;

    const ids = selectedRecipientIds();
    if (!ids.length) {
      showToast("Selecciona al menos un destinatario", "warn");
      return;
    }

    const sandbox = Boolean(selectedPreview?.sandboxMode);
    const ok = await confirmDialog({
      title: "Enviar convocatoria",
      body: sandbox
        ? `Se enviará a ${ids.length} destinatario(s) en modo prueba (sin SMTP real).`
        : `Se enviará el correo real a ${ids.length} destinatario(s) seleccionados.`,
      confirmLabel: "Enviar ahora"
    });
    if (!ok) return;

    sendBtn.disabled = true;
    sendBtn.setAttribute("aria-busy", "true");
    sendBtn.classList.add("is-loading");
    sendBtn.textContent = "Enviando…";
    try {
      const batch = await api(`/api/convocations/${selectedId}/send`, {
        method: "POST",
        body: {
          confirmed: true,
          recipientIds: ids,
          idempotencyKey: `send-${selectedId}-${Date.now()}`
        }
      });
      const label = statusEs(batch.status);
      showToast(
        `Convocatoria ${label}: enviados ${batch.sentCount}, fallidos ${batch.failedCount}`,
        batch.failedCount ? "warn" : "success"
      );
      await openDetail(selectedId);
      await refreshList();
    } catch (e) {
      showToast(e.message, "warn");
    } finally {
      sendBtn.disabled = false;
      sendBtn.removeAttribute("aria-busy");
      sendBtn.classList.remove("is-loading");
      sendBtn.textContent = "Enviar";
    }
  });

  await refreshList();

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
