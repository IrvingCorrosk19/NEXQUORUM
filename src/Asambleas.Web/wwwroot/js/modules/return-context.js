/**
 * Safe return navigation for assembly readiness workflow.
 * Only whitelisted internal destination keys — no open redirects.
 */
export const RETURN_READINESS = "assembly-readiness";

const ALLOWED_RETURN = new Set([RETURN_READINESS]);

/**
 * @param {string} key
 * @param {{ assemblyId: string, phId?: string|null }} ctx
 */
export function resolveDestination(key, { assemblyId, phId = null }) {
  const asm = encodeURIComponent(assemblyId);
  const ph = phId ? encodeURIComponent(phId) : "";
  const ret = encodeURIComponent(RETURN_READINESS);
  const q = `assemblyId=${asm}&returnTo=${ret}`;

  const map = {
    "assembly-overview": `/dashboard.html?assemblyId=${asm}`,
    "assembly-agenda": `/agenda.html?${q}`,
    "assembly-participants": `/checkin.html?${q}`,
    "ph-units": ph ? `/ph.html?phId=${ph}&returnTo=${ret}&assemblyId=${asm}#units` : `/ph.html#units`,
    "assembly-voting": `/voting-studio.html?${q}`,
    "assembly-convocation": `/convocation.html?${q}`,
    "assembly-documents": `/convocation.html?${q}`,
    "ph-comms": ph
      ? `/communications.html?phId=${ph}&assemblyId=${asm}&returnTo=${ret}`
      : `/communications.html?assemblyId=${asm}&returnTo=${ret}`,
    "assembly-lobby": `/lobby.html?${q}`
  };
  return map[key] || map["assembly-overview"];
}

export function buildReadinessReturnUrl(assemblyId, { refresh = true } = {}) {
  const url = new URL(`/dashboard.html`, location.origin);
  url.searchParams.set("assemblyId", assemblyId);
  url.searchParams.set("returnTo", RETURN_READINESS);
  if (refresh) url.searchParams.set("refresh", "1");
  return `${url.pathname}${url.search}`;
}

export function isReadinessReturnContext() {
  const p = new URLSearchParams(location.search);
  return ALLOWED_RETURN.has(p.get("returnTo") || "");
}

export function navigateBackToReadiness(assemblyId) {
  location.href = buildReadinessReturnUrl(assemblyId);
}

export function appendReadinessContext(href, { assemblyId, phId = null }) {
  try {
    const url = new URL(href, location.origin);
    if (assemblyId) url.searchParams.set("assemblyId", assemblyId);
    if (phId) url.searchParams.set("phId", phId);
    url.searchParams.set("returnTo", RETURN_READINESS);
    return `${url.pathname}${url.search}${url.hash || ""}`;
  } catch {
    return href;
  }
}

/** @returns {string|null} */
export function assemblyIdFromReturnContext() {
  return new URLSearchParams(location.search).get("assemblyId");
}
