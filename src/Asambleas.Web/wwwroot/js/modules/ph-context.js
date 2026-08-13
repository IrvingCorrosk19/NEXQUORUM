/**
 * Single source of truth for active Property Horizontal (PH) context.
 * sessionStorage key asambleas.ia.context remains the sticky mirror;
 * this module owns versioning, switch orchestration, and guards.
 */
import { api } from "./api.js";
import { me } from "./auth.js";
import { confirmDialog, notify } from "./ui.js";
import { readIaContext, writeIaContext } from "./ia-context.js";
import { startTopProgress, stopTopProgress } from "./loading.js";

const RECENT_KEY = "asambleas.ph.recent";
const MAX_RECENT = 6;

/** @type {{
 *   phId: string|null,
 *   phName: string|null,
 *   roleHint: string|null,
 *   version: number,
 *   switching: boolean,
 *   memberships: Array<{propertyHorizontalId:string,name:string,code?:string,roleHint?:string,isCurrent?:boolean}>,
 *   user: object|null
 * }} */
let state = {
  phId: null,
  phName: null,
  roleHint: null,
  version: 0,
  switching: false,
  memberships: [],
  user: null
};

/** @type {Set<Function>} */
const listeners = new Set();

/** @type {null | (() => boolean | {dirty:boolean, message?:string})} */
let dirtyGuard = null;

/** @type {null | { assemblyId: string, status?: string, leave?: () => Promise<void> }} */
let liveGuard = null;

/** @type {AbortController|null} */
let switchAbort = null;

function emit() {
  const snap = getCurrentPh();
  for (const fn of listeners) {
    try {
      fn(snap);
    } catch {
      /* ignore listener errors */
    }
  }
  try {
    window.dispatchEvent(new CustomEvent("asambleas:phcontextchanged", { detail: snap }));
  } catch {
    /* ignore */
  }
}

export function getCurrentPh() {
  return {
    phId: state.phId,
    phName: state.phName,
    roleHint: state.roleHint,
    version: state.version,
    switching: state.switching,
    memberships: state.memberships.slice(),
    user: state.user
  };
}

export function getContextVersion() {
  return state.version;
}

/** True if a response still belongs to the active context. */
export function isCurrentVersion(version) {
  return Number(version) === state.version && !state.switching;
}

