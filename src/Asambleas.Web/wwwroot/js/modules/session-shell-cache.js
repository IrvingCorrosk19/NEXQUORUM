/**
 * Short-lived shell memory for me/memberships during hybrid soft-nav.
 * Never used as authorization. Invalidates on logout / PH switch / 401.
 */

const MEM = {
  me: null,
  meExpires: 0,
  memberships: null,
  membershipsExpires: 0,
  key: null
};

const TTL_MS = 15000;

function scopeKey(user) {
  return `${user?.tenantId || ""}:${user?.userId || ""}`;
}

const NAV_KEY = "asambleas.shell.nav.v1";

function clearNavSnapshot() {
  try {
    sessionStorage.removeItem(NAV_KEY);
  } catch {
    /* ignore */
  }
}

export function persistNavSnapshot(snap) {
  if (!snap?.navHtml || snap.navHtml.includes("ia-nav-skel")) return;
  try {
    sessionStorage.setItem(
      NAV_KEY,
      JSON.stringify({
        v: 1,
        phId: snap.phId || "",
        navHtml: snap.navHtml,
        displayName: snap.displayName || "",
        roleLabel: snap.roleLabel || "",
        avatar: snap.avatar || ""
      })
    );
  } catch {
    /* ignore quota */
  }
}

export function invalidateShellSessionCache(reason = "manual") {
  MEM.me = null;
  MEM.meExpires = 0;
  MEM.memberships = null;
  MEM.membershipsExpires = 0;
  try {
    sessionStorage.removeItem("asambleas.shell.me.v1");
  } catch {
    /* ignore */
  }
  if (reason === "logout" || reason === "user-mismatch" || reason === "401") {
    clearNavSnapshot();
  }
  void reason;
}

export function rememberMe(user) {
  if (!user) return;
  MEM.me = user;
  MEM.meExpires = Date.now() + TTL_MS;
  MEM.key = scopeKey(user);
}

export function peekMe() {
  if (MEM.me && Date.now() < MEM.meExpires) return MEM.me;
  return null;
}

export function rememberMemberships(list, user) {
  MEM.memberships = Array.isArray(list) ? list : [];
  MEM.membershipsExpires = Date.now() + TTL_MS;
  if (user) MEM.key = scopeKey(user);
}

export function peekMemberships(user) {
  if (user && MEM.key && MEM.key !== scopeKey(user)) {
    invalidateShellSessionCache("user-mismatch");
    return null;
  }
  if (MEM.memberships && Date.now() < MEM.membershipsExpires) return MEM.memberships;
  return null;
}