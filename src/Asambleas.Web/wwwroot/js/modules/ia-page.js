/**
 * Shared IA page bootstrap for admin/operator shells.
 * Keeps one mental model: Propiedades → PH → Asamblea → módulo.
 */
import { api } from "./api.js";
import { me, logout, hasPermission } from "./auth.js";
import { isOwnerPortalUser } from "./roles.js";
import { mountIaShell } from "./ia-nav.js";

const $ = (sel) => document.querySelector(sel);

/**
 * @param {{
 *   current: string,
 *   level?: "global"|"ph"|"assembly",
 *   requirePermission?: string|null,
 *   ownerRedirect?: string,
 *   breadcrumbs?: {label:string, href?:string}[],
 *   resolveContext?: (user: object) => Promise<{
 *     phId?: string|null,
 *     phName?: string|null,
 *     assemblyId?: string|null,
 *     assemblyTitle?: string|null,
 *     breadcrumbs?: {label:string, href?:string}[]
 *   }>
 * }} opts
 */
export async function bootIaPage(opts) {
  const {
    current,
    level = "global",
    requirePermission = null,
    ownerRedirect = "/owner.html?denied=admin",
    breadcrumbs = [],
    resolveContext = null
  } = opts;

  let user;
  try {
    user = await me();
  } catch {
    location.href = "/";
    return null;
  }

  if (isOwnerPortalUser(user) && !hasPermission(user, "ph:view") && !hasPermission(user, "assembly:view")) {
    location.href = ownerRedirect;
    return null;
  }

  if (requirePermission && !hasPermission(user, requirePermission)) {
    location.href = "/ph.html?denied=permission";
    return null;
  }

  const chip = $("#user-chip");
  if (chip) chip.textContent = user.displayName || user.email || "";
  const tenant = $("#nav-tenant");
  if (tenant) tenant.textContent = user.tenantCode || "Gobernanza";

  $("#btn-logout")?.addEventListener("click", async () => {
    await logout();
    location.href = "/";
  });

  const params = new URLSearchParams(location.search);
  let phId = params.get("phId") || user.propertyHorizontalId || null;
  let assemblyId = params.get("assemblyId") || null;
  let phName = null;
  let assemblyTitle = null;
  let crumbs = breadcrumbs;

  if (resolveContext) {
    const extra = await resolveContext(user);
    phId = extra.phId ?? phId;
    phName = extra.phName ?? phName;
    assemblyId = extra.assemblyId ?? assemblyId;
    assemblyTitle = extra.assemblyTitle ?? assemblyTitle;
    if (extra.breadcrumbs?.length) crumbs = extra.breadcrumbs;
  } else {
    if (assemblyId) {
      try {
        const a = await api(`/api/assemblies/${assemblyId}`);
        assemblyTitle = a.title || a.name || "Asamblea";
        phId = a.propertyHorizontalId || phId;
      } catch {
        /* ignore */
      }
    }
    if (phId && !phName) {
      try {
        const list = await api("/api/ph");
        const row = (list || []).find((p) => String(p.id) === String(phId));
        phName = row?.name || null;
      } catch {
        /* ignore */
      }
    }
    if (!crumbs.length) {
      crumbs = [{ label: "Propiedades", href: "/ph.html" }];
      if (phName && phId) crumbs.push({ label: phName, href: `/ph.html?phId=${encodeURIComponent(phId)}#resumen` });
      if (assemblyTitle) crumbs.push({ label: assemblyTitle });
    }
  }

  const resolvedLevel = assemblyId ? "assembly" : phId ? "ph" : level;

  mountIaShell(
    {
      level: resolvedLevel,
      user,
      phId,
      phName,
      assemblyId,
      assemblyTitle,
      current
    },
    { breadcrumbs: crumbs }
  );

  return { user, phId, phName, assemblyId, assemblyTitle };
}

/** Standard CSS link tags to inject if missing (for pages we only patch lightly). */
export const IA_CSS = [
  "/css/ia.css?v=ia2",
  "/css/ux-remediation.css?v=ux1",
  "/css/ux-ia-reeng.css?v=ia2"
];
