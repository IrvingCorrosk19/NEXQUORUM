import { api } from "./api.js";
import { AppFeedback } from "./app-feedback.js";

const params = new URLSearchParams(location.search);
const token = params.get("token");
const metaEl = document.getElementById("reset-meta");
const form = document.getElementById("form-reset");

function wirePasswordToggles(root = document) {
  root.querySelectorAll("[data-toggle-password]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const name = btn.getAttribute("data-toggle-password");
      const input = root.querySelector(`input[name="${name}"]`);
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
}

wirePasswordToggles(form || document);

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
  showAlert("Enlace inválido. Solicita un nuevo restablecimiento desde el inicio de sesión.");
  if (form) form.hidden = true;
} else {
  api(`/api/auth/password-reset/preview?token=${encodeURIComponent(token)}`)
    .then((preview) => {
      if (!preview.isValid || preview.errorCode) {
        showAlert(preview.errorMessage || "Este enlace no es válido.");
        if (form) form.hidden = true;
        return;
      }

      if (metaEl) {
        metaEl.hidden = false;
        metaEl.innerHTML = `
          <h2 style="margin:0 0 .5rem;font-size:1.25rem">Nueva contraseña</h2>
          <p style="margin:0"><strong>${escapeHtml(preview.ownerDisplayName || "")}</strong></p>
          <p style="margin:.25rem 0 0">${escapeHtml(preview.propertyHorizontalName || "")}</p>
          <p style="margin:.25rem 0 0;color:var(--muted,#666)">${escapeHtml(preview.emailMasked || "")}</p>`;
      }
    })
    .catch(() => {
      showAlert("No pudimos validar el enlace. Solicita un nuevo restablecimiento.");
      if (form) form.hidden = true;
    });

  form?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const fd = new FormData(ev.target);
    const password = String(fd.get("password") || "");
    const confirm = String(fd.get("confirmPassword") || "");
    const passwordInput = ev.target.querySelector('[name="password"]');
    const confirmInput = ev.target.querySelector('[name="confirmPassword"]');
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
    const hasUpper = /[A-Z]/.test(password);
    const hasLower = /[a-z]/.test(password);
    const hasDigit = /\d/.test(password);
    const hasSymbol = /[^A-Za-z0-9]/.test(password);
    if (!hasUpper || !hasLower || !hasDigit || !hasSymbol) {
      const msg =
        "La contraseña debe tener al menos 12 caracteres, una mayúscula, una minúscula, un número y un símbolo (ej. ! @ # $).";
      AppFeedback.field.error(passwordInput, msg);
      AppFeedback.warning(msg, { title: "Contraseña débil" });
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
      await AppFeedback.runWithButton(submitBtn, "Guardando…", async () =>
        api("/api/auth/password-reset/complete", {
          method: "POST",
          body: { token, password }
        })
      );
      showAlert("Contraseña actualizada. Ya puedes iniciar sesión.", "success");
      if (form) form.hidden = true;
      setTimeout(() => {
        location.href = "/?reset=1";
      }, 900);
    } catch (err) {
      const code = err?.code || err?.problem?.code || "";
      if (code === "PASSWORD_WEAK") {
        const msg =
          err?.message ||
          "La contraseña debe tener al menos 12 caracteres, una mayúscula, una minúscula, un número y un símbolo (ej. ! @ # $).";
        AppFeedback.field.error(passwordInput, msg);
        AppFeedback.warning(msg, { title: "Contraseña débil" });
        AppFeedback.banner.page(msg, "error");
        passwordInput?.focus();
        return;
      }
      AppFeedback.fromError(err, "No pudimos actualizar la contraseña. Solicita un nuevo enlace si venció.");
      AppFeedback.banner.page(err?.message || "No pudimos actualizar la contraseña.", "error");
    }
  });
}
