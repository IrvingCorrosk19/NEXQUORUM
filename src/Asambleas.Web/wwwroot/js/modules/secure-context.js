/** Canonical HTTPS origin for the VPS pilot (camera/mic require a secure context). */
const PILOT_HTTPS_ORIGIN = "https://asambleas.164.68.99.83.nip.io";

/**
 * @returns {string|null} HTTPS URL for the same path when current page is not a secure context.
 */
export function mediaHttpsUrl() {
  if (typeof window === "undefined" || window.isSecureContext) return null;

  const path = `${location.pathname}${location.search}${location.hash}`;
  const host = location.hostname;

  if (host === "localhost" || host === "127.0.0.1") {
    return `https://localhost:7188${path}`;
  }

  // http://IP:8092 or http://nip.io → force the HTTPS pilot host
  return `${PILOT_HTTPS_ORIGIN}${path}`;
}

/**
 * Camera/mic only work on HTTPS. Redirect HTTP (e.g. :8092 by IP) to the secure origin.
 * @returns {boolean} true when a redirect was started
 */
export function redirectToHttpsForMedia() {
  const url = mediaHttpsUrl();
  if (!url) return false;
  location.replace(url);
  return true;
}
