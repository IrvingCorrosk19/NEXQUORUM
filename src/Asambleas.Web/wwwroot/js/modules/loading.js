const LONG_MS = 8000;
const SHOW_DELAY_MS = 120;

let host = null;
let messageEl = null;
let hintEl = null;
let showTimer = null;
let longTimer = null;
let depth = 0;

function ensureHost() {
  if (host) {
    return host;
  }

  host = document.createElement("div");
  host.className = "asambleas-loader";
  host.setAttribute("role", "status");
  host.setAttribute("aria-live", "polite");
  host.setAttribute("aria-busy", "false");
  host.hidden = true;
  host.innerHTML = `
    <div class="asambleas-loader__panel">
      <p class="asambleas-loader__brand">ASAMBLEAS</p>
      <div class="asambleas-loader__orbit" aria-hidden="true">
        <div class="asambleas-loader__ring"></div>
        <span class="asambleas-loader__node" style="--i:0"></span>
        <span class="asambleas-loader__node" style="--i:1"></span>
        <span class="asambleas-loader__node" style="--i:2"></span>
        <span class="asambleas-loader__node" style="--i:3"></span>
        <span class="asambleas-loader__core"></span>
      </div>
      <p class="asambleas-loader__message" data-loader-message>Preparando tu asamblea…</p>
      <div class="asambleas-loader__bar" aria-hidden="true"><span></span></div>
      <p class="asambleas-loader__hint" data-loader-hint>Seguridad · Quórum · Decisiones</p>
    </div>`;
  document.body.appendChild(host);
  messageEl = host.querySelector("[data-loader-message]");
  hintEl = host.querySelector("[data-loader-hint]");
  return host;
}

function clearTimers() {
  if (showTimer) {
    clearTimeout(showTimer);
    showTimer = null;
  }
  if (longTimer) {
    clearTimeout(longTimer);
    longTimer = null;
  }
}

export function showGlobalLoader(message = "Preparando tu asamblea…", options = {}) {
  ensureHost();
  depth += 1;
  messageEl.textContent = message;
  hintEl.textContent = options.hint || "Seguridad · Quórum · Decisiones";
  host.setAttribute("aria-busy", "true");

  const delay = options.immediate ? 0 : SHOW_DELAY_MS;
  clearTimers();
  showTimer = setTimeout(() => {
    host.hidden = false;
    host.classList.add("is-visible");
  }, delay);

  longTimer = setTimeout(() => {
    if (depth > 0 && hintEl) {
      hintEl.textContent = "Esto está tomando más tiempo de lo habitual. Seguimos intentando…";
    }
  }, options.longMs || LONG_MS);

  return () => hideGlobalLoader();
}

export function hideGlobalLoader() {
  depth = Math.max(0, depth - 1);
  if (depth > 0) {
    return;
  }

  clearTimers();
  if (!host) {
    return;
  }

  host.classList.remove("is-visible");
  host.setAttribute("aria-busy", "false");
  setTimeout(() => {
    if (depth === 0 && host) {
      host.hidden = true;
    }
  }, 280);
}

export function setButtonLoading(button, loading, loadingLabel) {
  if (!button) {
    return;
  }

  if (loading) {
    if (!button.dataset.labelBackup) {
      button.dataset.labelBackup = button.textContent || "";
    }
    button.classList.add("is-loading");
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    if (loadingLabel) {
      button.setAttribute("aria-label", loadingLabel);
    }
  } else {
    button.classList.remove("is-loading");
    button.disabled = false;
    button.removeAttribute("aria-busy");
    if (button.dataset.labelBackup) {
      button.textContent = button.dataset.labelBackup;
      delete button.dataset.labelBackup;
    }
    button.removeAttribute("aria-label");
  }
}

/** Strip any credential-shaped query params from the address bar without reading values into app state. */
export function scrubCredentialQueryFromLocation() {
  try {
    const url = new URL(window.location.href);
    const keys = [...url.searchParams.keys()];
    let dirty = false;
    for (const key of keys) {
      const k = key.toLowerCase();
      if (k.includes("password") || k.includes("passwd") || k === "pwd" || k.includes("secret")) {
        url.searchParams.delete(key);
        dirty = true;
      }
    }
    if (dirty) {
      const clean = url.pathname + (url.searchParams.toString() ? `?${url.searchParams}` : "") + url.hash;
      history.replaceState(null, "", clean);
    }
  } catch {
    // ignore
  }
}
