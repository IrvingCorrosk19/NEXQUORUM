import { api } from "./api.js";
import { hasPermission, logout, me } from "./auth.js";
import { isOperator, isOwnerPortalUser } from "./roles.js?v=rbac2";
import { escapeHtml, formatDateTime, qs } from "./ui.js";
import { showPageError } from "./app-feedback.js";
import { mountIaShell } from "./ia-nav.js?v=own3";
import { utcIsoToPhLocalParts } from "./schedule-time.js";

const VIEWS = {
  home: { id: "view-home", nav: "owner-home", label: "Inicio", crumb: "Inicio" },
  assemblies: { id: "view-assemblies", nav: "owner-assemblies", label: "Mis asambleas", crumb: "Mis asambleas" },
  units: { id: "view-units", nav: "owner-units", label: "Mis unidades", crumb: "Mis unidades" },
  "unit-detail": { id: "view-unit-detail", nav: "owner-units", label: "Unidad", crumb: "Detalle de unidad" },
  account: { id: "view-account", nav: "owner-account", label: "Mi cuenta", crumb: "Mi cuenta" }
};

const state = {
  user: null,
  profile: null,
  events: [],
  next: null,
  route: { view: "home", unitCode: null },
  loading: false,
  loadError: null
};

function showError(message) {
  showPageError(message);
}

function parseHash() {
  const raw = (location.hash || "").replace(/^#/, "").trim();
  if (!raw || raw === "home" || raw === "inicio") {
    return { view: "home", unitCode: null };
  }
  if (raw === "assemblies" || raw === "asambleas") {
    return { view: "assemblies", unitCode: null };
  }
  if (raw === "units" || raw === "unidades") {
    return { view: "units", unitCode: null };
  }
  if (raw === "account" || raw === "cuenta") {
    return { view: "account", unitCode: null };
  }
  const unitMatch = raw.match(/^units\/([^/]+)$/i) || raw.match(/^unidades\/([^/]+)$/i);
  if (unitMatch) {
    return { view: "unit-detail", unitCode: decodeURIComponent(unitMatch[1]) };
  }
  return { view: "home", unitCode: null };
}

function setHash(view, unitCode = null) {
  let next = "home";
  if (view === "assemblies") next = "assemblies";
  else if (view === "units") next = "units";
  else if (view === "account") next = "account";
  else if (view === "unit-detail" && unitCode) next = `units/${encodeURIComponent(unitCode)}`;
  const desired = `#${next}`;
  if (location.hash !== desired) {
    location.hash = desired;
  } else {
    applyRoute();
  }
}

function modalityLabel(m) {
  const v = String(m || "").toUpperCase();
  if (v === "VIRTUAL") return "Virtual";
  if (v === "PRESENCIAL") return "Presencial";
  if (v === "HIBRIDA" || v === "HÍBRIDA") return "Híbrida";
  return m || "—";
}

function statusBadge(ev) {
  const status = String(ev.status || "");
  const cal = String(ev.calendarStatus || "");
  if (cal === "LIVE" || status === "InProgress" || status === "Paused") {
    return { label: "En vivo", cls: "owner-badge--live" };
  }
  if (status === "CheckIn") {
    return { label: "Acreditación", cls: "owner-badge--soon" };
  }
  if (status === "Completed") {
    return { label: "Finalizada", cls: "owner-badge--done" };
  }
  if (status === "Cancelled") {
    return { label: "Cancelada", cls: "owner-badge--cancel" };
  }
  if (String(ev.convocationStatus || "").toLowerCase() === "sent") {
    return { label: "Convocado", cls: "owner-badge--neutral" };
  }
  return { label: "Programada", cls: "owner-badge--soon" };
}

function formatEventWhen(ev) {
  try {
    const parts = utcIsoToPhLocalParts(ev.scheduledAtUtc, ev.timeZoneId || "America/Panama");
    const [y, m, d] = parts.date.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d, 12));
    const day = new Intl.DateTimeFormat("es-PA", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC"
    }).format(dt);
    const hm = parts.time || "";
    const [hh, mm] = hm.split(":").map(Number);
    const ampm = new Date(Date.UTC(2000, 0, 1, hh || 0, mm || 0));
    const time = new Intl.DateTimeFormat("es-PA", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "UTC"
    }).format(ampm);
    return `${day} · ${time}`;
  } catch {
    return formatDateTime(ev.scheduledAtUtc);
  }
}

