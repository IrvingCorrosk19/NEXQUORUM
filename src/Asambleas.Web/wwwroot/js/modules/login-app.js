import { api } from "/js/modules/api.js";
import { login, me, hasPermission } from "/js/modules/auth.js";
import { isOperator, isOwnerPortalUser } from "/js/modules/roles.js?v=rbac2";
import { resolveDefaultAssemblyId } from "/js/modules/assembly-context.js";
import {
  scrubCredentialQueryFromLocation,
  showGlobalLoader,
  hideGlobalLoader,
  setButtonLoading
} from "/js/modules/loading.js";
import { AppFeedback } from "/js/modules/app-feedback.js";

scrubCredentialQueryFromLocation();

const emailInput = document.querySelector("#email");
const passwordInput = document.querySelector("#password");
const submitBtn = document.querySelector("#login-submit");
const otpEmail = document.querySelector("#otp-email");
const otpCode = document.querySelector("#otp-code");
const otpRequestForm = document.querySelector("#otp-request-form");
const otpVerifyForm = document.querySelector("#otp-verify-form");
const otpRequestSubmit = document.querySelector("#otp-request-submit");
const otpVerifySubmit = document.querySelector("#otp-verify-submit");
const otpResend = document.querySelector("#otp-resend");
const otpResendHint = document.querySelector("#otp-resend-hint");
const otpSuggest = document.querySelector("#otp-suggest");

let defaultAssemblyId = null;
let oauthBusy = false;
let mesaBusy = false;
let pendingEmail = "";
let resendTimer = null;
let resendAvailableAt = 0;

document.querySelectorAll("[data-toggle-password]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const targetId = btn.getAttribute("data-toggle-password");
    const input = document.getElementById(targetId) || document.querySelector(`input[name="${targetId}"]`);
    if (!input) return;
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    btn.setAttribute("aria-pressed", String(show));
    btn.setAttribute("aria-label", show ? "Ocultar contraseña" : "Mostrar contraseña");
    const eye = btn.querySelector(".icon-eye");
    const eyeOff = btn.querySelector(".icon-eye-off");
    if (eye) eye.hidden = show;
    if (eyeOff) eyeOff.hidden = !show;
  });
});

const loginParams = new URLSearchParams(location.search);
if (loginParams.get("activated") === "1") {
  AppFeedback.success("Tu cuenta quedó activa. Puedes entrar con un código por correo o el acceso de mesa.", {
    title: "Cuenta activada"
  });
}
if (loginParams.get("reset") === "1") {
  AppFeedback.success("Contraseña actualizada. También puedes entrar con un código por correo.", {
    title: "Contraseña restablecida"
  });
}
if (loginParams.get("oauth") === "ok") {
  // Session cookie already set by callback — me() below will redirect.
}

const OAUTH_MESSAGES = {
  cancelled: "Cancelaste el inicio de sesión con el proveedor.",
  unsupported: "Proveedor de acceso no soportado.",
  claims: "No recibimos un correo verificado del proveedor.",
  EMAIL_NOT_VERIFIED: "El correo del proveedor no está verificado.",
  NO_ASSOCIATION: "Esta cuenta todavía no está asociada con una propiedad o invitación.",
  ACCOUNT_EXISTS:
    "Ya existe una cuenta con este correo. Usa «Código por correo» o inicia sesión con tu contraseña de mesa.",
  EMAIL_MISMATCH: "El correo del proveedor no coincide con tu sesión actual.",
  LOGIN_ALREADY_LINKED: "Esta cuenta externa ya está vinculada a otro usuario.",
  USER_DISABLED: "Tu cuenta está desactivada. Contacta al administrador de tu propiedad.",
  RELATION_INACTIVE: "Tu vínculo con la propiedad está inactivo. Contacta a la administración.",
  LINK_FAILED: "No pudimos vincular la cuenta externa.",
  failed: "No pudimos completar el acceso con el proveedor."
};

