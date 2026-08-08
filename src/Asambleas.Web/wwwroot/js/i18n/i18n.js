const STORAGE_KEY = "asambleas.locale";
const DEFAULT_LOCALE = "es-PA";

let catalog = null;
let locale = DEFAULT_LOCALE;

function resolveLocale(requested) {
  if (!requested) {
    return localStorage.getItem(STORAGE_KEY) || DEFAULT_LOCALE;
  }
  return requested;
}

export async function initI18n(requested) {
  locale = resolveLocale(requested);
  try {
    if (locale.startsWith("en")) {
      catalog = (await import("./en.js")).default;
      locale = "en";
    } else {
      catalog = (await import("./es-PA.js")).default;
      locale = "es-PA";
    }
  } catch {
    catalog = (await import("./es-PA.js")).default;
    locale = "es-PA";
  }
  localStorage.setItem(STORAGE_KEY, locale);
  document.documentElement.lang = locale === "en" ? "en" : "es-PA";
  return catalog;
}

export function getLocale() {
  return locale;
}

export function t(path, vars = {}) {
  if (!catalog) {
    return path;
  }

  const value = path.split(".").reduce((acc, key) => (acc == null ? undefined : acc[key]), catalog);
  let text = typeof value === "string" ? value : path;

  for (const [key, replacement] of Object.entries(vars)) {
    text = text.replaceAll(`{${key}}`, String(replacement));
  }

  return text;
}

export function statusLabel(status) {
  if (!status) {
    return "—";
  }
  return t(`status.${status}`) !== `status.${status}` ? t(`status.${status}`) : status;
}