function assemblyHref(ev) {
  const id = encodeURIComponent(ev.assemblyId || ev.id);
  if (ev.canJoin || ["InProgress", "Paused", "CheckIn"].includes(String(ev.status))) {
    return `/lobby.html?assemblyId=${id}`;
  }
  return `/calendar.html?assemblyId=${id}`;
}

function primaryCta(ev) {
  if (ev.canJoin || ["InProgress", "Paused"].includes(String(ev.status))) {
    return { href: `/lobby.html?assemblyId=${encodeURIComponent(ev.assemblyId || ev.id)}`, label: "Entrar ahora", primary: true };
  }
  if (String(ev.status) === "CheckIn") {
    return { href: `/lobby.html?assemblyId=${encodeURIComponent(ev.assemblyId || ev.id)}`, label: "Entrar a la asamblea", primary: true };
  }
  if (String(ev.convocationStatus || "").toLowerCase() === "sent") {
    return { href: `/calendar.html?assemblyId=${encodeURIComponent(ev.assemblyId || ev.id)}`, label: "Ver convocatoria", primary: false };
  }
  return { href: `/calendar.html?assemblyId=${encodeURIComponent(ev.assemblyId || ev.id)}`, label: "Ver detalle", primary: false };
}

function emptyHtml(title, body) {
  return `<div class="owner-empty">
    <div class="owner-empty__icon" aria-hidden="true">◇</div>
    <h3>${escapeHtml(title)}</h3>
    <p>${escapeHtml(body)}</p>
  </div>`;
}

function errorHtml(title, body, retryAttr) {
  return `<div class="owner-error" role="alert">
    <h3>${escapeHtml(title)}</h3>
    <p>${escapeHtml(body)}</p>
    <button type="button" class="btn btn-secondary" data-retry="${escapeHtml(retryAttr)}">Reintentar</button>
  </div>`;
}

function skeletonList() {
  return `<div class="owner-skeleton owner-skeleton--list" aria-hidden="true"><span></span><span></span><span></span></div>`;
}

function remountNav() {
  const meta = VIEWS[state.route.view] || VIEWS.home;
  mountIaShell(
    { level: "global", user: state.user, current: meta.nav },
    { breadcrumbs: [{ label: "Mi portal", href: "/owner.html#home" }, { label: meta.crumb }] }
  );
  const label = qs("#ia-context-label");
  if (label) label.textContent = meta.label;
}

function showView(view) {
  Object.values(VIEWS).forEach((v) => {
    const el = qs(`#${v.id}`);
    if (el) el.hidden = v.id !== (VIEWS[view] || VIEWS.home).id;
  });
}

function upcomingEvents() {
  return state.events
    .filter((e) => ["Scheduled", "CheckIn", "InProgress", "Paused"].includes(String(e.status)))
    .sort((a, b) => new Date(a.scheduledAtUtc) - new Date(b.scheduledAtUtc));
}

function recentCompleted() {
  return state.events
    .filter((e) => ["Completed", "Cancelled"].includes(String(e.status)))
    .sort((a, b) => new Date(b.scheduledAtUtc) - new Date(a.scheduledAtUtc))
    .slice(0, 3);
}

function renderAssemblyCard(ev, { compact = false } = {}) {
  const badge = statusBadge(ev);
  const cta = primaryCta(ev);
  const countdown =
    ev.countdownLabel && !compact
      ? `<p class="owner-meta"><strong>${escapeHtml(ev.countdownLabel)}</strong></p>`
      : "";
  return `<article class="owner-asm-card">
    <div class="owner-asm-card__top">
      <h3>${escapeHtml(ev.title || "Asamblea")}</h3>
      <div class="owner-badges">
        <span class="owner-badge ${badge.cls}">${escapeHtml(badge.label)}</span>
        <span class="owner-badge owner-badge--neutral">${escapeHtml(modalityLabel(ev.modality))}</span>
      </div>
    </div>
    <p class="owner-meta">${escapeHtml(ev.propertyHorizontalName || "—")}</p>
    <p class="owner-meta">${escapeHtml(formatEventWhen(ev))}</p>
    ${countdown}
    <div class="owner-asm-card__actions">
      <a class="btn ${cta.primary ? "btn-primary" : "btn-secondary"}" href="${cta.href}">${escapeHtml(cta.label)}</a>
      ${
        cta.label !== "Ver detalle"
          ? `<a class="btn btn-ghost" href="${assemblyHref(ev)}">Ver detalle</a>`
          : ""
      }
    </div>
  </article>`;
}