const oauthError = loginParams.get("oauth_error");
const oauthDetail = loginParams.get("oauth_detail");
const oauthMapped = oauthError
  ? OAUTH_MESSAGES[oauthError] || oauthDetail || OAUTH_MESSAGES.failed
  : "";
if (oauthError) {
  const clean = new URL(location.href);
  clean.searchParams.delete("oauth_error");
  clean.searchParams.delete("oauth_detail");
  history.replaceState({}, "", clean.pathname + clean.search + clean.hash);
}

const loginForm = document.querySelector("#login-form");
const forgotForm = document.querySelector("#forgot-form");
const forgotEmail = document.querySelector("#forgot-email");
const forgotSubmit = document.querySelector("#forgot-submit");
const otpPanel = document.querySelector("#panel-otp");
const mesaPanel = document.querySelector("#panel-mesa");
const methodTabs = document.querySelector("#login-method-tabs");

function revealControl(el) {
  if (!el || typeof el.scrollIntoView !== "function") return;
  try {
    el.scrollIntoView({ block: "center", inline: "nearest" });
  } catch {
    /* ignore */
  }
}

function setFieldError(id, message) {
  const el = document.querySelector(`#${id}`);
  const input = document.querySelector(`#${id.replace(/-error$/, "")}`);
  if (!el) return;
  if (message) {
    el.hidden = false;
    el.textContent = message;
    input?.setAttribute("aria-invalid", "true");
    input?.setAttribute("aria-describedby", id);
    revealControl(el);
  } else {
    el.hidden = true;
    el.textContent = "";
    input?.removeAttribute("aria-invalid");
    input?.removeAttribute("aria-describedby");
  }
}

function clearFormAlerts() {
  document.querySelectorAll(".login-form-alert").forEach((el) => {
    el.hidden = true;
    el.textContent = "";
  });
}

function activeFormAlert() {
  if (forgotForm && !forgotForm.hidden) return document.querySelector("#forgot-form-error");
  if (mesaPanel && !mesaPanel.hidden) return document.querySelector("#mesa-form-error");
  if (otpVerifyForm && !otpVerifyForm.hidden) return document.querySelector("#otp-verify-error");
  return document.querySelector("#otp-request-error") || document.querySelector("#login-error");
}

function showError(message) {
  clearFormAlerts();
  const el = activeFormAlert();
  if (!el) return;
  AppFeedback.banner.show(el, message, "error");
  if (message) revealControl(el);
}

function showLoginMethod(method) {
  const isOtp = method !== "mesa";
  if (otpPanel) otpPanel.hidden = !isOtp;
  if (mesaPanel) mesaPanel.hidden = isOtp;
  document.querySelector("#tab-otp")?.setAttribute("aria-selected", String(isOtp));
  document.querySelector("#tab-mesa")?.setAttribute("aria-selected", String(!isOtp));
  clearFormAlerts();
  setFieldError("otp-email-error", "");
  setFieldError("email-error", "");
  setFieldError("password-error", "");
  if (isOtp) otpEmail?.focus();
  else emailInput?.focus();
}

methodTabs?.addEventListener("click", (ev) => {
  const tab = ev.target?.closest("[role='tab']");
  if (!tab) return;
  if (forgotForm) forgotForm.hidden = true;
  methodTabs.hidden = false;
  if (tab.id === "tab-mesa") showLoginMethod("mesa");
  else showLoginMethod("otp");
});

methodTabs?.addEventListener("keydown", (ev) => {
  if (ev.key !== "ArrowRight" && ev.key !== "ArrowLeft" && ev.key !== "Home" && ev.key !== "End") return;
  const tabs = [...methodTabs.querySelectorAll("[role='tab']")];
  if (!tabs.length) return;
  ev.preventDefault();
  const current = tabs.findIndex((t) => t.getAttribute("aria-selected") === "true");
  let next = current < 0 ? 0 : current;
  if (ev.key === "ArrowRight") next = (current + 1) % tabs.length;
  if (ev.key === "ArrowLeft") next = (current - 1 + tabs.length) % tabs.length;
  if (ev.key === "Home") next = 0;
  if (ev.key === "End") next = tabs.length - 1;
  tabs[next].focus();
  tabs[next].click();
});

