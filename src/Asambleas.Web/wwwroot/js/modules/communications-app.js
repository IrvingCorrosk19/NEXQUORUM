import { api } from "./api.js";
import { canConfigurePhComms, hasPermission, logout, me } from "./auth.js";
import { assemblyIdFromUrl, escapeHtml, qs, showToast } from "./ui.js";
import { showPageError } from "./app-feedback.js";
import { resolveDefaultAssemblyId } from "./assembly-context.js";
import { bootIaPage } from "./ia-page.js?v=flow5";
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

function semaphoreState(ch) {
  if (!ch) return { mode: "idle", label: "Sin configuración guardada" };
  if (ch.lastTestSucceeded === true) return { mode: "ok", label: "Conexión verificada" };
  if (ch.lastTestSucceeded === false) return { mode: "fail", label: "Falló el envío de prueba" };
  if (ch.hasSecret || ch.publicSettings?.host) return { mode: "saved", label: "Configuración guardada. La conexión aún no está verificada." };
  return { mode: "idle", label: "Sin configuración guardada" };
}

function setSemaphore(mode, label) {
  const pill = qs("#smtp-status-pill");
  const text = qs("#smtp-status-label");
  if (pill) pill.className = `comms-status-pill comms-status-pill--${mode}`;
  if (text) text.textContent = label;
}

function renderEmailChannel(ch) {
  emailChannel = ch;
  const panel = qs("#email-channel-panel");
  if (!panel) return;

  const settings = ch?.publicSettings || {};
  const sem = semaphoreState(ch);
  setSemaphore(sem.mode, sem.label);

  panel.innerHTML = `
    <div class="form-grid">
      <label class="form-label">Servidor SMTP
        <input class="form-control" id="smtp-host" value="${escapeHtml(settings.host || "")}" placeholder="smtp.gmail.com" autocomplete="off" />
      </label>
      <label class="form-label">Puerto
        <input class="form-control" id="smtp-port" value="${escapeHtml(settings.port || "587")}" inputmode="numeric" autocomplete="off" />
      </label>
      <label class="form-label">Correo remitente (From)
        <input class="form-control" id="smtp-from" type="email" value="${escapeHtml(settings.fromAddress || "")}" placeholder="tu@gmail.com" autocomplete="email" />
      </label>
      <label class="form-label">Usuario
        <input class="form-control" id="smtp-user" value="${escapeHtml(settings.username || "")}" placeholder="tu@gmail.com" autocomplete="username" />
      </label>
      <label class="form-label">Contraseña / app password
        <input class="form-control" id="smtp-secret" type="password" autocomplete="new-password" placeholder="" />
        <span class="form-hint" id="smtp-secret-help">${ch?.hasSecret ? "Hay una contraseña guardada. Deja este campo vacío para conservarla. No se vuelve a mostrar." : "Escribe la contraseña de aplicación. No se muestra después de guardar."}</span>
      </label>
      <label class="form-label">Correo para probar
        <input class="form-control" id="test-email" type="email" placeholder="donde@recibir.com" autocomplete="email" />
      </label>
    </div>
    <div class="cta-row">
      <label class="form-check"><input class="form-check-input" type="checkbox" id="smtp-enabled" ${ch?.isEnabled !== false ? "checked" : ""} /> <span class="form-check-label">Canal habilitado</span></label>
      <button type="button" class="btn btn-primary" id="btn-save-smtp">Guardar conexión</button>
      <button type="button" class="btn btn-secondary" id="btn-test-smtp">Verificar</button>
      <p id="smtp-action-status" class="comms-action-status" hidden role="status"></p>
    </div>
  `;

  qs("#btn-save-smtp")?.addEventListener("click", onSaveSmtp);
  qs("#btn-test-smtp")?.addEventListener("click", onTestSmtp);

  if (!canConfigure) {
    panel.querySelectorAll("input,button").forEach((el) => el.setAttribute("disabled", "disabled"));
    const note = document.createElement("p");
    note.className = "alert alert-warn";
    note.textContent = "No tienes permiso para editar la configuración de este PH. Cierra sesión e ingresa como administrador del PH.";
    panel.prepend(note);
  }
}

async function saveSmtpConfig() {
  const secret = qs("#smtp-secret")?.value?.trim();
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
      secret: secret || null
    }
  });
}

