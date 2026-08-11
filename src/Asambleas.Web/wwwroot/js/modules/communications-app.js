import { api } from "./api.js";
import { hasPermission, logout, me } from "./auth.js";
import { assemblyIdFromUrl, escapeHtml, qs, showToast } from "./ui.js";
import { resolveDefaultAssemblyId } from "./assembly-context.js";

let assemblyId = assemblyIdFromUrl();
let phId = null;
let canConfigure = false;

function showError(message) {
  const el = qs("#page-alert");
  if (!el) return;
  el.hidden = !message;
  el.textContent = message || "";
}

function clearFieldErrors() {
  document.querySelectorAll("[data-field-hint]").forEach((el) => {
    el.textContent = "";
    el.className = "muted";
  });
}

function setFieldHint(inputId, text, kind) {
  const input = qs(`#${inputId}`);
  if (!input) return;
  let hint = input.parentElement?.querySelector("[data-field-hint]");
  if (!hint) {
    hint = document.createElement("small");
    hint.setAttribute("data-field-hint", "");
    input.parentElement?.appendChild(hint);
  }
  hint.textContent = text;
  hint.className = kind === "ok" ? "muted" : "alert";
}

function showFieldErrorFromApi(err) {
  const code = err?.code || err?.problem?.code || "";
  const msg = err?.message || String(err);
  if (code === "TIMEZONE_INVALID") setFieldHint("profile-tz", `⚠ ${msg}`, "err");
  else if (code === "TEST_RECIPIENT_INVALID" || code === "INVALID_RECIPIENT") setFieldHint("profile-override", `⚠ ${msg}`, "err");
  else if (code === "REPLY_TO_INVALID") setFieldHint("profile-reply", `⚠ ${msg}`, "err");
}

async function loadAssemblyContext() {
  if (!assemblyId) {
    assemblyId = await resolveDefaultAssemblyId();
    if (assemblyId) {
      location.replace(`/communications.html?assemblyId=${encodeURIComponent(assemblyId)}`);
      return null;
    }
    throw new Error("Falta assemblyId en la URL.");
  }
  const assembly = await api(`/api/assemblies/${assemblyId}`);
  phId = assembly.propertyHorizontalId;
  return assembly;
}

function renderChannels(channels) {
  const panel = qs("#channels-panel");
  panel.innerHTML = channels
    .map((ch) => {
      const settings = ch.publicSettings || {};
      return `
      <article class="channel-card" data-channel="${escapeHtml(ch.channel)}">
        <header class="cluster" style="justify-content:space-between">
          <h3>${escapeHtml(ch.channel)}</h3>
          <span class="badge ${ch.isEnabled ? "badge-success" : "badge-warn"}">${ch.isEnabled ? "ON" : "OFF"}</span>
        </header>
        <p class="muted">Provider: ${escapeHtml(ch.providerType)} ${ch.hasSecret ? "· secreto configurado" : ""}</p>
        ${
          ch.channel === "Email"
            ? `<div class="form-grid">
                <label class="field"><span>Host</span><input data-k="host" value="${escapeHtml(settings.host || "")}" /></label>
                <label class="field"><span>Port</span><input data-k="port" value="${escapeHtml(settings.port || "587")}" /></label>
                <label class="field"><span>From</span><input data-k="fromAddress" value="${escapeHtml(settings.fromAddress || "")}" /></label>
                <label class="field"><span>Username</span><input data-k="username" value="${escapeHtml(settings.username || "")}" /></label>
                <label class="field"><span>Password (nuevo)</span><input data-k="secret" type="password" autocomplete="new-password" placeholder="${ch.hasSecret ? "••••••••" : ""}" /></label>
                <label class="field"><span>Provider</span>
                  <select data-provider>
                    <option value="Mock" ${ch.providerType === "Mock" ? "selected" : ""}>Mock</option>
                    <option value="Smtp" ${ch.providerType === "Smtp" ? "selected" : ""}>SMTP</option>
                  </select>
                </label>
              </div>`
            : `<p class="muted">Slice 1: ${escapeHtml(ch.channel)} usa provider mock / portal.</p>`
        }
        <div class="cta-row">
          <label><input type="checkbox" data-enabled ${ch.isEnabled ? "checked" : ""} /> Habilitado</label>
          ${canConfigure ? `<button type="button" class="btn btn-secondary" data-save>Guardar</button>` : ""}
          ${canConfigure ? `<button type="button" class="btn btn-ghost" data-test>Probar</button>` : ""}
        </div>
        <p class="muted" data-test-result>${ch.lastTestDetail ? escapeHtml(ch.lastTestDetail) : ""}</p>
      </article>`;
    })
    .join("");

  panel.querySelectorAll(".channel-card").forEach((card) => {
    card.querySelector("[data-save]")?.addEventListener("click", async () => {
      const channel = card.getAttribute("data-channel");
      const settings = {};
      card.querySelectorAll("[data-k]").forEach((input) => {
        if (input.getAttribute("data-k") === "secret") return;
        settings[input.getAttribute("data-k")] = input.value;
      });
      const secret = card.querySelector('[data-k="secret"]')?.value || null;
      const providerType = card.querySelector("[data-provider]")?.value || "Mock";
      const isEnabled = Boolean(card.querySelector("[data-enabled]")?.checked);
      try {
        await api(`/api/communications/ph/${phId}/channels/${channel}`, {
          method: "PUT",
          body: { providerType, isEnabled, settings, secret: secret || null }
        });
        showToast("Canal guardado", "success");
        await refreshChannels();
      } catch (e) {
        showToast(e.message, "warn");
      }
    });

    card.querySelector("[data-test]")?.addEventListener("click", async () => {
      const channel = card.getAttribute("data-channel");
      const destination = qs("#profile-override")?.value || prompt("Destino de prueba");
      if (!destination) return;
      try {
        const result = await api(`/api/communications/ph/${phId}/channels/${channel}/test`, {
          method: "POST",
          body: { destination }
        });
        const el = card.querySelector("[data-test-result]");
        if (result.succeeded) {
          const mock = /ResolvedProvider=Mock|MOCK/i.test(result.detail || "");
          el.textContent = mock
            ? `⚠ ${result.detail}`
            : `✓ CORREO DE PRUEBA ENVIADO — El servidor SMTP aceptó el mensaje. Destinatario: ${destination}. ${result.detail || ""}`;
          showToast(mock ? "Prueba usó Mock (revisa Sandbox)" : "Correo de prueba aceptado por SMTP", mock ? "warn" : "success");
        } else {
          el.textContent = `⚠ ${result.detail || "Prueba falló"}`;
          showToast("Prueba falló", "warn");
        }
      } catch (e) {
        card.querySelector("[data-test-result]").textContent = e.message;
        showToast(e.message, "warn");
      }
    });
  });
}