document.querySelector("#btn-forgot-password")?.addEventListener("click", () => {
  if (otpPanel) otpPanel.hidden = true;
  if (mesaPanel) mesaPanel.hidden = true;
  if (methodTabs) methodTabs.hidden = true;
  document.querySelector("#oauth-providers")?.setAttribute("hidden", "");
  if (forgotForm) forgotForm.hidden = false;
  if (forgotEmail) {
    const mesaEmail = emailInput?.value?.trim() || "";
    const codeEmail = otpEmail?.value?.trim() || "";
    forgotEmail.value = (!mesaPanel?.hidden && mesaEmail) || codeEmail || mesaEmail;
  }
  forgotEmail?.focus();
  clearFormAlerts();
  setFieldError("forgot-email-error", "");
});

document.querySelector("#btn-forgot-cancel")?.addEventListener("click", () => {
  if (forgotForm) forgotForm.hidden = true;
  if (methodTabs) methodTabs.hidden = false;
  showLoginMethod("mesa");
  revealConfiguredProviders();
});

forgotForm?.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const email = String(forgotEmail?.value || "").trim();
  if (!email || !email.includes("@")) {
    setFieldError("forgot-email-error", "Escribe un correo válido.");
    forgotEmail?.focus();
    return;
  }
  setFieldError("forgot-email-error", "");
  try {
    const result = await AppFeedback.runWithButton(forgotSubmit, "Enviando…", async () =>
      api("/api/auth/forgot-password", { method: "POST", body: { email } })
    );
    AppFeedback.success(result?.detail || "Si existe una cuenta con ese correo, enviamos el enlace.", {
      title: "Revisa tu correo"
    });
    if (forgotForm) forgotForm.hidden = true;
    if (methodTabs) methodTabs.hidden = false;
    showLoginMethod("mesa");
    revealConfiguredProviders();
  } catch (err) {
    showError(err?.payload?.detail || err?.message || "No pudimos procesar la solicitud. Inténtalo de nuevo en unos minutos.");
  }
});

function safeReturnUrl() {
  const raw = new URLSearchParams(location.search).get("returnUrl");
  if (!raw) return null;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("://")) return null;
  if (raw.toLowerCase().includes("javascript:")) return null;
  return raw;
}

const pendingInviteToken =
  loginParams.get("acceptInvite") === "1" ? loginParams.get("token") || "" : "";

async function acceptPendingInvite() {
  if (!pendingInviteToken) return;
  try {
    await api("/api/ph/invitations/accept", {
      method: "POST",
      body: { token: pendingInviteToken }
    });
  } catch (err) {
    const code = err?.code || "";
    if (code === "INVITE_CONSUMED") return;
    throw err;
  }
}

async function finishLogin(session, explicitReturn) {
  try {
    await acceptPendingInvite();
  } catch (err) {
    hideGlobalLoader();
    setButtonLoading(otpVerifySubmit, false);
    setButtonLoading(submitBtn, false);
    mesaBusy = false;
    showError(err?.message || "Iniciaste sesión, pero no pudimos vincular la invitación.");
    return;
  }
  const fresh = await me().catch(() => session);
  goHome(fresh || session, explicitReturn);
}

function goHome(user, explicitReturn) {
  let ret = explicitReturn || safeReturnUrl();
  if (ret && ret.startsWith("/lobby.html")) {
    ret = ret.replace(/^\/lobby\.html/i, "/assembly.html");
  }
  if (ret) {
    location.assign(ret);
    return;
  }
  if (isOwnerPortalUser(user)) {
    location.assign("/owner.html");
    return;
  }
  if (hasPermission(user, "ph:view") || isOperator(user)) {
    location.assign("/ph.html");
    return;
  }
  location.assign("/calendar.html");
}