function setActionStatus(id, text, isError = false) {
  const el = qs(`#${id}`);
  if (!el) return;
  el.hidden = !text;
  el.textContent = text || "";
  el.style.color = isError ? "#9a3412" : "#007c78";
}

async function onSaveSmtp() {
  const btn = qs("#btn-save-smtp");
  setActionStatus("smtp-action-status", "");
  try {
    await runWithButton(btn, "Guardando…", async () => {
      await saveSmtpConfig();
      setActionStatus("smtp-action-status", "Configuración SMTP guardada.");
      showToast({ title: "Guardado", message: "Configuración SMTP guardada.", variant: "success" });
      await refreshEmailChannel();
    });
  } catch (e) {
    setActionStatus("smtp-action-status", e.message || "No se pudo guardar.", true);
    showToast({ title: "No se pudo guardar", message: e.message, variant: "error", correlationId: e.correlationId });
  }
}

async function onTestSmtp() {
  const destination = qs("#test-email")?.value?.trim();
  if (!destination) {
    showToast({ title: "Correo requerido", message: "Indica a qué correo enviar la verificación.", variant: "warning" });
    qs("#test-email")?.focus();
    return;
  }

  const btn = qs("#btn-test-smtp");
  setActionStatus("smtp-action-status", "");
  try {
    setSemaphore("busy", "Verificando configuración…");
    setActionStatus("smtp-action-status", "Verificando…");
    await runWithButton(btn, "Verificando…", async () => {
      await saveSmtpConfig();
      const result = await api(`/api/communications/ph/${phId}/channels/Email/test`, {
        method: "POST",
        body: { destination }
      });
      if (result.succeeded) {
        setSemaphore("ok", "Configuración correcta");
        setActionStatus("smtp-action-status", `Correo de prueba enviado a ${destination}.`);
        showToast({
          title: "Configuración correcta",
          message: `Correo de prueba enviado a ${destination}.`,
          variant: "success"
        });
      } else {
        setSemaphore("fail", "Configuración incorrecta");
        setActionStatus("smtp-action-status", result.detail || "Revisa host, puerto, usuario y contraseña.", true);
        showToast({
          title: "Configuración incorrecta",
          message: result.detail || "Revisa host, puerto, usuario y contraseña.",
          variant: "error"
        });
      }
      await refreshEmailChannel();
    });
  } catch (e) {
    setSemaphore("fail", "Configuración incorrecta");
    setActionStatus("smtp-action-status", e.message || "Configuración incorrecta.", true);
    showFieldErrorFromApi(e);
    showToast({ title: "Configuración incorrecta", message: e.message, variant: "error", correlationId: e.correlationId });
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
  setActionStatus("profile-action-status", "");
  try {
    await runWithButton(btn, "Guardando…", async () => {
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
    });
    setActionStatus("profile-action-status", "Remitente guardado.");
    setFieldHint("profile-tz", "✓ Guardado", "ok");
    showToast({ title: "Remitente guardado", message: "Se usará en convocatorias e invitaciones.", variant: "success" });
    return true;
  } catch (e) {
    setActionStatus("profile-action-status", e.message || "No se pudo guardar.", true);
    showFieldErrorFromApi(e);
    showToast({ title: "No se pudo guardar", message: e.message, variant: "warning" });
    return false;
  }
}

async function resolveCanConfigure(user) {
  try {
    const caps = await api(`/api/communications/ph/${phId}/capabilities`);
    if (caps?.canConfigure) return true;
  } catch {
    // fall through to client-side heuristics
  }
  return canConfigurePhComms(user, phId);
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
    const pageCtx = await loadPhContext();
    if (!pageCtx) return;
    const phName =
      pageCtx.kind === "ph"
        ? pageCtx.ph?.name
        : pageCtx.assembly?.propertyHorizontalName || pageCtx.assembly?.name || "PH";
    const phLine = qs("#comms-ph-context");
    if (phLine) phLine.textContent = `PH activo · ${phName || "—"}`;
    qs("#comms-ph-sub") &&
      (qs("#comms-ph-sub").textContent =
        "Configura el envío de correos para convocatorias e invitaciones. Los secretos nunca se muestran.");
    requestAnimationFrame(() => qs("#comms-page-title")?.focus?.({ preventScroll: true }));
  } catch (e) {
    showError(e.message);
    return;
  }

  canConfigure = await resolveCanConfigure(user);
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
    qs("#profile-form")?.querySelectorAll("input,button").forEach((el) => el.setAttribute("disabled", "disabled"));
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
