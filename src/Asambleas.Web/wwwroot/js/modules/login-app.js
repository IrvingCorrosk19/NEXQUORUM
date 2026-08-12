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

scrubCredentialQueryFromLocation();

const errorEl = document.querySelector("#login-error");
const demoRoot = document.querySelector("#demo-users");
const emailInput = document.querySelector("#email");
const passwordInput = document.querySelector("#password");
const submitBtn = document.querySelector("#login-submit");
let defaultAssemblyId = null;

function showError(message) {
  errorEl.hidden = !message;
  errorEl.textContent = message || "";
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
