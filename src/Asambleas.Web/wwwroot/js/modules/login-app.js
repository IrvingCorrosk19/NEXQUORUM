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
  AppFeedback.success("Tu cuenta quedó activa. Puedes entrar con Google, Microsoft o un código por correo.", {
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
    "Ya existe una cuenta con este correo. Usa «Recibir código» o inicia sesión con tu contraseña de mesa.",
  EMAIL_MISMATCH: "El correo del proveedor no coincide con tu sesión actual.",
  LOGIN_ALREADY_LINKED: "Esta cuenta externa ya está vinculada a otro usuario.",
  USER_DISABLED: "Tu cuenta está desactivada. Contacta al administrador de tu propiedad.",
  RELATION_INACTIVE: "Tu vínculo con la propiedad está inactivo. Contacta a la administración.",
  LINK_FAILED: "No pudimos vincular la cuenta externa.",
  failed: "No pudimos completar el acceso con el proveedor."
};

const oauthError = loginParams.get("oauth_error");
const oauthDetail = loginParams.get("oauth_detail");
if (oauthError) {
  const mapped = OAUTH_MESSAGES[oauthError] || oauthDetail || OAUTH_MESSAGES.failed;
  AppFeedback.banner.login(mapped, "error");
  const clean = new URL(location.href);
  clean.searchParams.delete("oauth_error");
  clean.searchParams.delete("oauth_detail");
  history.replaceState({}, "", clean.pathname + clean.search + clean.hash);
}

const loginForm = document.querySelector("#login-form");
const forgotForm = document.querySelector("#forgot-form");
const forgotEmail = document.querySelector("#forgot-email");
const forgotSubmit = document.querySelector("#forgot-submit");
const passwordDetails = document.querySelector("#password-login-details");

document.querySelector("#btn-forgot-password")?.addEventListener("click", () => {
  if (passwordDetails) passwordDetails.hidden = true;
  if (otpRequestForm) otpRequestForm.hidden = true;
  if (otpVerifyForm) otpVerifyForm.hidden = true;
  document.querySelector("#oauth-providers")?.setAttribute("hidden", "");
  if (forgotForm) forgotForm.hidden = false;
  if (forgotEmail && (otpEmail?.value || emailInput?.value)) {
    forgotEmail.value = otpEmail?.value || emailInput.value;
  }
  forgotEmail?.focus();
  AppFeedback.banner.clear("#login-error");
});

document.querySelector("#btn-forgot-cancel")?.addEventListener("click", () => {
  if (forgotForm) forgotForm.hidden = true;
  if (otpRequestForm) otpRequestForm.hidden = false;
  if (passwordDetails) passwordDetails.hidden = false;
  revealConfiguredProviders();
  otpEmail?.focus();
});

forgotForm?.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const email = String(forgotEmail?.value || "").trim();
  if (!email) {
    AppFeedback.warning("Indica el correo de tu cuenta.", { title: "Correo requerido" });
    forgotEmail?.focus();
    return;
  }
  try {
    const result = await AppFeedback.runWithButton(forgotSubmit, "Enviando…", async () =>
      api("/api/auth/forgot-password", { method: "POST", body: { email } })
    );
    AppFeedback.success(result?.detail || "Si existe una cuenta con ese correo, enviamos el enlace.", {
      title: "Revisa tu correo"
    });
    if (forgotForm) forgotForm.hidden = true;
    if (otpRequestForm) otpRequestForm.hidden = false;
    if (passwordDetails) passwordDetails.hidden = false;
    revealConfiguredProviders();
  } catch (err) {
    AppFeedback.fromError(err, "No pudimos procesar la solicitud. Inténtalo de nuevo en unos minutos.");
  }
});

function showError(message) {
  AppFeedback.banner.login(message, "error");
}

