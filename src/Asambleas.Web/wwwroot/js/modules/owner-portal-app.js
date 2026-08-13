import { api } from "./api.js";
import { hasPermission, logout, me } from "./auth.js";
import { isOperator, isOwnerPortalUser } from "./roles.js?v=rbac2";
import { escapeHtml, formatDateTime, qs } from "./ui.js";
import { showPageError } from "./app-feedback.js";
import { mountIaShell } from "./ia-nav.js";

function showError(message) {
  showPageError(message);
}

async function init() {
  let user;
  try {
    user = await me();
  } catch {
    location.href = "/";
    return;
  }

  // Operators / PH admins use the administrative dashboard.
  if (isOperator(user) || hasPermission(user, "ph:manage") || hasPermission(user, "assembly:manage")) {
    location.href = "/dashboard.html";
    return;
  }

  if (!isOwnerPortalUser(user) && !hasPermission(user, "portal:self") && !hasPermission(user, "vote:cast")) {
    showError("No tienes acceso al portal de propietario.");
    return;
  }

  qs("#user-chip").textContent = user.displayName || user.email || "Propietario";
  if (qs("#nav-tenant")) qs("#nav-tenant").textContent = user.tenantCode || "Portal propietario";
  qs("#btn-logout")?.addEventListener("click", async () => {
    await logout();
    location.href = "/";
  });

  mountIaShell(
    { level: "global", user, current: "owner-home" },
    { breadcrumbs: [{ label: "Mi portal" }] }
  );

  const [profile, assemblies] = await Promise.all([
    api("/api/ph/me/owner-profile").catch(() => null),
    api("/api/assemblies").catch(() => [])
  ]);

  const name = profile?.displayName || user.displayName || "Propietario";
  qs("#owner-hello").textContent = `Hola, ${name}`;

  renderAccount(profile, user);
  renderUnits(profile?.units || []);
  renderAssemblies(Array.isArray(assemblies) ? assemblies : assemblies?.items || []);
}

function renderAccount(profile, user) {
  const el = qs("#account-panel");
  if (!profile) {
    el.innerHTML = `<p>${escapeHtml(user.email || "")}</p>`;
    return;
  }
  el.innerHTML = `
    <p><strong>${escapeHtml(profile.displayName)}</strong></p>
    <p>${escapeHtml(profile.email || "—")}</p>
    <p>${escapeHtml(profile.phone || "Sin teléfono")}</p>
    <p class="muted">Propiedades: ${(profile.properties || []).map((p) => escapeHtml(p.name)).join(", ") || "—"}</p>`;
}

function renderUnits(units) {
  const el = qs("#units-panel");
  if (!units.length) {
    el.innerHTML = `<div class="empty-state">No hay unidades vinculadas a tu cuenta.</div>`;
    return;
  }
  el.innerHTML = `<ul class="stack">${units
    .map(
      (u) =>
        `<li><strong>${escapeHtml(u.unitCode)}</strong> · ${escapeHtml(u.propertyHorizontalName)} · participación ${Number(u.sharePercent).toFixed(2)}% · coef. unidad ${Number(u.unitCoefficientPercent).toFixed(4)}%</li>`
    )
    .join("")}</ul>`;
}

function renderAssemblies(list) {
  const el = qs("#assemblies-panel");
  const next = qs("#next-panel");
  if (!list.length) {
    el.innerHTML = `<div class="empty-state">No tienes asambleas asignadas aún.</div>`;
    next.innerHTML = `<div class="empty-state">Sin próxima asamblea.</div>`;
    return;
  }

  const sorted = [...list].sort((a, b) => new Date(a.scheduledAtUtc) - new Date(b.scheduledAtUtc));
  const upcoming = sorted.find((a) => ["Scheduled", "CheckIn", "InProgress", "Paused"].includes(a.status)) || sorted[0];
  const canEnter = ["CheckIn", "InProgress", "Paused"].includes(upcoming.status);
  next.innerHTML = `
    <h3 style="margin-top:0">${escapeHtml(upcoming.title || "Asamblea")}</h3>
    <p>${escapeHtml(formatDateTime(upcoming.scheduledAtUtc))} · ${escapeHtml(upcoming.status)}</p>
    ${
      canEnter
        ? `<a class="btn btn-primary" href="/assembly.html?assemblyId=${encodeURIComponent(upcoming.id)}">Entrar a la asamblea</a>`
        : `<a class="btn btn-secondary" href="/calendar.html">Ver calendario</a>`
    }`;

  el.innerHTML = `<ul class="stack">${sorted
    .map(
      (a) =>
        `<li><a href="/assembly.html?assemblyId=${encodeURIComponent(a.id)}">${escapeHtml(a.title || "Asamblea")}</a> · ${escapeHtml(a.status)} · ${escapeHtml(formatDateTime(a.scheduledAtUtc))}</li>`
    )
    .join("")}</ul>`;
}

init().catch((err) => showError(err.message || String(err)));
