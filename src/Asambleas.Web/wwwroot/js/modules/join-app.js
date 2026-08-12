import { api } from "./api.js";
import { me } from "./auth.js";
import { escapeHtml, formatDateTime, qs } from "./ui.js";

const params = new URLSearchParams(location.search);
const token = params.get("token") || "";

function statusEs(status) {
  const map = {
    Draft: "Borrador",
    Scheduled: "Programada",
    CheckIn: "Acreditación abierta",
    InProgress: "En curso",
    Paused: "En pausa",
    Completed: "Finalizada",
    Cancelled: "Cancelada"
  };
  return map[status] || status || "—";
}

async function init() {
  const title = qs("#join-title");
  const body = qs("#join-body");
  const actions = qs("#join-actions");
  const alert = qs("#join-alert");

  if (!token) {
    title.textContent = "Enlace no válido";
    body.textContent = "Falta el token de acceso a la asamblea.";
    return;
  }

  let preview;
  try {
    preview = await api(`/api/join/preview?token=${encodeURIComponent(token)}`);
  } catch (e) {
    title.textContent = "No pudimos validar el enlace";
    body.textContent = e.message || "Error de red.";
    return;
  }

  if (!preview.valid) {
    title.textContent = "Enlace no disponible";
    body.textContent =
      preview.reason === "INVALID_OR_EXPIRED"
        ? "Este enlace expiró o fue revocado. Solicita un reenvío de la convocatoria."
        : "No pudimos validar este acceso.";
    return;
  }

  title.textContent = preview.assemblyTitle || "Asamblea";
  body.innerHTML = `
    <strong>${escapeHtml(preview.propertyHorizontalName || "")}</strong><br />
    Estado: ${escapeHtml(statusEs(preview.status))}<br />
    ${preview.scheduledAtUtc ? `Fecha: ${escapeHtml(formatDateTime(preview.scheduledAtUtc))}` : ""}
  `;

  let loggedIn = false;
  try {
    await me();
    loggedIn = true;
  } catch {
    loggedIn = false;
  }

  actions.hidden = false;
  if (!loggedIn) {
    const returnUrl = `/join.html?token=${encodeURIComponent(token)}`;
    actions.innerHTML = `
      <a class="btn btn-primary" href="/?returnUrl=${encodeURIComponent(returnUrl)}">Iniciar sesión para continuar</a>
      <a class="btn btn-secondary" href="/activate.html">Activar acceso</a>`;
    alert.hidden = false;
    alert.textContent = "Debes iniciar sesión o activar tu acceso. Luego volverás a esta asamblea.";
    return;
  }

  const target = preview.redirectPath || `/owner.html?assemblyId=${preview.assemblyId}`;
  actions.innerHTML = `<a class="btn btn-primary" href="${escapeHtml(target)}">Continuar a la asamblea</a>`;
  // Soft auto-redirect for authenticated owners
  setTimeout(() => {
    location.assign(target);
  }, 600);
}

init().catch((e) => {
  qs("#join-title").textContent = "Error";
  qs("#join-body").textContent = e.message || String(e);
});