function startOAuth(provider) {
  if (oauthBusy) return;
  oauthBusy = true;
  const btn = document.querySelector(`[data-provider="${provider}"]`);
  document.querySelectorAll("[data-provider]").forEach((el) => {
    el.disabled = true;
    el.classList.add("is-loading");
  });
  if (btn) setButtonLoading(btn, true, "Conectando…");
  showGlobalLoader("Redirigiendo al proveedor…", { hint: "Acceso seguro" });
  const ret = safeReturnUrl() || "/";
  const url = `/api/auth/external/${encodeURIComponent(provider)}/challenge?returnUrl=${encodeURIComponent(ret)}`;
  location.assign(url);
}

function updateLoginLede(providers) {
  const lede = document.querySelector("#login-main-msg");
  if (!lede) return;
  const parts = [];
  if (providers?.google) parts.push("Google");
  if (providers?.microsoft) parts.push("Microsoft");
  if (parts.length === 2) {
    lede.textContent =
      "Ingresa con Google, Microsoft o recibe un código en tu correo. No necesitas crear una contraseña.";
  } else if (parts.length === 1) {
    lede.textContent = `Ingresa con ${parts[0]} o recibe un código en tu correo. También puedes usar el acceso de mesa y administración.`;
  } else {
    lede.textContent =
      "Recibe un código en tu correo para entrar. El acceso con contraseña queda reservado a mesa y administración.";
  }
}

async function revealConfiguredProviders() {
  const box = document.querySelector("#oauth-providers");
  if (!box || forgotForm?.hidden === false) return;
  try {
    const cfg = await api("/api/auth/external/providers");
    const googleBtn = document.querySelector("#btn-oauth-google");
    const msBtn = document.querySelector("#btn-oauth-microsoft");
    let any = false;
    if (googleBtn) {
      googleBtn.hidden = !cfg?.google;
      any = any || !!cfg?.google;
    }
    if (msBtn) {
      msBtn.hidden = !cfg?.microsoft;
      any = any || !!cfg?.microsoft;
    }
    box.hidden = !any;
    updateLoginLede(cfg || {});
    // Keep divider visible when at least one provider exists (HTML already has divider).
  } catch {
    box.hidden = true;
    updateLoginLede({});
  }
}

function suggestFromEmail(email) {
  const at = String(email || "").indexOf("@");
  if (at < 0) return null;
  const domain = email.slice(at + 1).toLowerCase();
  if (domain === "gmail.com" || domain === "googlemail.com") return "Google";
  if (["outlook.com", "hotmail.com", "live.com", "msn.com"].includes(domain) || domain.endsWith(".onmicrosoft.com")) {
    return "Microsoft";
  }
  return null;
}

function updateSuggest() {
  if (!otpSuggest) return;
  const s = suggestFromEmail(otpEmail?.value || "");
  const googleVisible = document.querySelector("#btn-oauth-google") && !document.querySelector("#btn-oauth-google").hidden;
  const msVisible = document.querySelector("#btn-oauth-microsoft") && !document.querySelector("#btn-oauth-microsoft").hidden;
  if (!s || (s === "Google" && !googleVisible) || (s === "Microsoft" && !msVisible)) {
    otpSuggest.hidden = true;
    otpSuggest.textContent = "";
    return;
  }
  otpSuggest.hidden = false;
  otpSuggest.textContent =
    s === "Google"
      ? "Sugerencia: puedes usar Continuar con Google o recibir un código."
      : "Sugerencia: puedes usar Continuar con Microsoft o recibir un código.";
}

otpEmail?.addEventListener("input", updateSuggest);

