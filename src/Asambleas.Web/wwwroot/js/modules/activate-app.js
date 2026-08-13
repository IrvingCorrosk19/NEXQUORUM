import { api } from "./api.js";
import { AppFeedback } from "./app-feedback.js";

const params = new URLSearchParams(location.search);
const token = params.get("token");
const metaEl = document.getElementById("activate-meta");

function showAlert(message, kind = "error") {
  if (kind === "ok" || kind === "success") {
    AppFeedback.success(message);
  } else {
    AppFeedback.banner.page(message, "error");
  }
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
        AppFeedback.info("Inicia sesión para aceptar la invitación.", { title: "Cuenta existente" });
        const form = document.getElementById("form-activate");
        if (form) form.hidden = true;
        const login = document.createElement("a");
        login.className = "btn btn-primary";
        login.href = `/?acceptInvite=1&token=${encodeURIComponent(token)}`;
        login.textContent = "Iniciar sesión para aceptar invitación";
        metaEl?.after(login);
      }
    })
    .catch(() => showAlert("No pudimos validar la invitación. Solicita un nuevo enlace."));

  document.getElementById("form-activate")?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const fd = new FormData(ev.target);
    const password = String(fd.get("password") || "");
    const confirm = String(fd.get("confirmPassword") || "");
    const submitBtn = ev.target.querySelector('button[type="submit"]');

    AppFeedback.field.clear(ev.target.querySelector('[name="password"]'));
    AppFeedback.field.clear(ev.target.querySelector('[name="confirmPassword"]'));

    if (password.length < 12) {
      AppFeedback.field.error(ev.target.querySelector('[name="password"]'), "La contraseña debe tener al menos 12 caracteres.");
      return;
    }
    if (password !== confirm) {
      AppFeedback.field.error(ev.target.querySelector('[name="confirmPassword"]'), "Las contraseñas no coinciden.");
      return;
    }

    try {
      await AppFeedback.runWithButton(submitBtn, "Activando…", async () =>
        api("/api/ph/invitations/accept", {
          method: "POST",
          body: { token, password }
        })
      );
      AppFeedback.success("Tu acceso quedó activo. Ya puedes iniciar sesión.", { title: "Cuenta activada" });
      setTimeout(() => {
        location.href = "/";
      }, 1200);
    } catch (err) {
      AppFeedback.fromError(err, "No pudimos activar tu cuenta. Verifica los datos e inténtalo de nuevo.");
    }
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
