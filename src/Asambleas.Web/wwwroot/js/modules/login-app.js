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
let defaultAssemblyId = null;
let oauthBusy = false;

document.querySelectorAll("[data-toggle-password]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const targetId = btn.getAttribute("data-toggle-password");
    const input = document.getElementById(targetId) || document.querySelector(`input[name="${targetId}"]`);
    if (!input) return;
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    btn.setAttribute("aria-pressed", String(show));
    btn.setAttribute("aria-label", show ? "Ocultar contraseña" : "Mostrar contraseña");
    btn.title = show ? "Ocultar contraseña" : "Mostrar contraseña";
    const eye = btn.querySelector(".icon-eye");
    const eyeOff = btn.querySelector(".icon-eye-off");
    if (eye) eye.hidden = show;
    if (eyeOff) eyeOff.hidden = !show;
  });
});

const loginParams = new URLSearchParams(location.search);
if (loginParams.get("activated") === "1") {
  AppFeedback.success("Tu cuenta quedó activa. Inicia sesión con tu correo y la contraseña que definiste.", {
    title: "Cuenta activada"
  });
}
if (loginParams.get("reset") === "1") {
  AppFeedback.success("Contraseña actualizada. Inicia sesión con tu correo y la nueva contraseña.", {
    title: "Contraseña restablecida"
  });
}

const OAUTH_MESSAGES = {
  cancelled: "Cancelaste el inicio de sesión con el proveedor.",
  unsupported: "Proveedor de acceso no soportado.",
  claims: "No recibimos un correo verificado del proveedor.",
  EMAIL_NOT_VERIFIED: "El correo del proveedor no está verificado.",
  NO_ASSOCIATION: "Esta cuenta todavía no está asociada con una propiedad o invitación.",
  ACCOUNT_EXISTS: "Ya existe una cuenta con este correo. Inicia sesión con tu contraseña y vincula Google/Microsoft desde tu sesión.",
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

document.querySelector("#btn-forgot-password")?.addEventListener("click", () => {
  if (loginForm) loginForm.hidden = true;
  if (forgotForm) forgotForm.hidden = false;
  document.querySelector("#oauth-providers")?.setAttribute("hidden", "");
  if (forgotEmail && emailInput?.value) forgotEmail.value = emailInput.value;
  forgotEmail?.focus();
  AppFeedback.banner.clear("#login-error");
});

document.querySelector("#btn-forgot-cancel")?.addEventListener("click", () => {
  if (forgotForm) forgotForm.hidden = true;
  if (loginForm) loginForm.hidden = false;
  revealConfiguredProviders();
  emailInput?.focus();
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
    if (loginForm) loginForm.hidden = false;
    revealConfiguredProviders();
    if (emailInput) emailInput.value = email;
  } catch (err) {
    AppFeedback.fromError(err, "No pudimos procesar la solicitud. Inténtalo de nuevo en unos minutos.");
  }
});

function showError(message) {
  AppFeedback.banner.login(message, "error");
}

async function resolvePostLoginAssemblyId() {
  if (defaultAssemblyId) return defaultAssemblyId;
  try {
    const users = await api("/api/demo/users");
    if (users?.[0]?.assemblyId) return String(users[0].assemblyId);
  } catch {
    /* fall through */
  }
  return resolveDefaultAssemblyId();
}

function safeReturnUrl() {
  const raw = new URLSearchParams(location.search).get("returnUrl");
  if (!raw) return null;
  // Open-redirect guard: same-origin relative path only.
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("://")) return null;
  if (raw.toLowerCase().includes("javascript:")) return null;
  return raw;
}

function goHome(user) {
  const ret = safeReturnUrl();
  if (ret) {
    location.assign(ret);
    return;
  }
  if (isOwnerPortalUser(user)) {
    location.assign("/owner.html");
    return;
  }
  // Operators/president land on Propiedades (catalog) — not a PH resumen.
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
  const other = document.querySelectorAll("[data-provider]");
  other.forEach((el) => {
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
  } catch {
    box.hidden = true;
  }
}

document.querySelector("#btn-oauth-google")?.addEventListener("click", () => startOAuth("Google"));
document.querySelector("#btn-oauth-microsoft")?.addEventListener("click", () => startOAuth("Microsoft"));
revealConfiguredProviders();

try {
  const session = await me();
  const users = await api("/api/demo/users").catch(() => null);
  defaultAssemblyId = users?.[0]?.assemblyId || null;
  goHome(session);
} catch {
  // not authenticated
}

document.querySelector("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  event.stopPropagation();
  showError("");

  const email = emailInput.value.trim();
  const password = passwordInput.value;
  passwordInput.value = "";

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