document.querySelectorAll(".login-card input").forEach((input) => {
  input.addEventListener("focus", () => revealControl(input));
});

function showVerifyStep(email, resendAtIso, { deliveryConfirmed = false } = {}) {
  pendingEmail = email;
  if (otpRequestForm) otpRequestForm.hidden = true;
  if (otpVerifyForm) otpVerifyForm.hidden = false;
  const display = document.querySelector("#otp-email-display");
  if (display) display.textContent = email;
  const copy = document.querySelector("#otp-verify-copy");
  if (copy) {
    // Same public wording whether or not the mailbox is eligible (anti-enumeration).
    copy.innerHTML =
      `Si este correo tiene acceso, recibirás un código de 6 dígitos en <strong id="otp-email-display">${escapeHtml(email)}</strong>. Si llega, tienes 10 minutos para usarlo.`;
  }
  if (otpCode) {
    otpCode.value = "";
    otpCode.focus();
  }
  const at = resendAtIso
    ? Date.parse(resendAtIso)
    : deliveryConfirmed
      ? Date.now() + 60000
      : Date.now() + 60000;
  startResendCountdown(Number.isFinite(at) ? at : Date.now() + 60000);
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function showRequestStep() {
  pendingEmail = "";
  if (otpVerifyForm) otpVerifyForm.hidden = true;
  if (otpRequestForm) otpRequestForm.hidden = false;
  otpEmail?.focus();
  if (resendTimer) clearInterval(resendTimer);
}

function startResendCountdown(availableAtMs) {
  resendAvailableAt = availableAtMs;
  if (resendTimer) clearInterval(resendTimer);
  const tick = () => {
    const left = Math.max(0, Math.ceil((resendAvailableAt - Date.now()) / 1000));
    if (otpResend) otpResend.disabled = left > 0;
    if (otpResendHint) {
      otpResendHint.textContent =
        left > 0 ? `Podrás reenviar el código en ${left}s.` : "Puedes reenviar el código ahora.";
    }
  };
  tick();
  resendTimer = setInterval(tick, 500);
}

otpRequestForm?.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const email = String(otpEmail?.value || "").trim();
  if (!email || !email.includes("@")) {
    setFieldError("otp-email-error", "Escribe un correo válido.");
    otpEmail?.focus();
    return;
  }
  setFieldError("otp-email-error", "");
  try {
    const result = await AppFeedback.runWithButton(otpRequestSubmit, "Enviando código…", async () =>
      api("/api/auth/email-otp/request", {
        method: "POST",
        body: { email, returnUrl: safeReturnUrl() }
      })
    );
    if (result?.accepted === false || result?.errorCode === "SEND_FAILED") {
      showError(result?.detail || "No pudimos enviar el código en este momento. Intenta nuevamente.");
      return;
    }
    // Same public UX for eligible and non-eligible (anti-enumeration).
    AppFeedback.info(
      result?.detail || "Si este correo tiene acceso, recibirás un código.",
      { title: "Solicitud recibida" }
    );
    showVerifyStep(email, result?.resendAvailableAtUtc, {
      deliveryConfirmed: result?.deliveryConfirmed === true
    });
  } catch (err) {
    showError(err?.payload?.detail || err?.message || "No pudimos enviar el código. Inténtalo de nuevo en unos minutos.");
  }
});