async function refreshChannels() {
  const channels = await api(`/api/communications/ph/${phId}/channels`);
  renderChannels(channels);
}

async function refreshTemplates() {
  const templates = await api(`/api/communications/ph/${phId}/templates`);
  qs("#templates-list").innerHTML = templates.length
    ? templates
        .map(
          (t) =>
            `<div class="readiness-item"><span>${escapeHtml(t.code)} · ${escapeHtml(t.name)}</span><span class="badge">${escapeHtml(t.channelScope)} v${t.version}</span></div>`
        )
        .join("")
    : `<div class="empty-state">Sin plantillas aún.</div>`;
}

async function init() {
  let user;
  try {
    user = await me();
  } catch {
    location.href = "/";
    return;
  }

  canConfigure = hasPermission(user, "communications:configure");
  qs("#user-chip").textContent = user.displayName;
  qs("#nav-tenant").textContent = user.tenantCode || user.tenantName || "Gobernanza";

  try {
    const ctx = await loadAssemblyContext();
    if (!ctx) return;
  } catch (e) {
    showError(e.message);
    return;
  }

  const q = `assemblyId=${encodeURIComponent(assemblyId || "")}`;
  qs("#nav-dashboard").href = `/dashboard.html?${q}`;
  qs("#nav-convocation").href = `/convocation.html?${q}`;
  qs("#nav-assembly").href = `/assembly.html?${q}`;

  qs("#btn-logout")?.addEventListener("click", async () => {
    await logout();
    location.href = "/";
  });

  const profile = await api(`/api/communications/ph/${phId}/profile`);
  qs("#profile-sandbox").checked = profile.sandboxMode;
  qs("#profile-override").value = profile.testRecipientOverride || "";
  qs("#profile-tz").value = profile.defaultTimezoneId || "America/Panama";
  qs("#profile-from-name").value = profile.defaultFromDisplayName || "";
  qs("#profile-reply").value = profile.defaultReplyTo || "";
  const chip = qs("#sandbox-chip");
  if (profile.isSandboxEnvironment || profile.sandboxMode) {
    chip.hidden = false;
  }

  qs("#profile-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (!canConfigure) {
      showToast("Sin permiso para configurar", "warn");
      return;
    }
    clearFieldErrors();
    const btn = ev.submitter || qs("#profile-form button[type=submit]");
    btn?.setAttribute("aria-busy", "true");
    btn?.classList.add("is-loading");
    try {
      const updated = await api(`/api/communications/ph/${phId}/profile`, {
        method: "PUT",
        body: {
          sandboxMode: qs("#profile-sandbox").checked,
          testRecipientOverride: qs("#profile-override").value || null,
          defaultTimezoneId: qs("#profile-tz").value,
          defaultFromDisplayName: qs("#profile-from-name").value || null,
          defaultReplyTo: qs("#profile-reply").value || null
        }
      });
      chip.hidden = !(updated.isSandboxEnvironment || updated.sandboxMode);
      setFieldHint("profile-tz", "✓ Zona horaria válida", "ok");
      showToast("Perfil guardado", "success");
    } catch (e) {
      showFieldErrorFromApi(e);
      showToast(e.message || "No se pudo guardar el perfil", "warn");
    } finally {
      btn?.removeAttribute("aria-busy");
      btn?.classList.remove("is-loading");
    }
  });

  qs("#template-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (!hasPermission(user, "templates:manage")) {
      showToast("Sin permiso de plantillas", "warn");
      return;
    }
    try {
      await api(`/api/communications/ph/${phId}/templates`, {
        method: "PUT",
        body: {
          code: qs("#tpl-code").value,
          name: qs("#tpl-name").value,
          channelScope: qs("#tpl-scope").value,
          subject: qs("#tpl-subject").value,
          bodyHtml: qs("#tpl-html").value,
          bodyText: qs("#tpl-text").value,
          isActive: true
        }
      });
      showToast("Plantilla guardada", "success");
      await refreshTemplates();
    } catch (e) {
      showToast(e.message, "warn");
    }
  });

  await refreshChannels();
  await refreshTemplates();
}

init().catch((error) => {
  console.error(error);
  showError(error.message || "Error");
});