function renderUnitCard(u) {
  const code = u.unitCode || u.code || "—";
  const active = u.isActive !== false;
  return `<article class="owner-unit-card">
    <div class="owner-unit-card__top">
      <h3>Unidad ${escapeHtml(code)}</h3>
      <span class="owner-badge ${active ? "owner-badge--ok" : "owner-badge--done"}">${active ? "Activa" : "Inactiva"}</span>
    </div>
    <p class="owner-meta">${escapeHtml(u.propertyHorizontalName || "—")}</p>
    <p class="owner-meta">Participación: <strong>${Number(u.sharePercent || 0).toFixed(2)}%</strong>
      · Coeficiente: <strong>${Number(u.unitCoefficientPercent || 0).toFixed(4)}%</strong></p>
    <div class="owner-unit-card__actions">
      <a class="btn btn-secondary" href="#units/${encodeURIComponent(code)}">Ver detalle</a>
    </div>
  </article>`;
}

function renderHome() {
  const nextBody = qs("#home-next-body");
  const unitsBody = qs("#home-units-body");
  const asmBody = qs("#home-asm-body");
  if (!nextBody || !unitsBody || !asmBody) return;

  if (state.loadError) {
    nextBody.innerHTML = errorHtml("No pudimos cargar tu portal", "Intenta nuevamente.", "all");
    unitsBody.innerHTML = "";
    asmBody.innerHTML = "";
    return;
  }

  const next = state.next || upcomingEvents()[0] || null;
  if (!next) {
    nextBody.innerHTML = emptyHtml(
      "Aún no tienes asambleas próximas",
      "Cuando seas convocado a una nueva asamblea aparecerá aquí."
    );
  } else {
    nextBody.innerHTML = renderAssemblyCard(next);
  }

  const units = state.profile?.units || [];
  if (!units.length) {
    unitsBody.innerHTML = emptyHtml(
      "No hay unidades vinculadas",
      "Cuando tu administración vincule una unidad a tu cuenta, la verás aquí."
    );
  } else {
    unitsBody.innerHTML = units.slice(0, 2).map(renderUnitCard).join("");
  }

  const up = upcomingEvents();
  const done = recentCompleted();
  const summary = [
    `<div class="owner-summary-row"><span>Próximas</span><span>${up.length}</span></div>`,
    `<div class="owner-summary-row"><span>Convocadas / en curso</span><span>${up.filter((e) => e.canJoin || String(e.convocationStatus || "").toLowerCase() === "sent" || ["InProgress", "Paused", "CheckIn"].includes(String(e.status))).length}</span></div>`,
    `<div class="owner-summary-row"><span>Finalizadas recientes</span><span>${done.length}</span></div>`
  ].join("");
  asmBody.innerHTML = summary + (up[0] ? `<div style="margin-top:0.85rem">${renderAssemblyCard(up[0], { compact: true })}</div>` : "");
}

function renderAssemblies() {
  const el = qs("#assemblies-panel");
  if (!el) return;
  if (state.loading) {
    el.innerHTML = skeletonList();
    return;
  }
  if (state.loadError) {
    el.innerHTML = errorHtml("No pudimos cargar tus asambleas", "Intenta nuevamente.", "assemblies");
    return;
  }
  if (!state.events.length) {
    el.innerHTML = emptyHtml(
      "Aún no tienes asambleas próximas",
      "Cuando seas convocado a una nueva asamblea aparecerá aquí."
    );
    return;
  }
  const live = state.events.filter((e) => ["InProgress", "Paused", "CheckIn"].includes(String(e.status)));
  const upcoming = state.events.filter((e) => String(e.status) === "Scheduled");
  const past = state.events.filter((e) => ["Completed", "Cancelled"].includes(String(e.status)));
  const blocks = [];
  if (live.length) {
    blocks.push(`<h2 class="section-title">En curso</h2>${live.map((e) => renderAssemblyCard(e)).join("")}`);
  }
  if (upcoming.length) {
    blocks.push(`<h2 class="section-title">Próximas</h2>${upcoming.map((e) => renderAssemblyCard(e)).join("")}`);
  }
  if (past.length) {
    blocks.push(`<h2 class="section-title">Recientes</h2>${past.map((e) => renderAssemblyCard(e)).join("")}`);
  }
  el.innerHTML = blocks.join("") || emptyHtml("Sin asambleas", "No hay asambleas para mostrar.");
}

