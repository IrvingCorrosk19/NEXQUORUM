import { api } from "./api.js";
import {
  invalidateShellSessionCache,
  peekMe,
  rememberMe
} from "./session-shell-cache.js";

const STORAGE_KEY = "asambleas.session";
let meInflight = null;

export async function login(email, password) {
  const user = await api("/api/auth/login", {
    method: "POST",
    body: { email, password }
  });
  // Persist identity metadata only — never the password.
  rememberMe(user);
  sessionStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      userId: user.userId,
      displayName: user.displayName,
      email: user.email,
      tenantId: user.tenantId,
      tenantCode: user.tenantCode,
      propertyHorizontalId: user.propertyHorizontalId,
      roles: user.roles,
      permissions: user.permissions
    })
  );
  return user;
}

export async function logout() {
  try {
    await api("/api/auth/logout", { method: "POST" });
  } finally {
    sessionStorage.removeItem(STORAGE_KEY);
    invalidateShellSessionCache("logout");
    meInflight = null;
    try {
      window.dispatchEvent(new CustomEvent("asam:logout"));
    } catch {
      /* ignore */
    }
  }
}

/**
 * @param {{ force?: boolean }} [opts]
 */
export async function me(opts = {}) {
  if (!opts.force) {
    const warm = peekMe();
    if (warm) return warm;
    if (meInflight) return meInflight;
  }

  meInflight = api("/api/auth/me")
    .then((user) => {
      rememberMe(user);
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          userId: user.userId,
          displayName: user.displayName,
          email: user.email,
          tenantId: user.tenantId,
          tenantCode: user.tenantCode,
          propertyHorizontalId: user.propertyHorizontalId,
          roles: user.roles,
          permissions: user.permissions
        })
      );
      return user;
    })
    .catch((err) => {
      if (err?.status === 401 || err?.status === 403) {
        invalidateShellSessionCache("auth-error");
        sessionStorage.removeItem(STORAGE_KEY);
      }
      throw err;
    })
    .finally(() => {
      meInflight = null;
    });

  return meInflight;
}

export function cachedUser() {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function hasPermission(user, permission) {
  return Boolean(user?.permissions?.includes(permission));
}

const PH_ADMIN_HINTS = new Set(["PHAdmin", "TenantAdmin", "PlatformAdmin", "AssemblyPresident"]);

/** True when the user may configure communications for this PH (global claim or PH membership). */
export async function canConfigurePhComms(user, phId) {
  if (hasPermission(user, "communications:configure")) {
    return true;
  }
  if (user?.roles?.some((r) => PH_ADMIN_HINTS.has(r))) {
    return true;
  }
  if (hasPermission(user, "ph:manage")) {
    return true;
  }
  if (!phId) {
    return false;
  }
  try {
    const memberships = await api("/api/ph/memberships/mine");
    return memberships.some(
      (m) =>
        String(m.propertyHorizontalId).toLowerCase() === String(phId).toLowerCase()
        && PH_ADMIN_HINTS.has(m.roleHint)
    );
  } catch {
    return false;
  }
}
