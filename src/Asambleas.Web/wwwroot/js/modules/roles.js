import { hasPermission } from "./auth.js";

const OPERATOR_ROLES = new Set([
  "AssemblyPresident",
  "AssemblySecretary",
  "AssemblyOperator",
  "PHAdmin",
  "Moderator",
  "TenantAdmin",
  "PlatformAdmin"
]);

/**
 * Resolve viewer role for layout. Prefer API viewerRole; else derive from roles/permissions.
 * @returns {"Operator"|"Owner"}
 */
export function resolveViewerRole(user, roomState = null) {
  const fromApi = roomState?.viewerRole || roomState?.viewer?.role;
  if (fromApi === "Operator" || fromApi === "Owner") {
    return fromApi;
  }

  const roles = user?.roles || [];
  if (roles.some((r) => OPERATOR_ROLES.has(r))) {
    return "Operator";
  }

  if (
    hasPermission(user, "assembly:start") ||
    hasPermission(user, "meeting:moderate") ||
    hasPermission(user, "vote:open")
  ) {
    return "Operator";
  }

  return "Owner";
}

export function isOperator(user, roomState = null) {
  return resolveViewerRole(user, roomState) === "Operator";
}

/**
 * Pure owner participant (portal:self / vote:cast) without PH or assembly administration.
 * These users must never see the administrative shell (Panel, Comunicaciones, Nueva asamblea, …).
 */
export function isOwnerPortalUser(user) {
  if (!user) return false;
  if (isOperator(user) || hasPermission(user, "ph:manage") || hasPermission(user, "assembly:manage")) {
    return false;
  }
  if (hasPermission(user, "assembly:schedule") || hasPermission(user, "assembly:reschedule")) {
    return false;
  }
  return hasPermission(user, "portal:self") || hasPermission(user, "vote:cast");
}
