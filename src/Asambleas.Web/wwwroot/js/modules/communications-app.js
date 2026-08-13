import { api } from "./api.js";
import { hasPermission, logout, me } from "./auth.js";
import { assemblyIdFromUrl, escapeHtml, qs, showToast } from "./ui.js";
import { showPageError } from "./app-feedback.js";
import { resolveDefaultAssemblyId } from "./assembly-context.js";
import { bootIaPage } from "./ia-page.js";
import { mountReadinessActionBar } from "./readiness-actions.js";
import { isReadinessReturnContext } from "./return-context.js";
import { runWithButton } from "./loading.js";

let assemblyId = assemblyIdFromUrl();
let phId = null;
let canConfigure = false;

function showError(message) {
  showPageError(message);
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

async function loadPhContext() {
  const params = new URLSearchParams(location.search);
  const urlPhId = params.get("phId");
  if (urlPhId) {
    phId = urlPhId;
    const ph = await api(`/api/ph/${phId}`);
    return { kind: "ph", ph };
  }

  if (!assemblyId) {
    assemblyId = await resolveDefaultAssemblyId();
    if (assemblyId) {
      location.replace(`/communications.html?assemblyId=${encodeURIComponent(assemblyId)}`);
      return null;
    }
    throw new Error("Abre Comunicaciones desde un PH (Propiedades → Comunicaciones) o indica ?phId=.");
  }

  const assembly = await api(`/api/assemblies/${assemblyId}`);
  phId = assembly.propertyHorizontalId;
  return { kind: "assembly", assembly };
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
      const saveBtn = card.querySelector("[data-save]");
      try {
        await runWithButton(saveBtn, "Guardando configuración…", async () => {
          await api(`/api/communications/ph/${phId}/channels/${channel}`, {
            method: "PUT",
            body: { providerType, isEnabled, settings, secret: secret || null }
          });
          showToast({
            title: "Configuración guardada",
            message: `Canal ${channel} actualizado.`,
            variant: "success"
          });
          await refreshChannels();
        });
      } catch (e) {
        showToast({ title: "No se pudo guardar", message: e.message, variant: "error", correlationId: e.correlationId });
      }
    });

    card.querySelector("[data-test]")?.addEventListener("click", async () => {
      const channel = card.getAttribute("data-channel");
      const destination = qs("#profile-override")?.value?.trim();
      if (!destination) {
        showToast({
          title: "Destino requerido",
          message: "Indica un correo en «Destinatario de prueba» del perfil antes de probar.",
          variant: "warning"
        });
        qs("#profile-override")?.focus();
        return;
      }
      const testBtn = card.querySelector("[data-test]");
      const el = card.querySelector("[data-test-result]");
      try {
        await runWithButton(testBtn, "Probando conexión…", async () => {
          const result = await api(`/api/communications/ph/${phId}/channels/${channel}/test`, {
            method: "POST",
            body: { destination }
          });
          if (result.succeeded) {
            const mock = /ResolvedProvider=Mock|MOCK/i.test(result.detail || "");
            el.textContent = mock
              ? `⚠ ${result.detail}`
              : `✓ Conexión SMTP correcta — Correo de prueba enviado a ${destination}. ${result.detail || ""}`;
            showToast({
              title: mock ? "Prueba en modo Mock" : "Conexión SMTP correcta",
              message: mock
                ? "Revisa Sandbox / proveedor Mock."
                : `Correo de prueba enviado a ${destination}.`,
              variant: mock ? "warning" : "success"
            });
          } else {
            el.textContent = `⚠ ${result.detail || "Prueba falló"}`;
            showToast({ title: "Prueba falló", message: result.detail || "Revisa la configuración SMTP.", variant: "error" });
          }
        });
      } catch (e) {
        if (el) el.textContent = e.message;
        showToast({ title: "Prueba falló", message: e.message, variant: "error", correlationId: e.correlationId });
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

  if (!hasPermission(user, "communications:view")) {
    location.href = "/owner.html?denied=communications";
    return;
  }

  canConfigure = hasPermission(user, "communications:configure");
  qs("#user-chip").textContent = user.displayName;
  qs("#nav-tenant") && (qs("#nav-tenant").textContent = user.tenantCode || user.tenantName || "Gobernanza");

  await bootIaPage({
    current: "comms",
    requirePermission: null
  });

  try {
    const ctx = await loadPhContext();
    if (!ctx) return;
    const phName =
      ctx.kind === "ph"
        ? ctx.ph?.name
        : ctx.assembly?.propertyHorizontalName || ctx.assembly?.name || "PH";
    const heroTitle = qs("#comms-ph-title");
    if (heroTitle) heroTitle.textContent = phName || "Comunicaciones";
    const heroSub = qs("#comms-ph-sub");
    if (heroSub) {
      heroSub.textContent = `Canales y SMTP para: ${phName}. Los secretos nunca se muestran.`;
    }
  } catch (e) {
    showError(e.message);
    return;
  }

  const q = assemblyId
    ? `assemblyId=${encodeURIComponent(assemblyId)}`
    : phId
      ? `phId=${encodeURIComponent(phId)}`
      : "";
  qs("#nav-dashboard")?.setAttribute("href", q ? `/dashboard.html?${q}` : "/dashboard.html");
  qs("#nav-convocation")?.setAttribute("href", q ? `/convocation.html?${q}` : "#");
  qs("#nav-assembly")?.setAttribute("href", q ? `/assembly.html?${q}` : "#");
  const navPh = qs("#nav-ph");
  if (navPh && phId) navPh.href = `/ph.html?phId=${encodeURIComponent(phId)}`;

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

  if (isReadinessReturnContext() && assemblyId) {
    let profileDirty = false;
    const markProfileDirty = () => {
      profileDirty = true;
    };
    qs("#profile-form")?.addEventListener("input", markProfileDirty);
    qs("#profile-form")?.addEventListener("change", markProfileDirty);

    async function saveCommsProfile() {
      if (!canConfigure) return false;
      clearFieldErrors();
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
        const chip = qs("#sandbox-chip");
        if (chip) chip.hidden = !(updated.isSandboxEnvironment || updated.sandboxMode);
        showToast("Perfil guardado", "success");
        profileDirty = false;
        return true;
      } catch (e) {
        showFieldErrorFromApi(e);
        showToast(e.message || "No se pudo guardar", "warn");
        return false;
      }
    }

    mountReadinessActionBar({
      assemblyId,
      getDirty: () => profileDirty,
      setDirty: (v) => {
        profileDirty = v;
      },
      onSave: canConfigure ? saveCommsProfile : null,
      saveLabel: "Guardar perfil",
      hint: "Estás completando la preparación de esta asamblea — Comunicaciones."
    });
  }
}

init().catch((error) => {
  console.error(error);
  showError(error.message || "Error");
});
