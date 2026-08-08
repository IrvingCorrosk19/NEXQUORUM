import { api } from "./api.js";

const STORAGE_KEY = "asambleas.session";

export async function login(email, password) {
  const user = await api("/api/auth/login", {
    method: "POST",
    body: { email, password }
  });
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  return user;
}

export async function logout() {
  try {
    await api("/api/auth/logout", { method: "POST" });
  } finally {
    sessionStorage.removeItem(STORAGE_KEY);
  }
}

export async function me() {
  const user = await api("/api/auth/me");
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  return user;
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