otpVerifyForm?.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const code = String(otpCode?.value || "").replace(/\D/g, "");
  if (code.length !== 6) {
    setFieldError("otp-code-error", "Escribe el código de 6 dígitos.");
    otpCode?.focus();
    return;
  }
  setFieldError("otp-code-error", "");
  setButtonLoading(otpVerifySubmit, true, "Verificando…");
  showGlobalLoader("Verificando código…", { hint: "Acceso sin contraseña" });
  try {
    const result = await api("/api/auth/email-otp/verify", {
      method: "POST",
      body: { email: pendingEmail, code, returnUrl: safeReturnUrl() }
    });
    if (!result?.succeeded) {
      hideGlobalLoader();
      setButtonLoading(otpVerifySubmit, false);
      showError(result?.message || "El código no es válido o ya venció.");
      return;
    }
    showGlobalLoader("Entrando a tu asamblea…");
    const session = result.user || (await me());
    await finishLogin(session, result.returnUrl);
  } catch (err) {
    hideGlobalLoader();
    setButtonLoading(otpVerifySubmit, false);
    const msg =
      err?.payload?.message ||
      err?.payload?.detail ||
      err?.message ||
      "El código no es válido o ya venció. Solicita uno nuevo.";
    showError(msg);
  }
});

otpResend?.addEventListener("click", async () => {
  if (!pendingEmail || otpResend.disabled) return;
  try {
    const result = await AppFeedback.runWithButton(otpResend, "Reenviando…", async () =>
      api("/api/auth/email-otp/request", {
        method: "POST",
        body: { email: pendingEmail, returnUrl: safeReturnUrl() }
      })
    );
    if (result?.accepted === false || result?.errorCode === "SEND_FAILED") {
      AppFeedback.error(
        result?.detail || "No pudimos enviar el código en este momento. Intenta nuevamente.",
        { title: "Reenvío no disponible" }
      );
      if (otpResend) otpResend.disabled = false;
      if (otpResendHint) otpResendHint.textContent = "Puedes intentar reenviar el código ahora.";
      return;
    }
    AppFeedback.info(result?.detail || "Si este correo tiene acceso, recibirás un código.", {
      title: "Solicitud recibida"
    });
    startResendCountdown(Date.parse(result?.resendAvailableAtUtc) || Date.now() + 60000);
  } catch (err) {
    AppFeedback.fromError(err, "No pudimos reenviar el código.");
  }
});

document.querySelector("#otp-change-email")?.addEventListener("click", () => {
  showRequestStep();
  clearFormAlerts();
});

document.querySelector("#btn-oauth-google")?.addEventListener("click", () => startOAuth("Google"));
document.querySelector("#btn-oauth-microsoft")?.addEventListener("click", () => startOAuth("Microsoft"));
revealConfiguredProviders();
if (oauthMapped) showError(oauthMapped);

// Prefill email from query (?email=) for convocation deep-links.
const prefill = loginParams.get("email");
if (prefill && otpEmail) {
  otpEmail.value = prefill;
  updateSuggest();
}

try {
  const session = await me();
  const users = await api("/api/demo/users").catch(() => null);
  defaultAssemblyId = users?.[0]?.assemblyId || null;
  await finishLogin(session);
} catch {
  // not authenticated
}

loginForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  event.stopPropagation();
  if (mesaBusy) return;
  showError("");

  const email = emailInput?.value?.trim() || "";
  const password = passwordInput?.value || "";
  if (!email || !email.includes("@")) {
    setFieldError("email-error", "Escribe un correo válido.");
    emailInput?.focus();
    return;
  }
  setFieldError("email-error", "");
  if (!password) {
    setFieldError("password-error", "Escribe tu contraseña.");
    passwordInput?.focus();
    return;
  }
  setFieldError("password-error", "");
  mesaBusy = true;
  if (submitBtn) submitBtn.disabled = true;
  if (passwordInput) passwordInput.value = "";

  setButtonLoading(submitBtn, true, "Iniciando sesión…");
  showGlobalLoader("Verificando acceso…", { hint: "Autenticación segura" });

  try {
    const session = await login(email, password);
    showGlobalLoader("Preparando tu acceso…");
    await finishLogin(session || (await me()));
  } catch {
    hideGlobalLoader();
    setButtonLoading(submitBtn, false);
    mesaBusy = false;
    if (emailInput) emailInput.value = email;
    showError("No pudimos iniciar sesión. Verifica tus credenciales.");
  }
});
