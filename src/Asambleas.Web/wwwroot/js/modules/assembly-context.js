/** Resolve a default assembly for navigation when URL omits assemblyId. */
import { api } from "./api.js";

const ACTIVE = new Set(["CheckIn", "InProgress", "Paused"]);
/**
 * Accept any 8-4-4-4-12 hex GUID.
 * Do NOT require RFC version/variant bits — demo IDs like 4444-…-4444 are valid in ASAMBLEAS.
 */
const ASSEMBLY_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True when value is a usable assembly GUID (rejects placeholders like ID_DE_LA_ASAMBLEA). */
export function isValidAssemblyId(value) {
  if (typeof value !== "string") return false;
  const id = value.trim();
  if (!id) return false;
  return ASSEMBLY_ID_RE.test(id);
}

export async function resolveDefaultAssemblyId() {
  try {
    const next = await api("/api/calendar/next");
    const id = next?.next?.assemblyId || next?.assemblyId;
    if (isValidAssemblyId(id)) return String(id).trim();
  } catch {
    /* fall through */
  }

  try {
    const list = await api("/api/assemblies");
    if (!Array.isArray(list) || !list.length) return null;
    const active = list.find((a) => ACTIVE.has(String(a.status || "")));
    if (isValidAssemblyId(active?.id)) return String(active.id).trim();
    const open = list
      .filter((a) => !["Completed", "Cancelled"].includes(String(a.status || "")))
      .sort((a, b) => new Date(a.scheduledAtUtc || 0) - new Date(b.scheduledAtUtc || 0));
    if (isValidAssemblyId(open[0]?.id)) return String(open[0].id).trim();
    const sorted = [...list].sort(
      (a, b) => new Date(b.scheduledAtUtc || 0) - new Date(a.scheduledAtUtc || 0)
    );
    return isValidAssemblyId(sorted[0]?.id) ? String(sorted[0].id).trim() : null;
  } catch {
    return null;
  }
}

/** Put assemblyId in the address bar. Uses hard replace when it was missing. */
export function ensureAssemblyIdInUrl(id, { hard = true } = {}) {
  if (!id || typeof location === "undefined") return false;
  const url = new URL(location.href);
  if (url.searchParams.get("assemblyId") === id) return false;
  url.searchParams.set("assemblyId", id);
  const next = url.pathname + url.search + url.hash;
  if (hard) {
    location.replace(next);
    return true;
  }
  if (typeof history !== "undefined" && history.replaceState) {
    history.replaceState({}, "", next);
  }
  return false;
}

/**
 * If URL lacks a valid assemblyId (missing or placeholder), resolve one and redirect.
 * @returns {Promise<string|null>}
 */
export async function ensureAssemblyIdOrRedirect() {
  const current = new URLSearchParams(location.search).get("assemblyId");
  if (isValidAssemblyId(current)) return current.trim();
  const id = await resolveDefaultAssemblyId();
  if (!id) return null;
  const redirected = ensureAssemblyIdInUrl(id, { hard: true });
  // When already on the resolved id, keep going; otherwise navigation is in flight.
  return redirected ? id : id;
}

export function dashboardHref(assemblyId) {
  return assemblyId
    ? `/dashboard.html?assemblyId=${encodeURIComponent(assemblyId)}`
    : "/dashboard.html";
}
