import { api } from "./api.js";

const params = new URLSearchParams(location.search);
const token = params.get("token");
const alertEl = document.getElementById("page-alert");

function showAlert(message, kind = "error") {
  alertEl.hidden = false;
  alertEl.textContent = message;
  alertEl.className = `alert alert-${kind === "error" ? "danger" : "success"}`;
}

if (!token) {
  showAlert("Enlace de activación inválido. Solicita una nueva invitación.");
}

document.getElementById("form-activate").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const data = Object.fromEntries(new FormData(ev.target).entries());
  if (data.password !== data.confirm) {
    showAlert("Las contraseñas no coinciden.");
    return;
  }
  if (params.get("password") || params.get("email")) {
    showAlert("Este enlace no debe incluir credenciales. Usa solo el token de invitación.");
    return;
  }
  try {
    await api("/api/ph/invitations/activate", {
      method: "POST",
      body: {
        token,
        password: data.password,
        displayName: data.displayName || null
      }
    });
    showAlert("Cuenta activada. Ya puedes iniciar sesión.", "ok");
    setTimeout(() => {
      location.href = "/";
    }, 1200);
  } catch (err) {
    showAlert(err.message || String(err));
  }
});
