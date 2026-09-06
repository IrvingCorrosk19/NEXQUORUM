import { startTopProgress, stopTopProgress } from "./loading.js";

let antiforgeryToken = null;
const inflightControllers = new Map();

export async function ensureAntiforgery() {
  if (antiforgeryToken) {
    return antiforgeryToken;
  }

  const response = await fetch("/api/auth/antiforgery", {
    credentials: "same-origin"
  });

  if (!response.ok) {
    throw new Error("No pudimos preparar la sesión segura. Recarga la página e inténtalo de nuevo.");
  }

  const data = await response.json();
  antiforgeryToken = data.requestToken;
  return antiforgeryToken;
}

/**
 * @param {string} path
 * @param {RequestInit & {
 *   body?: unknown,
 *   progress?: boolean,
 *   signal?: AbortSignal,
 *   dedupeKey?: string
 * }} [options]
 */
export async function api(path, options = {}) {
  const method = (options.method || "GET").toUpperCase();
  const headers = new Headers(options.headers || {});
  const useProgress = options.progress ?? ["POST", "PUT", "PATCH", "DELETE"].includes(method);

  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }

  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    const token = await ensureAntiforgery();
    headers.set("RequestVerificationToken", token);
  }

  let signal = options.signal;
  if (options.dedupeKey) {
    const prev = inflightControllers.get(options.dedupeKey);
    prev?.abort();
    const controller = new AbortController();
    inflightControllers.set(options.dedupeKey, controller);
    signal = controller.signal;
  }

  if (useProgress) startTopProgress();
  try {
    const response = await fetch(path, {
      ...options,
      method,
      headers,
      credentials: "same-origin",
      signal,
      body:
        options.body && typeof options.body !== "string"
          ? JSON.stringify(options.body)
          : options.body
    });

    if (response.status === 204) {
      return null;
    }

    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json")
      ? await response.json()
      : await response.text();

    if (!response.ok) {
      let detail =
        typeof payload === "object" && payload
          ? payload.detail || payload.title || JSON.stringify(payload)
          : String(payload || "");
      if (!detail || detail === "{}") {
        if (response.status === 403) {
          detail = "No tienes permiso para realizar esta acción.";
        } else if (response.status === 401) {
          detail = "Tu sesión expiró. Vuelve a iniciar sesión.";
        } else if (response.status === 404) {
          detail = "No encontramos ese recurso (404). Verifique el enlace o vuelva a Abrir desde el menú.";
        } else {
          detail = `Request failed (${response.status})`;
        }
      }
      const error = new Error(detail);
      error.status = response.status;
      error.payload = payload;
      error.code =
        typeof payload === "object" && payload
          ? payload.code || payload.extensions?.code
          : undefined;
      error.correlationId =
        typeof payload === "object" && payload
          ? payload.correlationId || payload.extensions?.correlationId
          : undefined;
      throw error;
    }

    return payload;
  } finally {
    if (useProgress) stopTopProgress();
    if (options.dedupeKey && inflightControllers.get(options.dedupeKey)?.signal === signal) {
      inflightControllers.delete(options.dedupeKey);
    }
  }
}

/** Short-lived GET cache + single-flight (same key shares one in-flight promise). */
const getResourceCache = new Map();

/**
 * Cached GET for navigation/hot paths. Never use for user-secret payloads that must
 * not be shared across tenants in the same tab — keys must include tenant/resource ids.
 * @param {string} path
 * @param {{ ttlMs?: number, cacheKey?: string } & Parameters<typeof api>[1]} [options]
 */
export async function cachedGet(path, options = {}) {
  const ttlMs = options.ttlMs ?? 2500;
  const cacheKey = options.cacheKey || `GET:${path}`;
  const now = Date.now();
  const hit = getResourceCache.get(cacheKey);
  if (hit && hit.value !== undefined && hit.expires > now) {
    return hit.value;
  }
  if (hit?.promise) {
    return hit.promise;
  }

  const { ttlMs: _t, cacheKey: _k, ...apiOptions } = options;
  const promise = api(path, { ...apiOptions, method: "GET" })
    .then((value) => {
      getResourceCache.set(cacheKey, { expires: Date.now() + ttlMs, value });
      return value;
    })
    .catch((error) => {
      getResourceCache.delete(cacheKey);
      throw error;
    });

  getResourceCache.set(cacheKey, { expires: 0, promise });
  return promise;
}

/** Invalidate by exact key or prefix (e.g. `/api/assemblies/{id}/`). */
export function invalidateCachedGet(keyOrPrefix) {
  if (!keyOrPrefix) {
    getResourceCache.clear();
    return;
  }
  for (const key of [...getResourceCache.keys()]) {
    if (key === keyOrPrefix || key.startsWith(keyOrPrefix) || key.includes(keyOrPrefix)) {
      getResourceCache.delete(key);
    }
  }
}

