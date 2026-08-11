/** Resolve a default assembly for navigation when URL omits assemblyId. */
import { api } from "./api.js";

const ACTIVE = new Set(["CheckIn", "InProgress", "Paused"]);

export async function resolveDefaultAssemblyId() {
  try {
    const next = await api("/api/calendar/next");
    const id = next?.next?.assemblyId || next?.assemblyId;
    if (id) return String(id);
  } catch {
    /* fall through */
  }

  try {
    const list = await api("/api/assemblies");
    if (!Array.isArray(list) || !list.length) return null;
    const active = list.find((a) => ACTIVE.has(String(a.status || "")));
    if (active?.id) return String(active.id);
    const open = list
      .filter((a) => !["Completed", "Cancelled"].includes(String(a.status || "")))
      .sort((a, b) => new Date(a.scheduledAtUtc || 0) - new Date(b.scheduledAtUtc || 0));
    if (open[0]?.id) return String(open[0].id);
    const sorted = [...list].sort(
      (a, b) => new Date(b.scheduledAtUtc || 0) - new Date(a.scheduledAtUtc || 0)
    );
    return sorted[0]?.id ? String(sorted[0].id) : null;
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

/** If URL lacks assemblyId, resolve one and redirect to the same page with it. */
export async function ensureAssemblyIdOrRedirect() {
  const current = new URLSearchParams(location.search).get("assemblyId");
  if (current) return current;
  const id = await resolveDefaultAssemblyId();
  if (!id) return null;
  ensureAssemblyIdInUrl(id, { hard: true });
  return id;
}

export function dashboardHref(assemblyId) {
  return assemblyId
    ? `/dashboard.html?assemblyId=${encodeURIComponent(assemblyId)}`
    : "/dashboard.html";
}
