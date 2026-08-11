let antiforgeryToken = null;

export async function ensureAntiforgery() {
  if (antiforgeryToken) {
    return antiforgeryToken;
  }

  const response = await fetch("/api/auth/antiforgery", {
    credentials: "same-origin"
  });

  if (!response.ok) {
    throw new Error("Unable to obtain antiforgery token.");
  }

  const data = await response.json();
  antiforgeryToken = data.requestToken;
  return antiforgeryToken;
}

export async function api(path, options = {}) {
  const method = (options.method || "GET").toUpperCase();
  const headers = new Headers(options.headers || {});

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

  const response = await fetch(path, {
    ...options,
    method,
    headers,
    credentials: "same-origin",
    body: options.body && typeof options.body !== "string"
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
    const detail =
      typeof payload === "object" && payload
        ? payload.detail || payload.title || JSON.stringify(payload)
        : String(payload);
    const error = new Error(detail || `Request failed (${response.status})`);
    error.status = response.status;
    error.payload = payload;
    error.code = typeof payload === "object" && payload ? payload.code || payload.extensions?.code : undefined;
    error.correlationId =
      typeof payload === "object" && payload
        ? payload.correlationId || payload.extensions?.correlationId
        : undefined;
    throw error;
  }

  return payload;
}