export function subscribePhContext(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function setDirtyGuard(fn) {
  dirtyGuard = typeof fn === "function" ? fn : null;
}

export function clearDirtyGuard() {
  dirtyGuard = null;
}

export function setLiveSessionGuard(guard) {
  liveGuard = guard || null;
}

export function clearLiveSessionGuard() {
  liveGuard = null;
}

function readRecent() {
  try {
    const raw = sessionStorage.getItem(RECENT_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function pushRecent(phId, phName) {
  if (!phId) return;
  const next = [{ phId: String(phId), phName: phName || "" }, ...readRecent().filter((r) => String(r.phId) !== String(phId))];
  sessionStorage.setItem(RECENT_KEY, JSON.stringify(next.slice(0, MAX_RECENT)));
}

export function getRecentPhs() {
  return readRecent();
}

export function hydratePhContext({
  phId = null,
  phName = null,
  roleHint = null,
  user = null,
  memberships = null,
  bump = false
} = {}) {
  if (user) state.user = user;
  if (memberships) state.memberships = memberships;
  if (phId != null) state.phId = phId ? String(phId) : null;
  if (phName != null) state.phName = phName;
  if (roleHint != null) state.roleHint = roleHint;
  if (bump) state.version += 1;
  writeIaContext({
    phId: state.phId,
    phName: state.phName,
    ...(state.phId ? {} : { assemblyId: null })
  });
  emit();
  return getCurrentPh();
}

export async function loadMyMemberships() {
  const memberships = await api("/api/ph/memberships/mine");
  let list = Array.isArray(memberships) ? memberships : [];

  // Tenant/PH managers may administer PHs beyond explicit membership rows.
  const canManageAll = Boolean(state.user?.permissions?.includes("ph:manage"));
  if (canManageAll) {
    try {
      const all = await api("/api/ph");
      const byId = new Map(list.map((m) => [String(m.propertyHorizontalId), m]));
      for (const p of all || []) {
        const id = String(p.id);
        if (!byId.has(id)) {
          byId.set(id, {
            propertyHorizontalId: p.id,
            code: p.code,
            name: p.name,
            roleHint: "PHAdmin",
            isCurrent: String(state.phId) === id
          });
        }
      }
      list = [...byId.values()].sort((a, b) => String(a.name).localeCompare(String(b.name), "es"));
    } catch {
      /* keep memberships only */
    }
  }

  state.memberships = list;
  const current =
    state.memberships.find((m) => m.isCurrent) ||
    state.memberships.find((m) => String(m.propertyHorizontalId) === String(state.phId));
  if (current) {
    if (!state.phId) state.phId = String(current.propertyHorizontalId);
    if (!state.phName) state.phName = current.name || null;
    state.roleHint = current.roleHint || state.roleHint;
  }
  emit();
  return state.memberships;
}

/**
 * Map current route → equivalent route on the target PH.
 * Assembly-scoped views never keep the old assemblyId.
 */
export function resolvePhSwitchTarget(newPhId, {
  pathname = location.pathname,
  search = location.search,
  hash = location.hash
} = {}) {
  const id = encodeURIComponent(newPhId);
  const path = (pathname || "").toLowerCase();
  const params = new URLSearchParams(search || "");
  const hasAssembly = Boolean(params.get("assemblyId"));

  const assemblyPages = [
    "/dashboard.html",
    "/lobby.html",
    "/assembly.html",
    "/checkin.html",
    "/agenda.html",
    "/voting-studio.html",
    "/convocation.html",
    "/minutes.html",
    "/evidence.html",
    "/expediente.html",
    "/room.html"
  ];

  if (hasAssembly || assemblyPages.some((p) => path.endsWith(p) || path.includes(p))) {
    return `/ph.html?phId=${id}#assemblies`;
  }

  if (path.endsWith("/ph.html") || path.endsWith("ph.html")) {
    const h = hash && hash !== "#" ? hash : "#resumen";
    return `/ph.html?phId=${id}${h}`;
  }

  if (path.includes("communications.html")) {
    return `/communications.html?phId=${id}`;
  }

  if (path.includes("calendar.html")) {
    return `/calendar.html?phId=${id}`;
  }

  if (path.includes("assemblies-history.html")) {
    return `/assemblies-history.html?phId=${id}`;
  }

  return `/ph.html?phId=${id}#resumen`;
}

function initials(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "PH";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function phInitials(name) {
  return initials(name);
}

async function runGuards(targetName) {
  if (liveGuard?.assemblyId) {
    const status = String(liveGuard.status || "");
    const isLive = ["InProgress", "Paused", "CheckIn"].includes(status);
    if (isLive) {
      const ok = await confirmDialog({
        title: "Cambiar de PH",
        body: `Estás participando en una asamblea en curso.\n\nAl cambiar a ${targetName || "otra propiedad"} saldrás de esta sala.`,
        confirmLabel: "Cambiar de PH",
        cancelLabel: "Continuar en la asamblea",
        danger: true
      });
      if (!ok) return false;
      try {
        await liveGuard.leave?.();
      } catch {
        /* best effort */
      }
      liveGuard = null;
    } else {
      try {
        await liveGuard.leave?.();
      } catch {
        /* ignore */
      }
      liveGuard = null;
    }
  }

  if (dirtyGuard) {
    const result = dirtyGuard();
    const dirty = typeof result === "object" ? Boolean(result?.dirty) : Boolean(result);
    if (dirty) {
      const ok = await confirmDialog({
        title: "Tienes cambios sin guardar",
        body:
          (typeof result === "object" && result?.message) ||
          "Si cambias de PH, estos cambios se perderán.",
        confirmLabel: "Descartar y cambiar",
        cancelLabel: "Seguir editando",
        danger: true
      });
      if (!ok) return false;
      dirtyGuard = null;
    }
  }

  return true;
}

/**
 * Atomic PH switch: validate → leave old → switch claim → clear assembly → navigate.
 */
export async function switchPh(propertyHorizontalId, { targetUrl = null, silent = false } = {}) {
  const nextId = String(propertyHorizontalId || "");
  if (!nextId) return { ok: false, reason: "missing" };
  if (state.switching) return { ok: false, reason: "busy" };
  if (String(state.phId) === nextId && !location.search.includes("assemblyId=")) {
    return { ok: true, reason: "same" };
  }

  const membership =
    state.memberships.find((m) => String(m.propertyHorizontalId) === nextId) || null;
  const nextName = membership?.name || "propiedad seleccionada";

  const allowed = await runGuards(nextName);
  if (!allowed) return { ok: false, reason: "cancelled" };

  const previous = { ...state, memberships: state.memberships.slice() };
  state.switching = true;
  emit();
  startTopProgress();

  if (switchAbort) switchAbort.abort();
  switchAbort = new AbortController();
  const versionAtStart = state.version;

  try {
    document.body.classList.add("is-ph-switching");
    document.querySelector("main.app-workspace")?.setAttribute("aria-busy", "true");

    await api("/api/ph/switch", {
      method: "POST",
      body: { propertyHorizontalId: nextId },
      signal: switchAbort.signal
    });

    // Refresh auth session (claim + permissions mirror).
    const user = await me();
    const memberships = await api("/api/ph/memberships/mine");
    const list = Array.isArray(memberships) ? memberships : [];
    const current = list.find((m) => String(m.propertyHorizontalId) === nextId) || membership;

    state.user = user;
    state.memberships = list;
    state.phId = nextId;
    state.phName = current?.name || nextName;
    state.roleHint = current?.roleHint || null;
    state.version = versionAtStart + 1;
    state.switching = false;

    // Clear assembly-scoped sticky IDs — never reuse Ocean assembly under Madison.
    writeIaContext({
      phId: state.phId,
      phName: state.phName,
      assemblyId: null,
      assemblyTitle: null,
      assemblyStatus: null
    });
    pushRecent(state.phId, state.phName);
    emit();

    const dest = targetUrl || resolvePhSwitchTarget(nextId);
    if (!silent) {
      notify.success(state.phName, { title: "PH activo", ttlMs: 2800 });
    }

    // Soft path: same ph.html document — replace URL and let page handler react.
    const destUrl = new URL(dest, location.origin);
    const samePhPage =
      location.pathname.toLowerCase().endsWith("/ph.html") &&
      destUrl.pathname.toLowerCase().endsWith("/ph.html");

    if (samePhPage && typeof window.__asambleasOpenPh === "function") {
      history.replaceState(null, "", destUrl.pathname + destUrl.search + destUrl.hash);
      document.body.classList.remove("is-ph-switching");
      document.querySelector("main.app-workspace")?.removeAttribute("aria-busy");
      stopTopProgress();
      await window.__asambleasOpenPh(nextId);
      return { ok: true, navigated: false, phId: nextId };
    }

    location.assign(destUrl.pathname + destUrl.search + destUrl.hash);
    return { ok: true, navigated: true, phId: nextId };
  } catch (err) {
    // Rollback to previous PH context — do not leave a mixed UI.
    state.phId = previous.phId;
    state.phName = previous.phName;
    state.roleHint = previous.roleHint;
    state.memberships = previous.memberships;
    state.user = previous.user;
    state.version = previous.version;
    state.switching = false;
    writeIaContext({
      phId: state.phId,
      phName: state.phName
    });
    emit();
    document.body.classList.remove("is-ph-switching");
    document.querySelector("main.app-workspace")?.removeAttribute("aria-busy");
    notify.error(err?.message || "No pudimos cambiar de PH. Tu contexto actual se mantiene.", {
      title: "Cambio de PH fallido",
      correlationId: err?.correlationId,
      actionLabel: "Reintentar",
      onAction: () => switchPh(nextId, { targetUrl, silent }),
      ttlMs: 14000
    });
    return { ok: false, reason: "error", error: err };
  } finally {
    stopTopProgress();
  }
}

/**
 * Ensure claim matches deep-link / stored PH when authorized.
 */
export async function ensureActivePhClaim(phId) {
  if (!phId) return;
  if (String(state.user?.propertyHorizontalId || "") === String(phId)) return;
  const allowed = state.memberships.some((m) => String(m.propertyHorizontalId) === String(phId));
  if (!allowed && state.memberships.length) {
    // Still try switch — backend will DENY if unauthorized.
  }
  try {
    await api("/api/ph/switch", {
      method: "POST",
      body: { propertyHorizontalId: phId }
    });
    state.user = await me();
  } catch (err) {
    if (err?.status === 403 || err?.status === 404) {
      notify.error("No tienes acceso a esta propiedad.", { title: "PH no autorizado" });
      throw err;
    }
  }
}
