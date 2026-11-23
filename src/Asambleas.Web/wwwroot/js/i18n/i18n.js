import { assemblyLabel } from "../modules/assembly-labels.js";

const STORAGE_KEY = "asambleas.locale";
const DEFAULT_LOCALE = "es-PA";

const shared = (globalThis.__asambleasI18nState ||= {
  catalog: null,
  locale: DEFAULT_LOCALE
});

function resolveLocale(requested) {
  if (!requested) {
    return localStorage.getItem(STORAGE_KEY) || DEFAULT_LOCALE;
  }
  return requested;
}

export async function initI18n(requested) {
  shared.locale = resolveLocale(requested);
  try {
    if (shared.locale.startsWith("en")) {
      shared.catalog = (await import("./en.js?v=open-desk1")).default;
      shared.locale = "en";
    } else {
      shared.catalog = (await import("./es-PA.js?v=flow14")).default;
      shared.locale = "es-PA";
    }
  } catch {
    shared.catalog = (await import("./es-PA.js?v=flow14")).default;
    shared.locale = "es-PA";
  }
  localStorage.setItem(STORAGE_KEY, shared.locale);
  document.documentElement.lang = shared.locale === "en" ? "en" : "es-PA";
  return shared.catalog;
}

export function getLocale() {
  return shared.locale;
}

export function t(path, vars = {}) {
  if (!shared.catalog) {
    return "";
  }

  const value = path.split(".").reduce((acc, key) => (acc == null ? undefined : acc[key]), shared.catalog);
  if (typeof value !== "string") return "";
  let text = value;

  for (const [key, replacement] of Object.entries(vars)) {
    text = text.replaceAll(`{${key}}`, String(replacement));
  }

  return text;
}

export function statusLabel(status) {
  if (!status) {
    return "—";
  }
  return t(`status.${status}`) || assemblyLabel(status);
}
