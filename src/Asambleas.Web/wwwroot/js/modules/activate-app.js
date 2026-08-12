import { api } from "./api.js";

const params = new URLSearchParams(location.search);
const token = params.get("token");
const alertEl = document.getElementById("page-alert");
const metaEl = document.getElementById("activate-meta");

function showAlert(message, kind = "error") {
  alertEl.hidden = false;
  alertEl.textContent = message;
  alertEl.className = `alert alert-${kind === "error" ? "danger" : "success"}`;
}

if (!token) {
  showAlert("Enlace de activación inválido. Solicita una nueva invitación.");
} else {
  api(`/api/ph/invitations/preview?token=${encodeURIComponent(token)}`)
    .then((preview) => {
      if (preview.errorCode || preview.isExpired) {
        showAlert(preview.errorMessage || "Esta invitación no es válida.");
        document.getElementById("form-activate")?.setAttribute("hidden", "hidden");
        return;
      }
      if (metaEl) {
        metaEl.hidden = false;
        metaEl.innerHTML = `
          <h2 style="margin:0 0 .5rem;font-size:1.25rem">Activa tu cuenta</h2>
          <p style="margin:0"><strong>${escapeHtml(preview.ownerDisplayName || "")}</strong></p>
          <p style="margin:.25rem 0 0">${escapeHtml(preview.propertyHorizontalName || "")}</p>
          <p style="margin:.25rem 0 0;color:var(--muted,#666)">${escapeHtml(preview.email || "")}</p>`;
      }
      if (preview.requiresLoginToAccept) {
        showAlert("Ya tienes una cuenta. Inicia sesión para aceptar la invitación.", "ok");
        const form = document.getElementById("form-activate");
        if (form) form.hidden = true;
        const login = document.createElement("a");
        login.className = "btn btn-primary";
        login.href = `/?acceptInvite=1&token=${encodeURIComponent(token)}`;
        login.textContent = "Iniciar sesión para aceptar invitación";
        metaEl?.after(login);
      }
    })
    .catch((err) => showAlert(err.message || String(err)));
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
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
    showAlert("✓ Cuenta activada. Ya puedes iniciar sesión.", "ok");
    setTimeout(() => {
      location.href = "/";
    }, 1200);
  } catch (err) {
    showAlert(err.message || String(err));
  }
});
