import { api } from "./api.js";
import { escapeHtml, formatDateTime, qs } from "./ui.js";

function readTokenFromLocation() {
  const params = new URLSearchParams(location.search);
  let token = params.get("token") || "";

  const hash = location.hash.startsWith("#") ? location.hash.slice(1) : location.hash;
  if (hash) {
    const hp = new URLSearchParams(hash.includes("=") ? hash : `token=${hash}`);
    token = hp.get("token") || hp.get("t") || token;
  }

  const pathMatch = location.pathname.match(/^\/ingresar\/([^/]+)/i);
  if (pathMatch) {
    try {
      token = decodeURIComponent(pathMatch[1]);
    } catch {
      token = pathMatch[1];
    }
  }

  return (token || "").trim();
}

function scrubTokenFromUrl() {
  if (location.hash || /[?&]token=/.test(location.search) || /^\/ingresar\//i.test(location.pathname)) {
    history.replaceState({}, "", "/join.html");
  }
}

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

function showExpired(title, body, actions, alert, rawToken) {
  title.textContent = "Enlace no disponible";
  body.textContent = "Este enlace ya no está disponible. Solicita uno nuevo para ingresar.";
  actions.hidden = false;
  actions.innerHTML = `<button type="button" class="btn btn-primary" id="btn-request-link">Solicitar nuevo enlace</button>`;
  alert.hidden = false;
  alert.textContent = "Te enviaremos un acceso nuevo si tu correo está en la convocatoria.";
  qs("#btn-request-link")?.addEventListener("click", async () => {
    const btn = qs("#btn-request-link");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Enviando…";
    }
    try {
      const res = await api("/api/join/request-resend", {
        method: "POST",
        body: { token: rawToken || null, email: null }
      });
      alert.textContent = res.message || "Si el correo corresponde a una convocatoria activa, enviaremos un nuevo enlace.";
    } catch {
      alert.textContent = "No pudimos completar la solicitud. Intenta más tarde o contacta a la administración.";
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Solicitar nuevo enlace";
      }
    }
  });
}

async function redeemAndGo(token, actions, alert) {
  actions.hidden = false;
  actions.innerHTML = `<p class="muted" id="join-progress">Validando tu acceso…</p>`;
  try {
    const claimed = await api("/api/join/redeem", {
      method: "POST",
      body: { token }
    });
    const target = claimed.redirectPath || `/lobby.html?assemblyId=${claimed.assemblyId}`;
    actions.innerHTML = `<p class="muted">Entrando a la asamblea…</p>`;
    location.replace(target);
  } catch (e) {
    const msg = String(e?.message || "");
    if (/ya no está disponible|INVALID_OR_EXPIRED|expir/i.test(msg) || e?.status === 400) {
      showExpired(qs("#join-title"), qs("#join-body"), actions, alert, token);
      return;
    }
    alert.hidden = false;
    alert.textContent = "No pudimos completar el ingreso. Solicita un nuevo enlace.";
    showExpired(qs("#join-title"), qs("#join-body"), actions, alert, token);
  }
}

async function init() {
  const title = qs("#join-title");
  const body = qs("#join-body");
  const actions = qs("#join-actions");
  const alert = qs("#join-alert");

  const token = readTokenFromLocation();
  scrubTokenFromUrl();

  if (!token) {
    title.textContent = "Ingreso a la asamblea";
    body.textContent =
      "Abre el botón «Ingresar a la asamblea» desde el correo de convocatoria. Si el enlace venció, solicita uno nuevo.";
    actions.hidden = false;
    actions.innerHTML = `<button type="button" class="btn btn-primary" id="btn-request-link">Solicitar nuevo enlace</button>`;
    qs("#btn-request-link")?.addEventListener("click", () => {
      const email = window.prompt("Escribe el correo donde recibiste la convocatoria:");
      if (!email) return;
      api("/api/join/request-resend", { method: "POST", body: { email } })
        .then((res) => {
          alert.hidden = false;
          alert.textContent = res.message || "Revisa tu correo.";
        })
        .catch(() => {
          alert.hidden = false;
          alert.textContent = "No pudimos completar la solicitud. Intenta más tarde.";
        });
    });
    return;
  }

  let preview;
  try {
    preview = await api(`/api/join/preview?token=${encodeURIComponent(token)}`);
  } catch {
    showExpired(title, body, actions, alert, token);
    return;
  }

  if (!preview.valid) {
    showExpired(title, body, actions, alert, token);
    return;
  }

  title.textContent = preview.assemblyTitle || "Asamblea";
  body.innerHTML = `
    <strong>${escapeHtml(preview.propertyHorizontalName || "")}</strong><br />
    Estado: ${escapeHtml(statusEs(preview.status))}<br />
    ${preview.scheduledAtUtc ? `Fecha: ${escapeHtml(formatDateTime(preview.scheduledAtUtc))}` : ""}
    <p class="muted" style="margin-top:0.75rem">Entrarás automáticamente sin contraseña.</p>
  `;

  await redeemAndGo(token, actions, alert);
}

init();
