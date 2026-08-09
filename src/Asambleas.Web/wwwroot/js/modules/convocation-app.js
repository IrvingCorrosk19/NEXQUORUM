import { api } from "./api.js";
import { hasPermission, logout, me } from "./auth.js";
import { assemblyIdFromUrl, confirmDialog, escapeHtml, qs, showToast } from "./ui.js";

const assemblyId = assemblyIdFromUrl();
let selectedId = null;

function showError(message) {
  const el = qs("#page-alert");
  if (!el) return;
  el.hidden = !message;
  el.textContent = message || "";
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
      <span>${escapeHtml(r.title)} · ${escapeHtml(r.status)}</span>
      <span class="badge">${r.validRecipientCount}/${r.recipientCount}</span>
    </button>`
    )
    .join("");
  panel.querySelectorAll("[data-id]").forEach((btn) => {
    btn.addEventListener("click", () => openDetail(btn.getAttribute("data-id")));
  });
}

async function openDetail(id) {
  selectedId = id;
  const detail = await api(`/api/convocations/${id}`);
  const panel = qs("#detail-panel");
  panel.hidden = false;
  const preview = detail.preview;
  if (preview?.sandboxMode) qs("#sandbox-chip").hidden = false;

  qs("#detail-body").innerHTML = `
    <p><strong>${escapeHtml(detail.title)}</strong> · ${escapeHtml(detail.status)}</p>
    <p class="muted">${escapeHtml(detail.subject)}</p>
    <p>Canales: ${detail.channels.map(escapeHtml).join(", ")}</p>
    ${
      preview
        ? `<div class="readiness-summary ${preview.sandboxMode ? "blocked" : "ready"}">
            Destinatarios: ${preview.recipientCount}.
            ${preview.sandboxMode ? " MODO PRUEBA activo." : ""}
            ${preview.testRecipientOverride ? ` Override: ${escapeHtml(preview.testRecipientOverride)}.` : ""}
            Sin canal externo: ${preview.recipientsMissingExternalChannel}.
          </div>`
        : ""
    }
    <ul class="blocker-list">
      ${detail.recipients
        .slice(0, 20)
        .map(
          (r) =>
            `<li>${escapeHtml(r.displayName)} · ${r.isValid ? "OK" : escapeHtml(r.validationIssues.join("; "))}</li>`
        )
        .join("")}
    </ul>
  `;

  try {
    const deliveries = await api(`/api/convocations/${id}/deliveries`);
    qs("#deliveries").innerHTML = deliveries.length
      ? `<h3 class="section-title">Entregas</h3>` +
        deliveries
          .map(
            (d) =>
              `<div class="readiness-item"><span>${escapeHtml(d.channel)} → ${escapeHtml(d.destination || "—")}</span><span class="badge">${escapeHtml(d.status)}</span></div>`
          )
          .join("")
      : "";
  } catch {
    qs("#deliveries").innerHTML = "";
  }
}

async function init() {
  if (!assemblyId) {
    showError("Falta assemblyId.");
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
  qs("#nav-tenant").textContent = user.tenantCode || user.tenantName || "Gobernanza";
  const q = `assemblyId=${encodeURIComponent(assemblyId)}`;
  qs("#nav-dashboard").href = `/dashboard.html?${q}`;
  qs("#nav-comms").href = `/communications.html?${q}`;
  qs("#nav-assembly").href = `/assembly.html?${q}`;
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
    try {
      const created = await api(`/api/assemblies/${assemblyId}/convocations`, {
        method: "POST",
        body: {
          assemblyId,
          title: qs("#c-title").value,
          subject: qs("#c-subject").value,
          bodyHtml: qs("#c-html").value,
          bodyText: qs("#c-text").value,
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
    const ok = await confirmDialog({
      title: "Enviar convocatoria",
      body: 'Confirma escribiendo ENVIAR CONVOCATORIA en el siguiente paso. El envío puede usar MOCK en sandbox.',
      confirmLabel: "Continuar"
    });
    if (!ok) return;
    const phrase = prompt('Escribe exactamente: ENVIAR CONVOCATORIA');
    if (phrase !== "ENVIAR CONVOCATORIA") {
      showToast("Confirmación incorrecta", "warn");
      return;
    }
    sendBtn.disabled = true;
    sendBtn.setAttribute("aria-busy", "true");
    sendBtn.classList.add("is-loading");
    try {
      const batch = await api(`/api/convocations/${selectedId}/send`, {
        method: "POST",
        body: { confirmationPhrase: phrase, idempotencyKey: `send-${selectedId}` }
      });
      showToast(`Batch ${batch.status}: sent=${batch.sentCount} failed=${batch.failedCount}`, "success");
      await openDetail(selectedId);
      await refreshList();
    } catch (e) {
      showToast(e.message, "warn");
    } finally {
      sendBtn.disabled = false;
      sendBtn.removeAttribute("aria-busy");
      sendBtn.classList.remove("is-loading");
    }
  });

  await refreshList();
}

init().catch((error) => {
  console.error(error);
  showError(error.message || "Error");
});
