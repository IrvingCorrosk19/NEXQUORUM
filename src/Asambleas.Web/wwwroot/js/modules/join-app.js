import { api } from "./api.js";
import { qs } from "./ui.js";

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
    // Keep a clean path without the secret; reason query from cancelled redirects is fine.
    const reason = new URLSearchParams(location.search).get("reason");
    history.replaceState({}, "", reason ? `/join.html?reason=${encodeURIComponent(reason)}` : "/join.html");
  }
}

function showHumanError(titleEl, bodyEl, actions, alert, rawToken, title, message) {
  titleEl.textContent = title;
  bodyEl.textContent = message;
  actions.hidden = false;
  actions.innerHTML = `<button type="button" class="btn btn-primary btn-lg" id="btn-request-link">Solicitar nueva invitación</button>`;
  alert.hidden = false;
  alert.textContent = "Si tu correo está en la convocatoria, el administrador puede enviarte un acceso nuevo.";
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
      alert.textContent =
        res.message || "Si el correo corresponde a una convocatoria activa, enviaremos un nuevo enlace.";
    } catch {
      alert.textContent = "No pudimos completar la solicitud. Contacta a la administración de tu PH.";
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Solicitar nueva invitación";
      }
    }
  });
}

function showExpired(title, body, actions, alert, rawToken) {
  showHumanError(
    title,
    body,
    actions,
    alert,
    rawToken,
    "Este enlace ya no está disponible.",
    "Solicita una nueva invitación al administrador de tu PH."
  );
}

async function redeemAndGo(token, title, body, actions, alert) {
  title.textContent = "Estamos preparando tu entrada a la asamblea…";
  body.textContent = "Un momento. No cierres esta ventana.";
  actions.hidden = true;
  actions.innerHTML = "";
  try {
    // Peek first so email scanners / HEAD previews do not consume the link;
    // redeem is POST-only and creates the session.
    const preview = await api(`/api/join/preview?token=${encodeURIComponent(token)}`);
    if (!preview.valid) {
      if (preview.reason === "CANCELLED" || /cancel/i.test(String(preview.status || ""))) {
        showHumanError(
          title,
          body,
          actions,
          alert,
          token,
          "Esta asamblea fue cancelada.",
          "No es necesario que ingreses."
        );
        return;
      }
      if (preview.reason === "COMPLETED" || preview.status === "Completed") {
        showHumanError(
          title,
          body,
          actions,
          alert,
          token,
          "Esta asamblea ya finalizó.",
          "Si necesitas el acta o los resultados, solicita acceso a la administración de tu PH."
        );
        return;
      }
      showExpired(title, body, actions, alert, token);
      return;
    }

    const claimed = await api("/api/join/redeem", {
      method: "POST",
      body: { token }
    });
    try {
      // UX-only assembly hint. Audit method VerifiedJoinLink requires server proof for this user.
      if (claimed.assemblyId) {
        sessionStorage.setItem(`asambleas.vjl:${claimed.assemblyId}`, "1");
      }
      sessionStorage.removeItem("asambleas.verifiedJoinLink");
      sessionStorage.removeItem("asambleas.verifiedJoinAssemblyId");
    } catch {
      /* ignore */
    }
    const target = claimed.redirectPath || `/assembly.html?assemblyId=${claimed.assemblyId}`;
    title.textContent = "Entrando a la asamblea…";
    body.textContent = "";
    location.replace(target);
  } catch (e) {
    const msg = String(e?.message || "");
    if (/cancel/i.test(msg)) {
      showHumanError(
        title,
        body,
        actions,
        alert,
        token,
        "Esta asamblea fue cancelada.",
        "No es necesario que ingreses."
      );
      return;
    }
    if (/ya no está disponible|INVALID_OR_EXPIRED|expir|finaliz/i.test(msg) || e?.status === 400) {
      showExpired(title, body, actions, alert, token);
      return;
    }
    showExpired(title, body, actions, alert, token);
  }
}

async function init() {
  const title = qs("#join-title");
  const body = qs("#join-body");
  const actions = qs("#join-actions");
  const alert = qs("#join-alert");

  const reason = new URLSearchParams(location.search).get("reason");
  const token = readTokenFromLocation();
  scrubTokenFromUrl();

  if (reason === "cancelled" && !token) {
    showHumanError(
      title,
      body,
      actions,
      alert,
      null,
      "Esta asamblea fue cancelada.",
      "No es necesario que ingreses."
    );
    return;
  }

  if (!token) {
    title.textContent = "Ingreso a la asamblea";
    body.textContent =
      "Abre el botón «Ingresar a la asamblea» desde el correo de convocatoria. Si el enlace venció, solicita uno nuevo.";
    actions.hidden = false;
    actions.innerHTML = `<button type="button" class="btn btn-primary btn-lg" id="btn-request-link">Solicitar nueva invitación</button>`;
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

  await redeemAndGo(token, title, body, actions, alert);
}

init();