function renderUnits() {
  const el = qs("#units-panel");
  if (!el) return;
  if (state.loading) {
    el.innerHTML = skeletonList();
    return;
  }
  if (state.loadError) {
    el.innerHTML = errorHtml("No pudimos cargar tus unidades", "Intenta nuevamente.", "units");
    return;
  }
  const units = state.profile?.units || [];
  if (!units.length) {
    el.innerHTML = emptyHtml(
      "No hay unidades vinculadas a tu cuenta",
      "Si esperabas ver una unidad, contacta a la administración de tu PH."
    );
    return;
  }
  el.innerHTML = units.map(renderUnitCard).join("");
}

function renderUnitDetail() {
  const code = state.route.unitCode;
  const units = state.profile?.units || [];
  const unit = units.find((u) => String(u.unitCode || u.code) === String(code));
  const title = qs("#unit-detail-title");
  const lede = qs("#unit-detail-lede");
  const panel = qs("#unit-detail-panel");
  if (title) title.textContent = unit ? `Unidad ${unit.unitCode || unit.code}` : "Unidad";
  if (lede) lede.textContent = unit?.propertyHorizontalName || "";
  if (!panel) return;
  if (!unit) {
    panel.innerHTML = emptyHtml(
      "No encontramos esta unidad",
      "Es posible que no esté vinculada a tu cuenta o que el enlace no sea válido."
    );
    return;
  }
  const active = unit.isActive !== false;
  panel.innerHTML = `<article class="owner-account-card">
    <div class="owner-badges"><span class="owner-badge ${active ? "owner-badge--ok" : "owner-badge--done"}">${active ? "Activa" : "Inactiva"}</span></div>
    <dl class="owner-dl">
      <dt>Unidad</dt><dd>${escapeHtml(unit.unitCode || unit.code)}</dd>
      <dt>Propiedad</dt><dd>${escapeHtml(unit.propertyHorizontalName || "—")}</dd>
      ${unit.tower ? `<dt>Torre</dt><dd>${escapeHtml(unit.tower)}</dd>` : ""}
      <dt>Participación</dt><dd>${Number(unit.sharePercent || 0).toFixed(2)}%</dd>
      <dt>Coeficiente</dt><dd>${Number(unit.unitCoefficientPercent || 0).toFixed(4)}%</dd>
    </dl>
    <div class="owner-unit-card__actions" style="margin-top:0.85rem">
      <a class="btn btn-secondary" href="#units">Volver a mis unidades</a>
      <a class="btn btn-ghost" href="#assemblies">Ver mis asambleas</a>
    </div>
  </article>`;
}

function renderAccount() {
  const el = qs("#account-panel");
  if (!el) return;
  if (state.loading) {
    el.innerHTML = skeletonList();
    return;
  }
  const p = state.profile;
  const user = state.user;
  if (!p && !user) {
    el.innerHTML = errorHtml("No pudimos cargar tu cuenta", "Intenta nuevamente.", "account");
    return;
  }
  const name = p?.displayName || user?.displayName || "Propietario";
  const email = p?.email || user?.email || "—";
  const phone = p?.phone || null;
  const props = p?.properties || [];
  el.innerHTML = `
    <article class="owner-account-card">
      <h3>Información personal</h3>
      <dl class="owner-dl">
        <dt>Nombre</dt><dd>${escapeHtml(name)}</dd>
        <dt>Correo electrónico</dt><dd>${escapeHtml(email)}</dd>
        <dt>Teléfono</dt><dd>${escapeHtml(phone || "Sin teléfono registrado")}</dd>
      </dl>
    </article>
    <article class="owner-account-card">
      <h3>Propiedades relacionadas</h3>
      ${
        props.length
          ? `<ul class="stack" style="margin:0;padding-left:1.1rem">${props
              .map((x) => `<li><strong>${escapeHtml(x.name)}</strong>${x.code ? ` · ${escapeHtml(x.code)}` : ""}</li>`)
              .join("")}</ul>`
          : `<p class="owner-meta">No hay propiedades asociadas.</p>`
      }
    </article>
    <article class="owner-account-card">
      <h3>Seguridad</h3>
      <p class="owner-meta">Para cambiar tu contraseña o recuperar el acceso, solicita asistencia a la administración de tu PH. El cierre de sesión termina tu sesión actual en este dispositivo.</p>
      <div class="owner-unit-card__actions">
        <button type="button" class="btn btn-secondary" id="btn-account-logout">Cerrar sesión</button>
      </div>
    </article>`;
  qs("#btn-account-logout")?.addEventListener("click", async () => {
    await logout();
    location.href = "/";
  });
}

