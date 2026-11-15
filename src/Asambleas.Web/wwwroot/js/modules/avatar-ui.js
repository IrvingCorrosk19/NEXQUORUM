/**
 * Shared profile-photo paint for Mi perfil and the account menu.
 * Always cache-bust so a replacement is not stuck behind the previous file.
 */

export function avatarCanonicalUrl(url) {
  if (!url) return "";
  const raw = String(url);
  const q = raw.indexOf("?");
  return q >= 0 ? raw.slice(0, q) : raw;
}

export function avatarCacheBust(url) {
  const clean = avatarCanonicalUrl(url);
  if (!clean) return "";
  return `${clean}?v=${Date.now()}`;
}

export function applyAvatarElement(el, { url, label } = {}) {
  if (!el) return;
  const text = initials(label || "PR");
  const src = url ? String(url) : "";
  if (src) {
    el.classList.add("owner-avatar--photo");
    el.style.backgroundImage = `url("${src.replace(/"/g, "%22")}")`;
    el.textContent = "";
  } else {
    el.classList.remove("owner-avatar--photo");
    el.style.backgroundImage = "";
    el.textContent = text;
  }
  el.setAttribute("aria-hidden", "true");
}

function initials(label) {
  const parts = String(label || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  const one = parts[0] || "PR";
  return one.slice(0, 2).toUpperCase();
}