function safeReturnUrl() {
  const raw = new URLSearchParams(location.search).get("returnUrl");
  if (!raw) return null;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("://")) return null;
  if (raw.toLowerCase().includes("javascript:")) return null;
  return raw;
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
    // Keep divider visible when at least one provider exists (HTML already has divider).
  } catch {
    box.hidden = true;
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
  if (!s) {
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

function showVerifyStep(email, resendAtIso) {
  pendingEmail = email;
  if (otpRequestForm) otpRequestForm.hidden = true;
  if (otpVerifyForm) otpVerifyForm.hidden = false;
  const display = document.querySelector("#otp-email-display");
  if (display) display.textContent = email;
  if (otpCode) {
    otpCode.value = "";
    otpCode.focus();
  }
  const at = resendAtIso ? Date.parse(resendAtIso) : Date.now() + 60000;
  startResendCountdown(Number.isFinite(at) ? at : Date.now() + 60000);
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
    AppFeedback.warning("Escribe un correo válido.", { title: "Correo requerido" });
    otpEmail?.focus();
    return;
  }
  try {
    const result = await AppFeedback.runWithButton(otpRequestSubmit, "Enviando…", async () =>
      api("/api/auth/email-otp/request", {
        method: "POST",
        body: { email, returnUrl: safeReturnUrl() }
      })
    );
    if (result?.deliveryConfirmed === true) {
      AppFeedback.success(
        result?.detail || "Código enviado. Revisa tu bandeja de entrada y correo no deseado.",
        { title: "Código enviado" }
      );
      showVerifyStep(email, result?.resendAvailableAtUtc);
      return;
    }
    if (result?.accepted === false || result?.errorCode === "SEND_FAILED") {
      AppFeedback.error(
        result?.detail || "No pudimos enviar el código en este momento. Intenta nuevamente.",
        { title: "Envío no disponible" }
      );
      return;
    }
    // Soft ack: request received without confirming mailbox delivery (unknown email / rate limit).
    AppFeedback.info(
      result?.detail ||
        "Si el correo está registrado o tiene una invitación activa, recibirás un código.",
      { title: "Solicitud recibida" }
    );
    showVerifyStep(email, result?.resendAvailableAtUtc);
  } catch (err) {
    AppFeedback.fromError(err, "No pudimos enviar el código. Inténtalo de nuevo en unos minutos.");
  }
});

otpVerifyForm?.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const code = String(otpCode?.value || "").replace(/\D/g, "");
  if (code.length !== 6) {
    AppFeedback.warning("Escribe el código de 6 dígitos.", { title: "Código incompleto" });
    otpCode?.focus();
    return;
  }
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
    goHome(session, result.returnUrl);
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
    if (result?.deliveryConfirmed === true) {
      AppFeedback.success(
        result?.detail || "Código enviado. Revisa tu bandeja de entrada y correo no deseado.",
        { title: "Código reenviado" }
      );
      startResendCountdown(Date.parse(result?.resendAvailableAtUtc) || Date.now() + 60000);
      return;
    }
    if (result?.accepted === false || result?.errorCode === "SEND_FAILED") {
      AppFeedback.error(
        result?.detail || "No pudimos enviar el código en este momento. Intenta nuevamente.",
        { title: "Reenvío no disponible" }
      );
      if (otpResend) otpResend.disabled = false;
      if (otpResendHint) otpResendHint.textContent = "Puedes intentar reenviar el código ahora.";
      return;
    }
    AppFeedback.info(
      result?.detail ||
        "Si el correo está registrado o tiene una invitación activa, recibirás un código.",
      { title: "Solicitud recibida" }
    );
  } catch (err) {
    AppFeedback.fromError(err, "No pudimos reenviar el código.");
  }
});

document.querySelector("#otp-change-email")?.addEventListener("click", () => {
  showRequestStep();
  AppFeedback.banner.clear("#login-error");
});

document.querySelector("#btn-oauth-google")?.addEventListener("click", () => startOAuth("Google"));
document.querySelector("#btn-oauth-microsoft")?.addEventListener("click", () => startOAuth("Microsoft"));
revealConfiguredProviders();

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
  goHome(session);
} catch {
  // not authenticated
}

loginForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  event.stopPropagation();
  showError("");

  const email = emailInput?.value?.trim() || "";
  const password = passwordInput?.value || "";
  if (passwordInput) passwordInput.value = "";

  setButtonLoading(submitBtn, true, "Iniciando sesión");
  showGlobalLoader("Verificando acceso…", { hint: "Autenticación segura" });

  try {
    const session = await login(email, password);
    showGlobalLoader("Preparando tu acceso…");
    goHome(session || (await me()));
  } catch {
    hideGlobalLoader();
    setButtonLoading(submitBtn, false);
    showError("No pudimos iniciar sesión. Verifica tus credenciales.");
  }
});
