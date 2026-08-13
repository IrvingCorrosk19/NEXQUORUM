import { api } from "./api.js";
import { AppFeedback } from "./app-feedback.js";

const params = new URLSearchParams(location.search);
const token = params.get("token");
const metaEl = document.getElementById("activate-meta");
const form = document.getElementById("form-activate");

function showAlert(message, kind = "error") {
  if (kind === "ok" || kind === "success") {
    AppFeedback.success(message, { title: "Listo" });
    AppFeedback.banner.page(message, "success");
  } else {
    AppFeedback.error(message);
    AppFeedback.banner.page(message, "error");
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

if (!token) {
  showAlert("Enlace de activación inválido. Solicita una nueva invitación.");
  if (form) form.hidden = true;
} else {
  api(`/api/ph/invitations/preview?token=${encodeURIComponent(token)}`)
    .then((preview) => {
      if (preview.errorCode || preview.isExpired) {
        showAlert(preview.errorMessage || "Esta invitación no es válida.");
        if (form) form.hidden = true;
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

      const displayInput = form?.querySelector('[name="displayName"]');
      if (displayInput && !displayInput.value && preview.ownerDisplayName) {
        displayInput.value = preview.ownerDisplayName;
      }

      if (preview.requiresLoginToAccept) {
        AppFeedback.info("Ya existe una cuenta con este correo. Inicia sesión para aceptar la invitación.", {
          title: "Cuenta existente"
        });
        if (form) form.hidden = true;
        const login = document.createElement("a");
        login.className = "btn btn-primary";
        login.href = `/?acceptInvite=1&token=${encodeURIComponent(token)}`;
        login.textContent = "Iniciar sesión para aceptar invitación";
        metaEl?.after(login);
      }
    })
    .catch(() => {
      showAlert("No pudimos validar la invitación. Solicita un nuevo enlace.");
      if (form) form.hidden = true;
    });

  form?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const fd = new FormData(ev.target);
    const displayName = String(fd.get("displayName") || "").trim();
    const password = String(fd.get("password") || "");
    const confirm = String(fd.get("confirmPassword") || fd.get("confirm") || "");
    const passwordInput = ev.target.querySelector('[name="password"]');
    const confirmInput =
      ev.target.querySelector('[name="confirmPassword"]') || ev.target.querySelector('[name="confirm"]');
    const submitBtn = ev.target.querySelector('button[type="submit"]');

    AppFeedback.field.clear(passwordInput);
    AppFeedback.field.clear(confirmInput);
    AppFeedback.banner.clear("#page-alert");

    if (password.length < 12) {
      AppFeedback.field.error(passwordInput, "La contraseña debe tener al menos 12 caracteres.");
      AppFeedback.warning("La contraseña debe tener al menos 12 caracteres.", { title: "Contraseña débil" });
      passwordInput?.focus();
      return;
    }
    if (password !== confirm) {
      AppFeedback.field.error(confirmInput, "Las contraseñas no coinciden.");
      AppFeedback.warning("Las contraseñas no coinciden.", { title: "Revisa la confirmación" });
      confirmInput?.focus();
      return;
    }

    try {
      await AppFeedback.runWithButton(submitBtn, "Activando…", async () =>
        api("/api/ph/invitations/activate", {
          method: "POST",
          body: {
            token,
            password,
            displayName: displayName || null
          }
        })
      );
      showAlert("Tu acceso quedó activo. Ya puedes iniciar sesión.", "success");
      if (form) form.hidden = true;
      setTimeout(() => {
        location.href = "/?activated=1";
      }, 900);
    } catch (err) {
      const code = err?.code || err?.problem?.code || "";
      if (code === "INVITE_REQUIRES_LOGIN") {
        AppFeedback.warning("Ya existe una cuenta con este correo. Inicia sesión para aceptar.", {
          title: "Cuenta existente"
        });
        location.href = `/?acceptInvite=1&token=${encodeURIComponent(token)}`;
        return;
      }
      AppFeedback.fromError(err, "No pudimos activar tu cuenta. Verifica los datos e inténtalo de nuevo.");
      AppFeedback.banner.page(err?.message || "No pudimos activar tu cuenta.", "error");
    }
  });
}
