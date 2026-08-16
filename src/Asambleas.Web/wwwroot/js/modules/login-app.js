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

const errorEl = document.querySelector("#login-error");
const demoRoot = document.querySelector("#demo-users");
const emailInput = document.querySelector("#email");
const passwordInput = document.querySelector("#password");
const submitBtn = document.querySelector("#login-submit");
let defaultAssemblyId = null;

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

const loginForm = document.querySelector("#login-form");
const forgotForm = document.querySelector("#forgot-form");
const forgotEmail = document.querySelector("#forgot-email");
const forgotSubmit = document.querySelector("#forgot-submit");

document.querySelector("#btn-forgot-password")?.addEventListener("click", () => {
  if (loginForm) loginForm.hidden = true;
  if (forgotForm) forgotForm.hidden = false;
  if (forgotEmail && emailInput?.value) forgotEmail.value = emailInput.value;
  forgotEmail?.focus();
  AppFeedback.banner.clear("#login-error");
});

document.querySelector("#btn-forgot-cancel")?.addEventListener("click", () => {
  if (forgotForm) forgotForm.hidden = true;
  if (loginForm) loginForm.hidden = false;
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
  // Operators land on PH home — not a mixed assembly command panel.
  if (hasPermission(user, "ph:view") || isOperator(user)) {
    location.assign("/ph.html");
    return;
  }
  location.assign("/calendar.html");
}

try {
  const session = await me();
  const users = await api("/api/demo/users").catch(() => null);
  defaultAssemblyId = users?.[0]?.assemblyId || null;
  goHome(session);
} catch {
  // not authenticated
}

try {
  const users = await api("/api/demo/users");
  defaultAssemblyId = users?.[0]?.assemblyId;
  demoRoot.innerHTML = users
    .map(
      (u) => `
          <button type="button" data-email="${u.email}">
            <strong>${u.displayName}</strong><br />
            <span>${u.email} · ${u.role} · Unidad ${u.unitCode}</span>
          </button>`
    )
    .join("");

  demoRoot.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      emailInput.value = btn.getAttribute("data-email") || "";
      passwordInput.value = "";
      passwordInput.focus();
    });
  });
} catch (error) {
  demoRoot.innerHTML = `<p>${error.message}</p>`;
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
