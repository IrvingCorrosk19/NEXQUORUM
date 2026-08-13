import { api } from "./api.js";
import { canConfigurePhComms, hasPermission, logout, me } from "./auth.js";
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
let emailChannel = null;

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
  else if (code === "REPLY_TO_INVALID") setFieldHint("profile-reply", `⚠ ${msg}`, "err");
  else if (code === "TEST_DESTINATION_REQUIRED" || code === "INVALID_RECIPIENT") {
    setFieldHint("test-email", `⚠ ${msg}`, "err");
  }
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

function connectionStatus(ch) {
  if (!ch) return { label: "Sin configurar", className: "comms-status-warn" };
  if (ch.lastTestSucceeded === true) return { label: "Conexión verificada", className: "comms-status-ok" };
  if (ch.lastTestSucceeded === false) return { label: "Última prueba falló", className: "comms-status-err" };
  if (ch.providerType === "Smtp" && ch.hasSecret) return { label: "Configurado — sin probar", className: "comms-status-warn" };
  return { label: "Pendiente de configurar", className: "comms-status-warn" };
}

function renderEmailChannel(ch) {
  emailChannel = ch;
  const panel = qs("#email-channel-panel");
  if (!panel) return;

  const settings = ch?.publicSettings || {};
  const status = connectionStatus(ch);
  const readonly = !canConfigure;

  panel.innerHTML = `
    <div class="cluster" style="justify-content:space-between;margin-bottom:1rem">
      <span class="badge ${ch?.isEnabled ? "badge-success" : "badge-warn"}">${ch?.isEnabled ? "Activo" : "Inactivo"}</span>
      <span class="${status.className}">${escapeHtml(status.label)}</span>
    </div>
    <div class="form-grid">
      <label class="field"><span>Servidor SMTP</span>
        <input id="smtp-host" value="${escapeHtml(settings.host || "smtp.gmail.com")}" ${readonly ? "readonly" : ""} placeholder="smtp.gmail.com" />
      </label>
      <label class="field"><span>Puerto</span>
        <input id="smtp-port" value="${escapeHtml(settings.port || "587")}" ${readonly ? "readonly" : ""} />
      </label>
      <label class="field"><span>Correo remitente (From)</span>
        <input id="smtp-from" type="email" value="${escapeHtml(settings.fromAddress || "")}" ${readonly ? "readonly" : ""} placeholder="tu@gmail.com" />
      </label>
      <label class="field"><span>Usuario</span>
        <input id="smtp-user" value="${escapeHtml(settings.username || "")}" ${readonly ? "readonly" : ""} placeholder="tu@gmail.com" />
      </label>
      <label class="field"><span>Contraseña / app password</span>
        <input id="smtp-secret" type="password" autocomplete="new-password" ${readonly ? "readonly" : ""}
          placeholder="${ch?.hasSecret ? "•••••••• (guardada)" : "Contraseña de aplicación"}" />
      </label>
      <label class="field"><span>Correo para probar</span>
        <input id="test-email" type="email" placeholder="donde@recibir.com" autocomplete="off" />
        <small class="muted">Te enviaremos una convocatoria de ejemplo para verificar SMTP.</small>
      </label>
    </div>
    <div class="cta-row">
      <label><input type="checkbox" id="smtp-enabled" ${ch?.isEnabled ? "checked" : ""} ${readonly ? "disabled" : ""} /> Canal habilitado</label>
      ${canConfigure ? `<button type="button" class="btn btn-primary" id="btn-save-smtp">Guardar configuración</button>` : ""}
      ${canConfigure ? `<button type="button" class="btn btn-secondary" id="btn-test-smtp">Probar envío</button>` : ""}
    </div>
    <p class="muted" id="smtp-test-result">${ch?.lastTestDetail ? escapeHtml(ch.lastTestDetail) : ""}</p>
  `;

  if (!canConfigure) return;

  qs("#btn-save-smtp")?.addEventListener("click", onSaveSmtp);
  qs("#btn-test-smtp")?.addEventListener("click", onTestSmtp);
}

async function onSaveSmtp() {
  const btn = qs("#btn-save-smtp");
  try {
    await runWithButton(btn, "Guardando…", async () => {
      await api(`/api/communications/ph/${phId}/channels/Email`, {
        method: "PUT",
        body: {
          providerType: "Smtp",
          isEnabled: Boolean(qs("#smtp-enabled")?.checked),
          settings: {
            host: qs("#smtp-host")?.value?.trim(),
            port: qs("#smtp-port")?.value?.trim(),
            fromAddress: qs("#smtp-from")?.value?.trim(),
            username: qs("#smtp-user")?.value?.trim()
          },
          secret: qs("#smtp-secret")?.value || null
        }
      });
      showToast({
        title: "Configuración guardada",
        message: "SMTP listo. Usa «Probar envío» para confirmar.",
        variant: "success"
      });
      await refreshEmailChannel();
    });
  } catch (e) {
    showToast({ title: "No se pudo guardar", message: e.message, variant: "error", correlationId: e.correlationId });
  }
}

