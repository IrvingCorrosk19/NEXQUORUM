import { api } from "/js/modules/api.js";
import { login, me } from "/js/modules/auth.js";
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

function goDashboard(assemblyId) {
  if (!assemblyId) {
    showError("No hay asamblea demo disponible.");
    return;
  }
  location.assign(`/dashboard.html?assemblyId=${encodeURIComponent(assemblyId)}`);
}

try {
  await me();
  const users = await api("/api/demo/users");
  defaultAssemblyId = users?.[0]?.assemblyId;
  if (defaultAssemblyId) {
    goDashboard(defaultAssemblyId);
  }
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
  // Clear password field early so it cannot linger in DOM after navigation failures.
  passwordInput.value = "";

  setButtonLoading(submitBtn, true, "Iniciando sesión");
  showGlobalLoader("Verificando acceso…", { hint: "Autenticación segura" });

  try {
    await login(email, password);
    const users = await api("/api/demo/users");
    const assemblyId = users?.[0]?.assemblyId || defaultAssemblyId;
    showGlobalLoader("Preparando tu asamblea…");
    goDashboard(assemblyId);
  } catch {
    hideGlobalLoader();
    setButtonLoading(submitBtn, false);
    showError("No pudimos iniciar sesión. Verifica tus credenciales.");
  }
});
