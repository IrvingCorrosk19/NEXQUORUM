import { hasPermission } from "./auth.js";

const OPERATOR_ROLES = new Set([
  "AssemblyPresident",
  "AssemblySecretary",
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