async function onTestSmtp() {
  const destination = qs("#test-email")?.value?.trim();
  if (!destination) {
    showToast({
      title: "Correo requerido",
      message: "Indica a qué correo enviar la prueba.",
      variant: "warning"
    });
    qs("#test-email")?.focus();
    return;
  }

  const btn = qs("#btn-test-smtp");
  const el = qs("#smtp-test-result");
  try {
    await runWithButton(btn, "Enviando prueba…", async () => {
      const result = await api(`/api/communications/ph/${phId}/channels/Email/test`, {
        method: "POST",
        body: { destination }
      });
      if (result.succeeded) {
        const mock = /ResolvedProvider=Mock|MOCK/i.test(result.detail || "");
        el.textContent = mock
          ? `⚠ ${result.detail}`
          : `✓ Correo de prueba enviado a ${destination}. ${result.detail || ""}`;
        el.className = mock ? "comms-status-warn" : "comms-status-ok";
        showToast({
          title: mock ? "Proveedor Mock activo" : "Correo enviado correctamente",
          message: mock
            ? "Configura SMTP real y guarda de nuevo."
            : `Revisa la bandeja de ${destination}.`,
          variant: mock ? "warning" : "success"
        });
      } else {
        el.textContent = `⚠ ${result.detail || "La prueba falló"}`;
        el.className = "comms-status-err";
        showToast({ title: "Prueba falló", message: result.detail || "Revisa host, puerto y contraseña.", variant: "error" });
      }
      await refreshEmailChannel();
    });
  } catch (e) {
    if (el) {
      el.textContent = e.message;
      el.className = "comms-status-err";
    }
    showFieldErrorFromApi(e);
    showToast({ title: "Prueba falló", message: e.message, variant: "error", correlationId: e.correlationId });
  }
}

async function refreshEmailChannel() {
  const channels = await api(`/api/communications/ph/${phId}/channels`);
  const email = channels.find((c) => c.channel === "Email");
  renderEmailChannel(email);
}

async function loadEmailPreview() {
  const frame = qs("#email-preview-frame");
  if (!frame) return;
  try {
    const preview = await api(`/api/communications/ph/${phId}/convocation-email-preview`);
    frame.srcdoc = preview.html;
  } catch (e) {
    frame.srcdoc = `<body style="font-family:sans-serif;padding:24px;color:#666"><p>No se pudo cargar la vista previa.</p></body>`;
  }
}

async function saveProfile(ev) {
  ev?.preventDefault();
  if (!canConfigure) {
    showToast({ title: "Sin permiso", message: "No puedes editar la configuración de este PH.", variant: "warning" });
    return false;
  }
  clearFieldErrors();
  const btn = ev?.submitter || qs("#profile-form button[type=submit]");
  btn?.setAttribute("aria-busy", "true");
  btn?.classList.add("is-loading");
  try {
    await api(`/api/communications/ph/${phId}/profile`, {
      method: "PUT",
      body: {
        sandboxMode: false,
        testRecipientOverride: null,
        defaultTimezoneId: qs("#profile-tz").value,
        defaultFromDisplayName: qs("#profile-from-name").value || null,
        defaultReplyTo: qs("#profile-reply").value || null
      }
    });
    setFieldHint("profile-tz", "✓ Guardado", "ok");
    showToast({ title: "Remitente guardado", message: "Se usará en convocatorias e invitaciones.", variant: "success" });
    return true;
  } catch (e) {
    showFieldErrorFromApi(e);
    showToast({ title: "No se pudo guardar", message: e.message, variant: "warning" });
    return false;
  } finally {
    btn?.removeAttribute("aria-busy");
    btn?.classList.remove("is-loading");
  }
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

  await bootIaPage({ current: "comms", requirePermission: null });

  try {
    const ctx = await loadPhContext();
    if (!ctx) return;
    const phName =
      ctx.kind === "ph"
        ? ctx.ph?.name
        : ctx.assembly?.propertyHorizontalName || ctx.assembly?.name || "PH";
    qs("#comms-ph-title") && (qs("#comms-ph-title").textContent = phName || "Comunicaciones");
    qs("#comms-ph-sub") &&
      (qs("#comms-ph-sub").textContent = `Configura el correo de ${phName} para convocatorias e invitaciones.`);
  } catch (e) {
    showError(e.message);
    return;
  }

  canConfigure = await canConfigurePhComms(user, phId);
  qs("#user-chip").textContent = user.displayName;
  qs("#nav-tenant") && (qs("#nav-tenant").textContent = user.tenantCode || user.tenantName || "Gobernanza");

  qs("#btn-logout")?.addEventListener("click", async () => {
    await logout();
    location.href = "/";
  });

  const profile = await api(`/api/communications/ph/${phId}/profile`);
  qs("#profile-tz").value = profile.defaultTimezoneId || "America/Panama";
  qs("#profile-from-name").value = profile.defaultFromDisplayName || "";
  qs("#profile-reply").value = profile.defaultReplyTo || "";

  if (!canConfigure) {
    qs("#profile-form")?.querySelectorAll("input,button").forEach((el) => {
      if (el.id !== "test-email") el.setAttribute("disabled", "disabled");
    });
  }

  qs("#profile-form")?.addEventListener("submit", saveProfile);

  await refreshEmailChannel();
  await loadEmailPreview();

  if (isReadinessReturnContext() && assemblyId) {
    let profileDirty = false;
    qs("#profile-form")?.addEventListener("input", () => {
      profileDirty = true;
    });
    qs("#profile-form")?.addEventListener("change", () => {
      profileDirty = true;
    });

    mountReadinessActionBar({
      assemblyId,
      getDirty: () => profileDirty,
      setDirty: (v) => {
        profileDirty = v;
      },
      onSave: canConfigure ? () => saveProfile() : null,
      saveLabel: "Guardar remitente",
      hint: "Completa la configuración de correo para esta asamblea."
    });
  }
}

init().catch((error) => {
  console.error(error);
  showError(error.message || "Error");
});