function renderAll() {
  renderHome();
  renderAssemblies();
  renderUnits();
  if (state.route.view === "unit-detail") renderUnitDetail();
  renderAccount();
}

function applyRoute() {
  state.route = parseHash();
  showView(state.route.view);
  remountNav();
  if (state.route.view === "unit-detail") renderUnitDetail();
  const main = qs("#main");
  if (main) main.focus?.();
}

async function loadPortalData() {
  state.loading = true;
  state.loadError = null;
  renderAll();
  try {
    const from = new Date();
    from.setUTCMonth(from.getUTCMonth() - 2);
    const to = new Date();
    to.setUTCMonth(to.getUTCMonth() + 6);
    const q = new URLSearchParams({
      from: from.toISOString(),
      to: to.toISOString()
    });

    const [profile, nextRes, eventsRes, assembliesFallback] = await Promise.all([
      api("/api/ph/me/owner-profile").catch(() => null),
      api("/api/calendar/next").catch(() => null),
      api(`/api/calendar/events?${q}`).catch(() => null),
      api("/api/assemblies").catch(() => [])
    ]);

    state.profile = profile;
    state.next = nextRes?.next || null;

    let events = eventsRes?.events || [];
    if (!events.length && Array.isArray(assembliesFallback) && assembliesFallback.length) {
      events = assembliesFallback.map((a) => ({
        assemblyId: a.id,
        propertyHorizontalName: a.propertyHorizontalName || "",
        title: a.title,
        modality: a.modality,
        status: a.status,
        calendarStatus: a.status === "InProgress" ? "LIVE" : "",
        scheduledAtUtc: a.scheduledAtUtc,
        timeZoneId: a.timeZoneId || "America/Panama",
        canJoin: ["InProgress", "Paused", "CheckIn"].includes(String(a.status)),
        convocationStatus: a.convocationStatus || null,
        countdownLabel: a.status === "InProgress" ? "EN VIVO" : ""
      }));
    }
    state.events = events;

    const name = profile?.displayName || state.user.displayName || "Propietario";
    const hello = qs("#owner-hello");
    if (hello) hello.textContent = `Hola, ${name}`;
    const lede = qs("#owner-lede");
    if (lede && profile?.properties?.[0]?.name) {
      lede.textContent = `Resumen para ${profile.properties[0].name}.`;
    }
  } catch (err) {
    state.loadError = err?.message || "Error de carga";
    console.error("[owner-portal]", err);
  } finally {
    state.loading = false;
    renderAll();
  }
}

function wireChrome() {
  qs("#btn-logout")?.addEventListener("click", async () => {
    await logout();
    location.href = "/";
  });

  window.addEventListener("hashchange", () => applyRoute());

  document.addEventListener("click", (e) => {
    const retry = e.target.closest?.("[data-retry]");
    if (retry) {
      e.preventDefault();
      loadPortalData();
    }
  });
}

async function init() {
  let user;
  try {
    user = await me();
  } catch {
    location.href = "/";
    return;
  }

  if (isOperator(user) || hasPermission(user, "ph:manage") || hasPermission(user, "assembly:manage")) {
    location.href = "/dashboard.html";
    return;
  }

  if (!isOwnerPortalUser(user) && !hasPermission(user, "portal:self") && !hasPermission(user, "vote:cast")) {
    showError("No tienes acceso al portal de propietario.");
    return;
  }

  state.user = user;
  qs("#user-chip").textContent = user.displayName || user.email || "Propietario";
  if (qs("#nav-tenant")) qs("#nav-tenant").textContent = user.tenantCode || "Portal propietario";

  wireChrome();
  applyRoute();
  await loadPortalData();
}

init().catch((err) => showError(err.message || String(err)));
