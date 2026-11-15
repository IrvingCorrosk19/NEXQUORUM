import { api } from "./api.js";
import { hasPermission, logout, me } from "./auth.js";
import { rememberMe } from "./session-shell-cache.js";
import { applyAvatarElement, avatarCacheBust, avatarCanonicalUrl } from "./avatar-ui.js?v=own11";
import { isOperator, isOwnerPortalUser } from "./roles.js?v=rbac2";
import { escapeHtml, formatDateTime, qs } from "./ui.js";
import { showPageError } from "./app-feedback.js";
import { mountIaShell } from "./ia-nav.js?v=own9";
import { utcIsoToPhLocalParts } from "./schedule-time.js";
import { startHybridShell } from "./hybrid-router.js?v=own9";
import { iconSvg } from "./tabler-icons.js?v=own9";
import {
  bindSheetViewport,
  lockPageScroll,
  rememberOpener,
  restoreOpener,
  trapFocus,
  wireSheetKeyboard
} from "./query-guard.js?v=polish11";

const BRAND_COVER = "/img/brand/architecture-cover.jpg";
const VIEWS = {
  home: { id: "view-home", nav: "owner-home", label: "Inicio", crumb: "Inicio" },
  assemblies: { id: "view-assemblies", nav: "owner-assemblies", label: "Mis asambleas", crumb: "Mis asambleas" },
  units: { id: "view-units", nav: "owner-units", label: "Mis unidades", crumb: "Mis unidades" },
  account: { id: "view-account", nav: "owner-account", label: "Mi perfil", crumb: "Mi perfil" }
};

const state = {
  user: null,
  profile: null,
  phDetail: null,
  events: [],
  next: null,
  route: { view: "home", unitCode: null, assemblyId: null, modal: null },
  loading: false,
  loadError: null,
  sectionError: null,
  sections: { profile: "loading", units: "loading", assemblies: "loading" }
};

const modalUi = {
  opener: null,
  openerHref: null,
  openerUnitCode: null,
  openerAssemblyId: null,
  openerKind: null,
  scrollY: 0,
  returnView: "units",
  untrap: null,
  unbind: null,
  closingByUi: false,
  unitToken: 0,
  assemblyToken: 0,
  suppressHashApply: false,
  routeLockUntil: 0,
  chromeAbort: null
};

function routesEqual(a, b) {
  return (
    a?.view === b?.view &&
    a?.modal === b?.modal &&
    String(a?.unitCode || "") === String(b?.unitCode || "") &&
    String(a?.assemblyId || "") === String(b?.assemblyId || "")
  );
}

function showError(message) {
  showPageError(message);
}

function parseHash() {
  const raw = (location.hash || "").replace(/^#/, "").trim();
  if (!raw || raw === "home" || raw === "inicio") {
    return { view: "home", unitCode: null, assemblyId: null, modal: null };
  }
  if (raw === "assemblies" || raw === "asambleas") {
    return { view: "assemblies", unitCode: null, assemblyId: null, modal: null };
  }
  if (raw === "units" || raw === "unidades") {
    return { view: "units", unitCode: null, assemblyId: null, modal: null };
  }
  if (raw === "account" || raw === "cuenta" || raw === "perfil") {
    return { view: "account", unitCode: null, assemblyId: null, modal: null };
  }
  const unitMatch = raw.match(/^units\/([^/]+)$/i) || raw.match(/^unidades\/([^/]+)$/i);
  if (unitMatch) {
    return {
      view: "units",
      unitCode: decodeURIComponent(unitMatch[1]),
      assemblyId: null,
      modal: "unit"
    };
  }
  const convMatch =
    raw.match(/^assemblies\/([^/]+)\/convocatoria$/i) ||
    raw.match(/^asambleas\/([^/]+)\/convocatoria$/i);
  if (convMatch) {
    return {
      view: "assemblies",
      unitCode: null,
      assemblyId: decodeURIComponent(convMatch[1]),
      modal: "convocation"
    };
  }
  const asmMatch = raw.match(/^assemblies\/([^/]+)$/i) || raw.match(/^asambleas\/([^/]+)$/i);
  if (asmMatch) {
    return {
      view: "assemblies",
      unitCode: null,
      assemblyId: decodeURIComponent(asmMatch[1]),
      modal: "assembly"
    };
  }
  return { view: "home", unitCode: null, assemblyId: null, modal: null };
}

function desiredHash(route) {
  if (route.modal === "unit" && route.unitCode) {
    return `#units/${encodeURIComponent(route.unitCode)}`;
  }
  if (route.modal === "convocation" && route.assemblyId) {
    return `#assemblies/${encodeURIComponent(route.assemblyId)}/convocatoria`;
  }
  if (route.modal === "assembly" && route.assemblyId) {
    return `#assemblies/${encodeURIComponent(route.assemblyId)}`;
  }
  if (route.view === "assemblies") return "#assemblies";
  if (route.view === "units") return "#units";
  if (route.view === "account") return "#account";
  return "#home";
}

function setHash(partial, { replace = false, apply = true, lockMs = 0 } = {}) {
  const next = { ...state.route, ...partial };
  const desired = desiredHash(next);
  state.route = next;
  // lockMs > 0 arms a short guard; 0 clears so module links are not reverted.
  modalUi.routeLockUntil = lockMs > 0 ? Date.now() + lockMs : 0;
  if (location.hash === desired) {
    if (apply) applyRoute({ fromHash: false });
    return;
  }
  // Never assign location.hash: a deferred hash write can overwrite a later
  // replaceState when the user opens another modal on the next click.
  const url = `${location.pathname}${location.search}${desired}`;
  modalUi.suppressHashApply = true;
  if (replace) history.replaceState(null, "", url);
  else history.pushState(null, "", url);
  queueMicrotask(() => {
    modalUi.suppressHashApply = false;
  });
  if (apply) applyRoute({ fromHash: false });
}

function modalityLabel(m) {
  const v = String(m || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toUpperCase();
  if (v === "VIRTUAL") return "Virtual";
  if (v === "PRESENCIAL") return "Presencial";
  if (v === "HIBRIDA" || v === "HYBRID" || v === "HYBRIDA") return "Híbrida";
  return m || "—";
}

function statusBadge(ev) {
  const status = String(ev?.status || "");
  const cal = String(ev?.calendarStatus || "");
  if (cal === "LIVE" || status === "InProgress" || status === "Paused") {
    return { label: "En vivo", cls: "owner-badge--live" };
  }
  if (status === "CheckIn") {
    return { label: "Presencia", cls: "owner-badge--soon" };
  }
  if (status === "Completed") {
    return { label: "Finalizada", cls: "owner-badge--done" };
  }
  if (status === "Cancelled") {
    return { label: "Cancelada", cls: "owner-badge--cancel" };
  }
  if (String(ev?.convocationStatus || "").toLowerCase() === "sent") {
    return { label: "Convocado", cls: "owner-badge--neutral" };
  }
  return { label: "Programada", cls: "owner-badge--soon" };
}

function formatPercent(value) {
  if (value == null || value === "") return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return escapeHtml(String(value));
  return `${n}%`;
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
    return { day, time, label: `${day} · ${time} (Panamá)` };
  } catch {
    return { day: "—", time: "—", label: formatDateTime(ev?.scheduledAtUtc) };
  }
}

function isLive(ev) {
  const status = String(ev?.status || "");
  return Boolean(ev?.canJoin) || ["InProgress", "Paused", "CheckIn"].includes(status);
}

function isUpcoming(ev) {
  return ["Scheduled", "CheckIn", "InProgress", "Paused"].includes(String(ev?.status || ""));
}

function canShowConvocation(ev) {
  const st = String(ev?.status || "");
  return ["Scheduled", "CheckIn", "InProgress", "Paused", "Completed"].includes(st);
}

function primaryHomeCta(ev) {
  const status = String(ev?.status || "");
  // Home CTA: Entrar only for live desk/session; Scheduled keeps convocatoria even inside join window.
  if (["InProgress", "Paused", "CheckIn"].includes(status)) {
    return {
      kind: "join",
      href: `/assembly.html?assemblyId=${encodeURIComponent(ev.assemblyId || ev.id)}`,
      label: "Entrar a la asamblea"
    };
  }
  return {
    kind: "convocation",
    href: `#assemblies/${encodeURIComponent(ev.assemblyId || ev.id)}/convocatoria`,
    label: "Ver convocatoria"
  };
}

function emptyHtml(title, body, actionHtml = "") {
  return `<div class="owner-empty owner-empty--compact">
    <h3>${escapeHtml(title)}</h3>
    <p>${escapeHtml(body)}</p>
    ${actionHtml}
  </div>`;
}

function errorHtml(title, body, retryAttr) {
  return `<div class="owner-error" role="alert">
    <h3>${escapeHtml(title)}</h3>
    <p>${escapeHtml(body)}</p>
    <button type="button" class="btn btn-outline-owner" data-retry="${escapeHtml(retryAttr)}">Reintentar</button>
  </div>`;
}

function skeletonInline() {
  return `<div class="owner-skeleton" aria-hidden="true"><span></span><span></span><span></span></div>`;
}

function skeletonList() {
  return `<div class="owner-skeleton owner-skeleton--list" aria-hidden="true"><span></span><span></span><span></span></div>`;
}

function loadingBlock(label) {
  return `<div class="owner-loading" role="status">${escapeHtml(label)}</div>`;
}

function activePh() {
  const props = state.profile?.properties || [];
  return props.find((p) => p.isCurrent) || props[0] || null;
}

function upcomingEvents() {
  return state.events
    .filter((e) => isUpcoming(e))
    .sort((a, b) => new Date(a.scheduledAtUtc) - new Date(b.scheduledAtUtc));
}

function recentCompleted() {
  return state.events
    .filter((e) => ["Completed", "Cancelled"].includes(String(e.status)))
    .sort((a, b) => new Date(b.scheduledAtUtc) - new Date(a.scheduledAtUtc))
    .slice(0, 3);
}

function sortedAssemblies() {
  const live = [];
  const upcoming = [];
  const past = [];
  for (const e of state.events) {
    const st = String(e.status);
    if (["InProgress", "Paused", "CheckIn"].includes(st)) live.push(e);
    else if (st === "Scheduled") upcoming.push(e);
    else past.push(e);
  }
  const byDateAsc = (a, b) => new Date(a.scheduledAtUtc) - new Date(b.scheduledAtUtc);
  const byDateDesc = (a, b) => new Date(b.scheduledAtUtc) - new Date(a.scheduledAtUtc);
  return [...live.sort(byDateAsc), ...upcoming.sort(byDateAsc), ...past.sort(byDateDesc)];
}

function findEvent(id) {
  return state.events.find((e) => String(e.assemblyId || e.id) === String(id)) || null;
}

function findUnit(code) {
  return (state.profile?.units || []).find((u) => String(u.unitCode || u.code) === String(code)) || null;
}

function visibleBaseView() {
  if (state.route.modal === "unit") {
    return modalUi.returnView === "home" ? "home" : "units";
  }
  if (state.route.modal === "assembly" || state.route.modal === "convocation") {
    return modalUi.returnView === "home" ? "home" : "assemblies";
  }
  return state.route.view || "home";
}

function activeNavKey() {
  if (state.route.modal === "unit") return "owner-units";
  if (state.route.modal === "assembly" || state.route.modal === "convocation") return "owner-assemblies";
  return (VIEWS[state.route.view] || VIEWS.home).nav;
}

function syncBottomNav() {
  const key = activeNavKey();
  document.querySelectorAll("#owner-bottom-nav a").forEach((a) => {
    const on = a.getAttribute("data-bottom") === key;
    a.classList.toggle("is-active", on);
    if (on) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
}

function remountNav() {
  const base = visibleBaseView();
  const meta = VIEWS[base] || VIEWS.home;
  mountIaShell(
    { level: "global", user: state.user, current: activeNavKey() },
    { breadcrumbs: [{ label: "Mi portal", href: "/owner.html#home" }, { label: meta.crumb }] }
  );
  const label = qs("#ia-context-label");
  if (label) label.textContent = meta.label;
  syncBottomNav();
}

function showView(view) {
  const target = VIEWS[view] || VIEWS.home;
  Object.values(VIEWS).forEach((v) => {
    const el = qs(`#${v.id}`);
    if (el) el.hidden = v.id !== target.id;
  });
  document.body.dataset.ownerView = view;
}

function renderUnitCard(u, { compact = false } = {}) {
  const code = u.unitCode || u.code || "—";
  const active = u.isActive !== false;
  return `<article class="owner-unit-card${compact ? " owner-unit-card--compact" : ""}">
    <div class="owner-unit-card__top">
      <h3>Unidad ${escapeHtml(code)}</h3>
      <span class="owner-badge ${active ? "owner-badge--ok" : "owner-badge--done"}">${active ? "Activa" : "Inactiva"}</span>
    </div>
    <div class="owner-stat-pair">
      <div class="owner-stat">
        <span class="owner-stat__label">Participación</span>
        <span class="owner-stat__value">${formatPercent(u.sharePercent)}</span>
      </div>
      <div class="owner-stat">
        <span class="owner-stat__label">Coeficiente</span>
        <span class="owner-stat__value">${formatPercent(u.unitCoefficientPercent)}</span>
      </div>
    </div>
    <div class="owner-unit-card__actions">
      <a class="btn btn-outline-owner" href="#units/${encodeURIComponent(code)}" data-owner-open="unit" data-unit-code="${escapeHtml(code)}">Ver detalle</a>
    </div>
  </article>`;
}

function renderAssemblyRow(ev) {
  const badge = statusBadge(ev);
  const when = formatEventWhen(ev);
  const id = String(ev.assemblyId || ev.id);
  const enc = encodeURIComponent(id);
  const join = isLive(ev)
    ? `<a class="btn btn-primary" href="/assembly.html?assemblyId=${enc}">Entrar a la asamblea</a>`
    : "";
  const detail = `<a class="btn btn-outline-owner" href="#assemblies/${enc}" data-owner-open="assembly" data-assembly-id="${escapeHtml(id)}" data-title="${escapeHtml(ev.title || "Asamblea")}" data-when="${escapeHtml(when.label)}">Ver detalle</a>`;
  const conv = canShowConvocation(ev)
    ? `<a class="btn btn-ghost-owner" href="#assemblies/${enc}/convocatoria" data-owner-open="convocation" data-assembly-id="${escapeHtml(id)}" data-title="${escapeHtml(ev.title || "Asamblea")}" data-when="${escapeHtml(when.label)}">Ver convocatoria</a>`
    : "";
  return `<article class="owner-asm-row" data-assembly-id="${escapeHtml(id)}">
    <div class="owner-asm-row__when" aria-label="${escapeHtml(when.label)}">
      <span class="owner-asm-row__day">${escapeHtml(when.day)}</span>
      <span class="owner-asm-row__time">${escapeHtml(when.time)}</span>
      <span class="owner-asm-row__tz">Panamá</span>
    </div>
    <div class="owner-asm-row__main">
      <h3>${escapeHtml(ev.title || "Asamblea")}</h3>
      <div class="owner-badges">
        <span class="owner-badge ${badge.cls}">${escapeHtml(badge.label)}</span>
        <span class="owner-badge owner-badge--neutral">${escapeHtml(modalityLabel(ev.modality))}</span>
      </div>
    </div>
    <div class="owner-asm-row__actions">
      ${join}
      ${detail}
      ${conv}
    </div>
  </article>`;
}

function renderNextFeature(next) {
  if (!next) {
    return emptyHtml(
      "Sin asamblea próxima",
      "Cuando haya una convocatoria o una reunión en curso, aparecerá aquí.",
      `<a class="owner-link" href="#assemblies">Ver historial</a>`
    );
  }
  const badge = statusBadge(next);
  const when = formatEventWhen(next);
  const cta = primaryHomeCta(next);
  const id = String(next.assemblyId || next.id);
  return `<div class="owner-next">
    <div class="owner-next__head">
      <h3>${escapeHtml(next.title || "Asamblea")}</h3>
      <span class="owner-badge ${badge.cls}">${escapeHtml(badge.label)}</span>
    </div>
    <dl class="owner-dl owner-dl--inline">
      <div><dt>Fecha</dt><dd>${escapeHtml(when.day)}</dd></div>
      <div><dt>Hora (Panamá)</dt><dd>${escapeHtml(when.time)}</dd></div>
      <div><dt>Modalidad</dt><dd>${escapeHtml(modalityLabel(next.modality))}</dd></div>
    </dl>
    <div class="owner-next__actions">
      <a class="btn btn-primary" href="${cta.href}" ${
        cta.kind === "convocation"
          ? `data-owner-open="convocation" data-assembly-id="${escapeHtml(id)}" data-title="${escapeHtml(next.title || "Asamblea")}" data-when="${escapeHtml(when.label)}"`
          : ""
      }>${escapeHtml(cta.label)}</a>
    </div>
  </div>`;
}

function renderHome() {
  const nextBody = qs("#home-next-body");
  const unitsBody = qs("#home-units-body");
  const asmBody = qs("#home-asm-body");
  const nextCard = qs("#home-next");
  const homeCols = qs(".owner-home-columns");
  if (!nextBody || !unitsBody || !asmBody) return;

  if (state.loading && !state.profile && !state.events.length) {
    nextBody.innerHTML = skeletonInline();
    unitsBody.innerHTML = skeletonInline();
    asmBody.innerHTML = skeletonInline();
    return;
  }

  if (state.loadError) {
    nextBody.innerHTML = errorHtml("No pudimos cargar tu portal", "Intenta nuevamente.", "all");
    unitsBody.innerHTML = "";
    asmBody.innerHTML = "";
    return;
  }

  const next = resolveHomeNext();
  nextBody.innerHTML = renderNextFeature(next);
  nextCard?.classList.toggle("owner-card--empty-next", !next);
  homeCols?.classList.toggle("has-next-attention", Boolean(next && isUpcoming(next)));

  const units = state.profile?.units || [];
  if (state.sections.units === "loading" && !units.length) {
    unitsBody.innerHTML = skeletonInline();
  } else if (!units.length) {
    unitsBody.innerHTML = emptyHtml(
      "No hay unidades vinculadas",
      "Cuando tu administración vincule una unidad, la verás aquí."
    );
  } else {
    unitsBody.innerHTML = units.slice(0, 4).map((u) => renderUnitCard(u, { compact: true })).join("");
  }

  const up = upcomingEvents();
  const done = recentCompleted();
  if (state.sections.assemblies === "loading" && !state.events.length) {
    asmBody.innerHTML = skeletonInline();
  } else {
    asmBody.innerHTML = `
      <div class="owner-summary-row"><span>Próximas / en curso</span><span>${up.length}</span></div>
      <div class="owner-summary-row"><span>Finalizadas recientes</span><span>${done.length}</span></div>
      ${
        done[0]
          ? `<p class="owner-meta mt-2 mb-0">Última: <strong>${escapeHtml(done[0].title || "Asamblea")}</strong> · ${escapeHtml(formatEventWhen(done[0]).label)}</p>`
          : ""
      }`;
  }
}

function renderAssemblies() {
  const el = qs("#assemblies-panel");
  if (!el) return;
  if (state.sections.assemblies === "loading" && !state.events.length) {
    el.innerHTML = skeletonList();
    return;
  }
  if (state.loadError || state.sectionError === "assemblies") {
    el.innerHTML = errorHtml("No pudimos cargar tus asambleas", "Intenta nuevamente.", "assemblies");
    return;
  }
  if (!state.events.length) {
    el.innerHTML = emptyHtml(
      "Aún no tienes asambleas",
      "Cuando seas convocado a una asamblea aparecerá aquí."
    );
    return;
  }
  el.innerHTML = `<div class="owner-asm-list">${sortedAssemblies().map(renderAssemblyRow).join("")}</div>`;
}

function renderUnits() {
  const el = qs("#units-panel");
  if (!el) return;
  if (state.sections.units === "loading" && !state.profile) {
    el.innerHTML = skeletonList();
    return;
  }
  if (state.loadError || state.sectionError === "units") {
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
  el.innerHTML = units.map((u) => renderUnitCard(u)).join("");
}

function syncAvatars() {
  const user = state.user || {};
  const name = state.profile?.displayName || user.displayName || user.email || "Propietario";
  const raw = user.avatarDisplayUrl || user.avatarUrl || null;
  const url = raw ? avatarCacheBust(raw) : null;
  applyAvatarElement(qs("#user-avatar"), { url, label: name });
  applyAvatarElement(qs("#profile-avatar"), { url, label: name });
}

function renderProfileHero() {
  const nameEl = qs("#profile-hero-name");
  const phEl = qs("#profile-hero-ph");
  const user = state.user;
  const p = state.profile;
  const name = p?.displayName || user?.displayName || "Propietario";
  const ph = activePh();
  if (nameEl) nameEl.textContent = name;
  if (phEl) phEl.textContent = ph?.name || user?.tenantCode || "Tu PH";
  syncAvatars();
}

function renderSecurity() {
  const body = qs("#profile-security-body");
  const copy = qs("#profile-security-copy");
  const btn = qs("#btn-change-password");
  const link = qs("#profile-security-access");
  if (body) {
    body.classList.remove("owner-skeleton");
    body.removeAttribute("aria-hidden");
  }
  const user = state.user || {};
  const hasLocal = user.hasLocalPassword === true;
  if (copy) {
    if (hasLocal) {
      copy.textContent =
        "Tu cuenta usa contraseña local. Cámbiala aquí o usa «¿Olvidaste tu contraseña?» en la pantalla de acceso.";
    } else if (user.isPasswordless === true) {
      copy.textContent =
        "Esta cuenta inicia sesión sin contraseña local (acceso por correo). Para definir una contraseña, usa «¿Olvidaste tu contraseña?» en la pantalla de acceso.";
    } else {
      copy.textContent =
        "No hay contraseña local en esta cuenta. Gestiona el acceso desde la pantalla de inicio de sesión.";
    }
  }
  if (btn) {
    btn.hidden = !hasLocal;
    btn.removeAttribute("aria-hidden");
    btn.setAttribute("aria-haspopup", "dialog");
    btn.setAttribute("aria-controls", "dlg-owner-password");
  }
  if (link) {
    link.className = hasLocal ? "owner-link" : "btn btn-outline-owner";
    link.textContent = "Ir al acceso";
  }
}

function renderAccount() {
  const personal = qs("#profile-personal");
  const properties = qs("#profile-properties");
  if (!personal || !properties) return;

  renderProfileHero();
  document.querySelectorAll("#view-account .owner-card-icon[data-icon]").forEach((el) => {
    const name = el.getAttribute("data-icon");
    if (!el.dataset.iconReady) {
      el.innerHTML = iconSvg(name, 18);
      el.dataset.iconReady = "1";
    }
  });

  if (state.sections.profile === "loading" && !state.profile && !state.user) {
    personal.innerHTML = `<h3><span class="owner-card-icon" data-icon="user" aria-hidden="true"></span> Información personal</h3>${skeletonInline()}`;
    properties.innerHTML = `<h3><span class="owner-card-icon" data-icon="building" aria-hidden="true"></span> Propiedades relacionadas</h3>${skeletonInline()}`;
    renderSecurity();
    return;
  }

  const p = state.profile;
  const user = state.user;
  if (!p && !user) {
    personal.innerHTML = errorHtml("No pudimos cargar tu perfil", "Intenta nuevamente.", "account");
    properties.innerHTML = "";
    renderSecurity();
    return;
  }

  const name = p?.displayName || user?.displayName || "Propietario";
  const email = p?.email || user?.email || "—";
  const phone = p?.phone || null;
  const props = p?.properties || [];

  personal.innerHTML = `
    <h3><span class="owner-card-icon" data-icon="user" aria-hidden="true"></span> Información personal</h3>
    <dl class="owner-dl">
      <dt>Nombre</dt><dd>${escapeHtml(name)}</dd>
      <dt>Correo electrónico</dt><dd>${escapeHtml(email)}</dd>
      <dt>Teléfono</dt><dd>${escapeHtml(phone || "Sin teléfono registrado")}</dd>
    </dl>`;

  properties.innerHTML = `
    <h3><span class="owner-card-icon" data-icon="building" aria-hidden="true"></span> Propiedades relacionadas</h3>
    ${
      props.length
        ? `<ul class="owner-prop-list">${props
            .map(
              (x) =>
                `<li><span class="owner-prop-list__name">${escapeHtml(x.name)}</span>${
                  x.code ? `<span class="owner-prop-list__code">${escapeHtml(x.code)}</span>` : ""
                }${x.isCurrent ? `<span class="owner-badge owner-badge--ok">Actual</span>` : ""}</li>`
            )
            .join("")}</ul>`
        : `<p class="owner-meta">No hay propiedades asociadas.</p>`
    }`;

  renderSecurity();

  document.querySelectorAll("#view-account .owner-card-icon[data-icon]").forEach((el) => {
    const iconName = el.getAttribute("data-icon");
    el.innerHTML = iconSvg(iconName, 18);
  });
}

function renderChromeContext() {
  const ph = activePh();
  const kicker = qs("#owner-ph-kicker");
  const pano = qs("#owner-pano");
  const media = qs("#owner-pano-media");
  const lede = qs("#owner-lede");
  const hello = qs("#owner-hello");

  if (kicker) kicker.textContent = ph?.name || "Tu portal";
  if (lede) {
    lede.textContent = nextAttentionCopy();
  }
  if (hello && (state.profile || state.user)) {
    const name = state.profile?.displayName || state.user?.displayName || "Propietario";
    hello.textContent = `Hola, ${name}`;
  }

  const authorized =
    state.phDetail?.coverImageUrl ||
    state.phDetail?.imageUrl ||
    state.phDetail?.photoUrl ||
    state.phDetail?.heroImageUrl ||
    null;
  if (pano && media) {
    if (authorized) {
      media.style.backgroundImage = `url("${authorized}")`;
      pano.dataset.photoKind = "ph";
      media.setAttribute("role", "img");
      media.setAttribute("aria-label", ph?.name ? `Foto de ${ph.name}` : "Foto del PH");
    } else {
      media.style.backgroundImage = `url("${BRAND_COVER}")`;
      pano.dataset.photoKind = "brand";
      media.setAttribute("aria-hidden", "true");
      media.removeAttribute("aria-label");
    }
  }
}

function resolveHomeNext() {
  const raw = state.next || upcomingEvents()[0] || null;
  const st = String(raw?.status || "");
  if (!raw || ["Completed", "Cancelled", "Draft"].includes(st)) return null;
  return raw;
}

function nextAttentionCopy() {
  const next = resolveHomeNext();
  if (!next) return "Consulta tus unidades y el historial de asambleas.";
  const status = String(next.status || "");
  if (["InProgress", "Paused", "CheckIn"].includes(status)) {
    return "Tienes una asamblea que requiere tu atención ahora.";
  }
  return "Tienes una asamblea programada. Revisa fecha y convocatoria.";
}

function renderAll() {
  renderChromeContext();
  renderHome();
  renderAssemblies();
  renderUnits();
  renderAccount();
}

function cleanupModalTrap() {
  modalUi.untrap?.();
  modalUi.unbind?.();
  modalUi.untrap = null;
  modalUi.unbind = null;
}

function openDialogShell(dlg, { title, eyebrow }) {
  if (!dlg) return;
  if (dlg.parentElement !== document.body) document.body.appendChild(dlg);
  const titleEl = dlg.querySelector("h2");
  const eye = dlg.querySelector(".command-eyebrow");
  if (titleEl) titleEl.textContent = title || "";
  if (eye) eye.textContent = eyebrow || "";
  lockPageScroll(true);
  if (!dlg.open) {
    try {
      dlg.showModal();
    } catch {
      dlg.setAttribute("open", "");
    }
  }
  bindSheetViewport(dlg);
  cleanupModalTrap();
  modalUi.untrap = trapFocus(dlg);
  modalUi.unbind = wireSheetKeyboard(dlg);
  requestAnimationFrame(() => titleEl?.focus?.({ preventScroll: true }));
}

function closeDialog(dlg) {
  if (!dlg) return;
  if (dlg.open) {
    const active = document.activeElement;
    if (active && dlg.contains(active) && typeof active.blur === "function") {
      try {
        active.blur();
      } catch {
        /* ignore */
      }
    }
    dlg.close();
  } else {
    dlg.removeAttribute("open");
    lockPageScroll(false);
  }
}

function rememberOpenContext(openerEl, returnView) {
  modalUi.opener = openerEl || rememberOpener();
  modalUi.openerHref = openerEl?.getAttribute?.("href") || null;
  modalUi.openerUnitCode = openerEl?.getAttribute?.("data-unit-code") || null;
  modalUi.openerAssemblyId = openerEl?.getAttribute?.("data-assembly-id") || null;
  modalUi.openerKind = openerEl?.getAttribute?.("data-owner-open") || null;
  const root = document.documentElement;
  if (root.dataset.scrollLock === "1") {
    modalUi.scrollY = Number(root.dataset.scrollY || 0);
  } else {
    modalUi.scrollY = window.scrollY || window.pageYOffset || 0;
  }
  if (returnView) modalUi.returnView = returnView;
  else if (!state.route.modal) modalUi.returnView = state.route.view || "units";
}

function findOpenerControl() {
  const view = modalUi.returnView || visibleBaseView();
  const viewRoot = qs(`#${(VIEWS[view] || VIEWS.home).id}`);
  let target = modalUi.opener;
  if (target && document.contains(target)) return target;

  if (modalUi.openerUnitCode && viewRoot) {
    const code = modalUi.openerUnitCode;
    target = viewRoot.querySelector(
      `[data-owner-open="unit"][data-unit-code="${CSS.escape(code)}"]`
    );
    if (target) return target;
  }

  if (modalUi.openerAssemblyId && viewRoot) {
    const id = modalUi.openerAssemblyId;
    const kind = modalUi.openerKind === "convocation" ? "convocation" : "assembly";
    target = viewRoot.querySelector(
      `[data-owner-open="${kind}"][data-assembly-id="${CSS.escape(id)}"]`
    );
    if (target) return target;
  }

  if (modalUi.openerHref) {
    const href = modalUi.openerHref;
    target =
      [...(viewRoot?.querySelectorAll("a[data-owner-open][href]") || [])].find(
        (a) => a.getAttribute("href") === href
      ) ||
      [...document.querySelectorAll("a[data-owner-open][href]")].find(
        (a) => a.getAttribute("href") === href
      ) ||
      null;
    if (target) return target;
  }

  if (modalUi.openerKind === "photo") return qs("#btn-change-photo");
  if (modalUi.openerKind === "password") return qs("#btn-change-password");

  return qs(`#${(VIEWS[view] || VIEWS.home).id} h1`) || qs("#profile-hero-name");
}

function restoreFocusAfterClose() {
  if (modalUi._restoreFocusTimer) {
    clearTimeout(modalUi._restoreFocusTimer);
    modalUi._restoreFocusTimer = null;
  }
  const y = modalUi.scrollY || 0;
  const apply = () => {
    const target = findOpenerControl();
    if (target && target.tagName === "H1" && !target.hasAttribute("tabindex")) {
      target.setAttribute("tabindex", "-1");
    }
    restoreOpener(target);
    window.scrollTo({ top: y, left: 0, behavior: "instant" in document.documentElement ? "instant" : "auto" });
  };
  apply();
  // Dialog close + scroll unlock settle across frames; keep opener ids until done.
  requestAnimationFrame(() => {
    apply();
    modalUi._restoreFocusTimer = setTimeout(() => {
      apply();
      modalUi.opener = null;
      modalUi.openerHref = null;
      modalUi.openerUnitCode = null;
      modalUi.openerAssemblyId = null;
      modalUi.openerKind = null;
      modalUi._restoreFocusTimer = null;
    }, 50);
  });
}

function unitDetailHtml(unit) {
  if (!unit) {
    return (
      emptyHtml(
        "No encontramos esta unidad",
        "Es posible que no esté vinculada a tu cuenta o que el enlace no sea válido."
      ) +
      `<div class="mt-3"><button type="button" class="btn btn-outline-owner" data-close-modal="unit">Volver</button></div>`
    );
  }
  const active = unit.isActive !== false;
  return `<dl class="owner-dl">
      <dt>Código</dt><dd>${escapeHtml(unit.unitCode || unit.code || "—")}</dd>
      <dt>Propiedad horizontal</dt><dd>${escapeHtml(unit.propertyHorizontalName || "—")}</dd>
      ${unit.tower ? `<dt>Torre</dt><dd>${escapeHtml(unit.tower)}</dd>` : ""}
      <dt>Estado</dt><dd><span class="owner-badge ${active ? "owner-badge--ok" : "owner-badge--done"}">${active ? "Activa" : "Inactiva"}</span></dd>
      <dt>Participación</dt><dd>${formatPercent(unit.sharePercent)}</dd>
      <dt>Coeficiente</dt><dd>${formatPercent(unit.unitCoefficientPercent)}</dd>
    </dl>`;
}

function assemblyDetailHtml(ev, { mode = "detail" } = {}) {
  if (!ev) {
    return (
      emptyHtml(
        mode === "convocation" ? "Convocatoria no disponible" : "Detalle no disponible",
        "No tenemos información autorizada para este registro, o ya no está visible en tu portal."
      ) +
      `<div class="mt-3"><button type="button" class="btn btn-outline-owner" data-close-modal="assembly">Volver</button></div>`
    );
  }
  const badge = statusBadge(ev);
  const when = formatEventWhen(ev);
  const id = encodeURIComponent(ev.assemblyId || ev.id);
  if (mode === "convocation") {
    const sent = String(ev.convocationStatus || "").toLowerCase() === "sent";
    return `<div class="owner-convocation">
      <dl class="owner-dl">
        <dt>Asamblea</dt><dd>${escapeHtml(ev.title || "Asamblea")}</dd>
        <dt>Fecha</dt><dd>${escapeHtml(when.day)}</dd>
        <dt>Hora (Panamá)</dt><dd>${escapeHtml(when.time)}</dd>
        <dt>Modalidad</dt><dd>${escapeHtml(modalityLabel(ev.modality))}</dd>
        <dt>Estado</dt><dd>${escapeHtml(badge.label)}</dd>
        <dt>Ubicación</dt><dd>${escapeHtml(ev.locationText || (String(ev.modality || "").toUpperCase() === "VIRTUAL" ? "Virtual" : "Por confirmar"))}</dd>
        <dt>Convocatoria</dt><dd>${escapeHtml(sent ? "Enviada" : ev.convocationStatus || "Pendiente o no publicada")}</dd>
      </dl>
      ${
        !sent
          ? `<div class="owner-empty owner-empty--compact mt-2"><p>Aún no hay un documento de convocatoria publicado para ti. Conservamos el resumen autorizado con la información disponible.</p></div>`
          : ""
      }
    </div>`;
  }
  return `<dl class="owner-dl">
      <dt>Título</dt><dd>${escapeHtml(ev.title || "Asamblea")}</dd>
      <dt>Fecha</dt><dd>${escapeHtml(when.day)}</dd>
      <dt>Hora (Panamá)</dt><dd>${escapeHtml(when.time)}</dd>
      <dt>Modalidad</dt><dd>${escapeHtml(modalityLabel(ev.modality))}</dd>
      <dt>Estado</dt><dd><span class="owner-badge ${badge.cls}">${escapeHtml(badge.label)}</span></dd>
      ${ev.locationText ? `<dt>Ubicación</dt><dd>${escapeHtml(ev.locationText)}</dd>` : ""}
    </dl>
    <div class="owner-asm-row__actions mt-3">
      ${
        isLive(ev)
          ? `<a class="btn btn-primary" href="/assembly.html?assemblyId=${id}">Entrar a la asamblea</a>`
          : ""
      }
      ${
        canShowConvocation(ev)
          ? `<a class="btn btn-ghost-owner" href="#assemblies/${id}/convocatoria" data-owner-open="convocation" data-assembly-id="${escapeHtml(String(ev.assemblyId || ev.id))}" data-title="${escapeHtml(ev.title || "Asamblea")}" data-when="${escapeHtml(when.label)}">Ver convocatoria</a>`
          : ""
      }
    </div>`;
}

function seedAssemblyFromLink(el) {
  if (!el) return null;
  const id = el.getAttribute("data-assembly-id");
  if (!id) return null;
  const existing = findEvent(id);
  if (existing) return existing;
  return {
    assemblyId: id,
    title: el.getAttribute("data-title") || "Asamblea",
    scheduledAtUtc: null,
    _seedWhen: el.getAttribute("data-when") || "",
    status: "Scheduled",
    modality: ""
  };
}

async function syncUnitModal() {
  const dlg = qs("#dlg-owner-unit");
  const body = qs("#owner-unit-body");
  if (!dlg || !body) return;
  if (state.route.modal !== "unit" || !state.route.unitCode) {
    if (dlg.open && !modalUi.closingByUi) {
      modalUi.closingByUi = true;
      closeDialog(dlg);
    }
    return;
  }
  const token = ++modalUi.unitToken;
  const code = state.route.unitCode;
  openDialogShell(dlg, { title: `Unidad ${code}`, eyebrow: "Detalle de unidad" });
  const unit = findUnit(code);
  if (unit) {
    body.innerHTML = unitDetailHtml(unit);
    return;
  }
  body.innerHTML = loadingBlock("Cargando detalle…");
  if (!state.profile && state.loading) return;
  if (token !== modalUi.unitToken) return;
  if (state.route.modal !== "unit" || state.route.unitCode !== code) return;
  body.innerHTML = unitDetailHtml(findUnit(code));
}

async function syncAssemblyModal({ seed = null } = {}) {
  const dlg = qs("#dlg-owner-assembly");
  const body = qs("#owner-asm-body");
  const foot = qs("#owner-asm-foot");
  if (!dlg || !body) return;
  const mode = state.route.modal;
  if (mode !== "assembly" && mode !== "convocation") {
    if (dlg.open && !modalUi.closingByUi) {
      modalUi.closingByUi = true;
      closeDialog(dlg);
    }
    return;
  }
  const token = ++modalUi.assemblyToken;
  const id = state.route.assemblyId;
  const isConv = mode === "convocation";
  let ev = seed && String(seed.assemblyId || seed.id) === String(id) ? seed : findEvent(id);

  const title = isConv
    ? `Convocatoria · ${ev?.title || "Asamblea"}`
    : ev?.title || "Detalle de asamblea";
  openDialogShell(dlg, {
    title,
    eyebrow: isConv ? "Documento autorizado" : "Asamblea"
  });
  if (foot) {
    foot.innerHTML = `<button type="button" class="btn btn-outline-owner" data-close-modal="assembly">Volver</button>`;
  }

  if (ev && (ev.scheduledAtUtc || ev._seedWhen)) {
    if (ev._seedWhen && !ev.scheduledAtUtc) {
      body.innerHTML = `<p class="owner-meta mb-2">${escapeHtml(ev._seedWhen)}</p>${loadingBlock(
        isConv ? "Cargando convocatoria…" : "Cargando detalle…"
      )}`;
    } else {
      body.innerHTML = assemblyDetailHtml(ev, { mode: isConv ? "convocation" : "detail" });
    }
  } else {
    body.innerHTML = loadingBlock(isConv ? "Cargando convocatoria…" : "Cargando detalle…");
  }

  try {
    const fetched = await api(`/api/calendar/events/${encodeURIComponent(id)}`);
    if (token !== modalUi.assemblyToken) return;
    if (state.route.modal !== mode || state.route.assemblyId !== id) return;
    if (fetched) {
      ev = fetched;
      const idx = state.events.findIndex((e) => String(e.assemblyId || e.id) === String(id));
      if (idx >= 0) state.events[idx] = { ...state.events[idx], ...fetched };
      else state.events.push(fetched);
    }
  } catch (err) {
    if (token !== modalUi.assemblyToken) return;
    if (state.route.modal !== mode || state.route.assemblyId !== id) return;
    if (!ev || !ev.scheduledAtUtc) {
      body.innerHTML =
        emptyHtml(
          isConv ? "Convocatoria no disponible" : "Detalle no disponible",
          err?.message || "No pudimos cargar este registro."
        ) +
        `<div class="mt-3"><button type="button" class="btn btn-outline-owner" data-retry-assembly="${escapeHtml(id)}">Reintentar</button>
         <button type="button" class="btn btn-ghost-owner" data-close-modal="assembly">Volver</button></div>`;
      return;
    }
  }

  if (token !== modalUi.assemblyToken) return;
  if (state.route.modal !== mode || state.route.assemblyId !== id) return;
  qs("#owner-asm-title").textContent = isConv
    ? `Convocatoria · ${ev?.title || "Asamblea"}`
    : ev?.title || "Asamblea";
  body.innerHTML = assemblyDetailHtml(ev, { mode: isConv ? "convocation" : "detail" });
}

function closeOwnerModal(kind) {
  modalUi.closingByUi = true;
  if (kind === "photo") {
    closeDialog(qs("#dlg-owner-photo"));
    return;
  }
  if (kind === "password") {
    closeDialog(qs("#dlg-owner-password"));
    return;
  }
  const unitDlg = qs("#dlg-owner-unit");
  const asmDlg = qs("#dlg-owner-assembly");
  if (kind === "unit" || unitDlg?.open) closeDialog(unitDlg);
  if (kind === "assembly" || asmDlg?.open) closeDialog(asmDlg);
  const fallbackView =
    kind === "unit"
      ? modalUi.returnView === "home"
        ? "home"
        : "units"
      : modalUi.returnView === "home"
        ? "home"
        : "assemblies";
  setHash(
    { view: fallbackView, unitCode: null, assemblyId: null, modal: null },
    { replace: false, lockMs: 0 }
  );
  // Focus restore runs from the dialog `close` listener to avoid a double clear.
}

function setFieldError(id, message) {
  const el = qs(id);
  if (!el) return;
  if (message) {
    el.hidden = false;
    el.textContent = message;
  } else {
    el.hidden = true;
    el.textContent = "";
  }
  const fields =
    id === "#owner-password-error"
      ? ["#owner-pw-current", "#owner-pw-new", "#owner-pw-confirm"]
      : id === "#owner-photo-error"
        ? ["#owner-photo-file"]
        : [];
  fields.forEach((sel) => {
    const field = qs(sel);
    if (!field) return;
    if (message) {
      field.setAttribute("aria-invalid", "true");
      field.setAttribute("aria-describedby", id.slice(1));
    } else {
      field.removeAttribute("aria-invalid");
      field.removeAttribute("aria-describedby");
    }
  });
}

function resetPhotoDialog() {
  const form = qs("#form-owner-photo");
  form?.reset();
  const preview = qs("#owner-photo-preview");
  if (preview) {
    preview.style.backgroundImage = "";
    preview.textContent = initials(state.user?.displayName || state.user?.email || "PR");
    preview.classList.remove("owner-avatar--photo");
  }
  setFieldError("#owner-photo-error", "");
  const save = qs("#owner-photo-save");
  if (save) save.disabled = false;
}

function openPhotoDialog(opener) {
  rememberOpenContext(opener || qs("#btn-change-photo"), "account");
  modalUi.openerKind = "photo";
  resetPhotoDialog();
  const url = avatarCacheBust(state.user?.avatarUrl);
  const preview = qs("#owner-photo-preview");
  if (preview && url) {
    preview.classList.add("owner-avatar--photo");
    preview.style.backgroundImage = `url("${String(url).replace(/"/g, "%22")}")`;
    preview.textContent = "";
  }
  openDialogShell(qs("#dlg-owner-photo"), { title: "Cambiar foto", eyebrow: "Tu cuenta" });
  requestAnimationFrame(() => qs("#owner-photo-file")?.focus?.());
}

function resetPasswordDialog() {
  const form = qs("#form-owner-password");
  form?.reset();
  setFieldError("#owner-password-error", "");
  const ok = qs("#owner-password-ok");
  if (ok) {
    ok.hidden = true;
    ok.textContent = "";
  }
  document.querySelectorAll("#dlg-owner-password [data-toggle-password]").forEach((btn) => {
    const id = btn.getAttribute("data-toggle-password");
    const input = id ? qs(`#${id}`) : null;
    if (input) input.type = "password";
    btn.setAttribute("aria-pressed", "false");
    btn.setAttribute("aria-label", "Mostrar contraseña");
    btn.textContent = "Ver";
  });
  const save = qs("#owner-password-save");
  if (save) {
    save.disabled = false;
    save.hidden = false;
  }
}

function openPasswordDialog(opener) {
  rememberOpenContext(opener || qs("#btn-change-password"), "account");
  modalUi.openerKind = "password";
  resetPasswordDialog();
  openDialogShell(qs("#dlg-owner-password"), { title: "Cambiar contraseña", eyebrow: "Seguridad" });
  requestAnimationFrame(() => qs("#owner-pw-current")?.focus?.());
}

function previewSelectedPhoto(file) {
  const preview = qs("#owner-photo-preview");
  if (!preview || !file) return;
  const reader = new FileReader();
  reader.onload = () => {
    preview.classList.add("owner-avatar--photo");
    preview.style.backgroundImage = `url("${reader.result}")`;
    preview.textContent = "";
  };
  reader.readAsDataURL(file);
}

async function inspectImageFile(file) {
  try {
    const bitmap = await createImageBitmap(file);
    const width = bitmap.width;
    const height = bitmap.height;
    bitmap.close?.();
    return { width, height };
  } catch {
    throw new Error("El archivo no es una imagen válida.");
  }
}

async function submitPhotoChange(e) {
  e.preventDefault();
  const input = qs("#owner-photo-file");
  const file = input?.files?.[0];
  const save = qs("#owner-photo-save");
  setFieldError("#owner-photo-error", "");
  if (!file) {
    setFieldError("#owner-photo-error", "Selecciona una imagen JPG, PNG o WebP.");
    return;
  }
  if (file.size > 2 * 1024 * 1024) {
    setFieldError("#owner-photo-error", "La imagen supera 2 MB.");
    return;
  }
  const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
  if (file.type && !allowed.includes(file.type)) {
    setFieldError("#owner-photo-error", "Formato no permitido. Usa JPG, PNG o WebP.");
    return;
  }
  let dims;
  try {
    dims = await inspectImageFile(file);
  } catch (err) {
    setFieldError("#owner-photo-error", err?.message || "El archivo no es una imagen válida.");
    return;
  }
  if (dims.width < 32 || dims.height < 32) {
    setFieldError("#owner-photo-error", "La imagen debe medir al menos 32×32 píxeles.");
    return;
  }
  if (dims.width > 8192 || dims.height > 8192) {
    setFieldError("#owner-photo-error", "La imagen no puede superar 8192×8192 píxeles.");
    return;
  }
  const previousUrl = state.user?.avatarUrl || null;
  const previousDisplay = state.user?.avatarDisplayUrl || null;
  const fd = new FormData();
  fd.append("file", file);
  if (save) save.disabled = true;
  try {
    const res = await api("/api/auth/me/avatar", { method: "POST", body: fd });
    const stored = avatarCanonicalUrl(res?.avatarUrl || res?.AvatarUrl || "");
    const nextUrl = avatarCacheBust(stored);
    if (state.user) {
      state.user = { ...state.user, avatarUrl: stored, avatarDisplayUrl: nextUrl };
      rememberMe({ ...state.user, avatarUrl: stored, avatarDisplayUrl: undefined });
    }
    const label = state.user?.displayName || state.user?.email || "Propietario";
    applyAvatarElement(qs("#user-avatar"), { url: nextUrl, label });
    applyAvatarElement(qs("#profile-avatar"), { url: nextUrl, label });
    closeOwnerModal("photo");
  } catch (err) {
    if (state.user) {
      state.user = { ...state.user, avatarUrl: previousUrl, avatarDisplayUrl: previousDisplay };
      rememberMe({ ...state.user, avatarUrl: avatarCanonicalUrl(previousUrl) || null });
    }
    syncAvatars();
    setFieldError("#owner-photo-error", err?.message || "No pudimos guardar la foto.");
  } finally {
    if (save) save.disabled = false;
  }
}

async function submitPasswordChange(e) {
  e.preventDefault();
  const current = qs("#owner-pw-current")?.value || "";
  const next = qs("#owner-pw-new")?.value || "";
  const confirm = qs("#owner-pw-confirm")?.value || "";
  const save = qs("#owner-password-save");
  const ok = qs("#owner-password-ok");
  setFieldError("#owner-password-error", "");
  if (ok) {
    ok.hidden = true;
    ok.textContent = "";
  }
  if (!current || !next || !confirm) {
    setFieldError("#owner-password-error", "Completa todos los campos.");
    return;
  }
  if (next !== confirm) {
    setFieldError("#owner-password-error", "La confirmación no coincide con la nueva contraseña.");
    return;
  }
  if (save) save.disabled = true;
  try {
    const res = await api("/api/auth/change-password", {
      method: "POST",
      body: { currentPassword: current, newPassword: next }
    });
    resetPasswordDialog();
    if (ok) {
      ok.hidden = false;
      ok.textContent = res?.detail || "Contraseña actualizada.";
    }
    if (save) save.hidden = true;
    setTimeout(() => closeOwnerModal("password"), 900);
  } catch (err) {
    setFieldError("#owner-password-error", err?.message || "No pudimos cambiar la contraseña.");
  } finally {
    if (save && !save.hidden) save.disabled = false;
  }
}

function applyRoute({ fromHash = true, seed = null } = {}) {
  if (fromHash) {
    const next = parseHash();
    if (next.modal && !state.route.modal) {
      rememberOpenContext(document.activeElement, state.route.view || next.view);
    }
    state.route = next;
  }
  showView(visibleBaseView());
  remountNav();

  if (state.route.modal === "unit") {
    void syncUnitModal();
  } else if (state.route.modal === "assembly" || state.route.modal === "convocation") {
    void syncAssemblyModal({ seed });
  } else {
    const unitDlg = qs("#dlg-owner-unit");
    const asmDlg = qs("#dlg-owner-assembly");
    if (unitDlg?.open && !modalUi.closingByUi) {
      modalUi.closingByUi = true;
      closeDialog(unitDlg);
    }
    if (asmDlg?.open && !modalUi.closingByUi) {
      modalUi.closingByUi = true;
      closeDialog(asmDlg);
    }
  }
}

function openOwnerTarget(el) {
  const kind = el.getAttribute("data-owner-open");
  // Origin comes from the visible module at open time; do not reuse a stale returnView.
  if (!state.route.modal) {
    const base = visibleBaseView();
    const returnView =
      kind === "unit" ? (base === "home" ? "home" : "units") : base === "home" ? "home" : "assemblies";
    rememberOpenContext(el, returnView);
  } else {
    modalUi.opener = el;
    modalUi.openerHref = el.getAttribute("href");
    modalUi.openerUnitCode = el.getAttribute("data-unit-code");
    modalUi.openerAssemblyId = el.getAttribute("data-assembly-id");
    modalUi.openerKind = el.getAttribute("data-owner-open");
  }

  const replacingModal = Boolean(state.route.modal);
  if (kind === "unit") {
    const code = el.getAttribute("data-unit-code") || "";
    const next = { view: "units", unitCode: code, assemblyId: null, modal: "unit" };
    state.route = next;
    showView(visibleBaseView());
    remountNav();
    void syncUnitModal();
    // Replace when swapping modals so a stale history entry cannot revive the previous pick.
    setHash(next, { apply: false, lockMs: 400, replace: replacingModal });
    return;
  }

  const id = el.getAttribute("data-assembly-id") || "";
  const seed = seedAssemblyFromLink(el);
  const modal = kind === "convocation" ? "convocation" : "assembly";
  const next = { view: "assemblies", unitCode: null, assemblyId: id, modal };
  state.route = next;
  showView(visibleBaseView());
  remountNav();
  void syncAssemblyModal({ seed });
  setHash(next, { apply: false, lockMs: 400, replace: replacingModal });
}

async function loadPortalData() {
  state.loading = true;
  state.loadError = null;
  state.sectionError = null;
  state.sections = { profile: "loading", units: "loading", assemblies: "loading" };
  renderAll();
  try {
    const profile = await api("/api/ph/me/owner-profile").catch(() => null);
    state.profile = profile;
    state.sections.profile = "ready";
    state.sections.units = "ready";
    renderChromeContext();
    renderAccount();
    renderUnits();
    renderHome();

    const ph = activePh();
    if (ph?.propertyHorizontalId) {
      state.phDetail = await api(`/api/ph/${encodeURIComponent(ph.propertyHorizontalId)}`).catch(() => null);
      renderChromeContext();
    }

    const from = new Date();
    from.setUTCMonth(from.getUTCMonth() - 2);
    const to = new Date();
    to.setUTCMonth(to.getUTCMonth() + 6);
    const q = new URLSearchParams({
      from: from.toISOString(),
      to: to.toISOString()
    });
    if (ph?.propertyHorizontalId) q.set("propertyHorizontalId", ph.propertyHorizontalId);

    const [nextRes, eventsRes] = await Promise.all([
      api("/api/calendar/next").catch(() => null),
      api(`/api/calendar/events?${q}`).catch((err) => {
        state.sectionError = "assemblies";
        throw err;
      })
    ]);

    state.next = nextRes?.next || null;
    state.events = eventsRes?.events || [];
    state.sections.assemblies = "ready";
    renderChromeContext();
    renderHome();
    renderAssemblies();
  } catch (err) {
    state.loadError = err?.message || "Error de carga";
    state.sections.assemblies = "error";
    console.error("[owner-portal]", err);
  } finally {
    state.loading = false;
    renderAll();
    applyRoute({ fromHash: false });
  }
}

function wireBottomNavIcons() {
  document.querySelectorAll("#owner-bottom-nav [data-icon]").forEach((el) => {
    const name = el.getAttribute("data-icon");
    el.innerHTML = iconSvg(name, 20);
  });
}

function wireChrome() {
  modalUi.chromeAbort?.abort();
  const ac = new AbortController();
  modalUi.chromeAbort = ac;
  const { signal } = ac;

  qs("#btn-logout")?.addEventListener(
    "click",
    async (e) => {
      e.preventDefault();
      await logout();
      location.href = "/";
    },
    { signal }
  );

  qs("#btn-nav-toggle")?.addEventListener(
    "click",
    () => {
      const menu = qs("#sidebar-menu");
      const btn = qs("#btn-nav-toggle");
      if (!menu || !btn) return;
      const open = menu.classList.toggle("show");
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    },
    { signal }
  );

  const onLocationRoute = () => {
    const next = parseHash();
    const wanted = desiredHash(state.route);
    const locked = Date.now() < modalUi.routeLockUntil;

    if (modalUi.suppressHashApply) {
      modalUi.suppressHashApply = false;
      if (routesEqual(next, state.route) || location.hash === wanted) return;
    }

    // Stale hashchange / history entry from an earlier click must not win.
    if (locked && location.hash !== wanted) {
      modalUi.suppressHashApply = true;
      history.replaceState(null, "", `${location.pathname}${location.search}${wanted}`);
      queueMicrotask(() => {
        modalUi.suppressHashApply = false;
      });
      return;
    }
    if (routesEqual(next, state.route)) return;

    applyRoute({ fromHash: true });
  };
  window.addEventListener("hashchange", onLocationRoute, { signal });
  window.addEventListener("popstate", onLocationRoute, { signal });

  document.addEventListener(
    "click",
    (e) => {
      const retryAsm = e.target.closest?.("[data-retry-assembly]");
      if (retryAsm) {
        e.preventDefault();
        void syncAssemblyModal();
        return;
      }

      const closeBtn = e.target.closest?.("[data-close-modal]");
      if (closeBtn) {
        e.preventDefault();
        closeOwnerModal(closeBtn.getAttribute("data-close-modal"));
        return;
      }

      const profileAction = e.target.closest?.("[data-owner-profile-action]");
      if (profileAction) {
        e.preventDefault();
        const action = profileAction.getAttribute("data-owner-profile-action");
        if (action === "photo") openPhotoDialog(profileAction);
        else if (action === "password") openPasswordDialog(profileAction);
        return;
      }

      const togglePw = e.target.closest?.("[data-toggle-password]");
      if (togglePw) {
        e.preventDefault();
        const id = togglePw.getAttribute("data-toggle-password");
        const input = id ? qs(`#${id}`) : null;
        if (!input) return;
        const show = input.type === "password";
        input.type = show ? "text" : "password";
        togglePw.setAttribute("aria-pressed", show ? "true" : "false");
        togglePw.setAttribute("aria-label", show ? "Ocultar contraseña" : "Mostrar contraseña");
        togglePw.textContent = show ? "Ocultar" : "Ver";
        return;
      }

      const retry = e.target.closest?.("[data-retry]");
      if (retry) {
        e.preventDefault();
        loadPortalData();
        return;
      }

      const open = e.target.closest?.("[data-owner-open]");
      if (open) {
        e.preventDefault();
        openOwnerTarget(open);
      }
    },
    { signal }
  );

  qs("#owner-unit-close")?.addEventListener(
    "click",
    (e) => {
      e.preventDefault();
      closeOwnerModal("unit");
    },
    { signal }
  );
  qs("#owner-asm-close")?.addEventListener(
    "click",
    (e) => {
      e.preventDefault();
      closeOwnerModal("assembly");
    },
    { signal }
  );

  const onDialogClose = (kind) => {
    cleanupModalTrap();
    lockPageScroll(false);
    const wasUi = modalUi.closingByUi;
    modalUi.closingByUi = false;
    if (!wasUi) {
      const fallbackView =
        kind === "unit"
          ? modalUi.returnView === "home"
            ? "home"
            : "units"
          : modalUi.returnView === "home"
            ? "home"
            : "assemblies";
      if (state.route.modal) {
        setHash(
          { view: fallbackView, unitCode: null, assemblyId: null, modal: null },
          { replace: true, lockMs: 0 }
        );
      }
    }
    requestAnimationFrame(() => restoreFocusAfterClose());
  };

  document.querySelectorAll("#owner-bottom-nav a[href^='#']").forEach((a) => {
    a.addEventListener(
      "click",
      (e) => {
        e.preventDefault();
        const view = (a.getAttribute("href") || "#home").replace(/^#/, "") || "home";
        if (!VIEWS[view]) return;
        setHash(
          { view, unitCode: null, assemblyId: null, modal: null },
          { replace: false, lockMs: 0 }
        );
      },
      { signal }
    );
  });

  qs("#dlg-owner-unit")?.addEventListener("close", () => onDialogClose("unit"), { signal });
  qs("#dlg-owner-assembly")?.addEventListener("close", () => onDialogClose("assembly"), { signal });

  const onProfileDialogClose = () => {
    cleanupModalTrap();
    lockPageScroll(false);
    modalUi.closingByUi = false;
    requestAnimationFrame(() => restoreFocusAfterClose());
  };
  qs("#dlg-owner-photo")?.addEventListener("close", onProfileDialogClose, { signal });
  qs("#dlg-owner-password")?.addEventListener("close", onProfileDialogClose, { signal });

  qs("#dlg-owner-unit")?.addEventListener(
    "cancel",
    (ev) => {
      ev.preventDefault();
      closeOwnerModal("unit");
    },
    { signal }
  );
  qs("#dlg-owner-assembly")?.addEventListener(
    "cancel",
    (ev) => {
      ev.preventDefault();
      closeOwnerModal("assembly");
    },
    { signal }
  );
  qs("#dlg-owner-photo")?.addEventListener(
    "cancel",
    (ev) => {
      ev.preventDefault();
      closeOwnerModal("photo");
    },
    { signal }
  );
  qs("#dlg-owner-password")?.addEventListener(
    "cancel",
    (ev) => {
      ev.preventDefault();
      closeOwnerModal("password");
    },
    { signal }
  );

  qs("#owner-photo-file")?.addEventListener(
    "change",
    () => {
      const file = qs("#owner-photo-file")?.files?.[0];
      setFieldError("#owner-photo-error", "");
      if (file) previewSelectedPhoto(file);
    },
    { signal }
  );
  qs("#form-owner-photo")?.addEventListener("submit", (ev) => void submitPhotoChange(ev), { signal });
  qs("#form-owner-password")?.addEventListener("submit", (ev) => void submitPasswordChange(ev), { signal });
}

function initials(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "PR";
  return ((parts[0][0] || "") + (parts[1]?.[0] || parts[0][1] || "")).toUpperCase();
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
    const dest = "/dashboard.html";
    if (window.__ASAM_HYBRID__) {
      queueMicrotask(() => {
        import("./hybrid-router.js")
          .then((m) => m.softNavigate(dest))
          .catch(() => {
            location.href = dest;
          });
      });
      return;
    }
    location.href = dest;
    return;
  }

  if (!isOwnerPortalUser(user) && !hasPermission(user, "portal:self") && !hasPermission(user, "vote:cast")) {
    showError("No tienes acceso al portal de propietario.");
    return;
  }

  state.user = user;
  const chip = qs("#user-chip");
  if (chip) chip.textContent = user.displayName || user.email || "Propietario";
  syncAvatars();
  if (qs("#nav-tenant")) qs("#nav-tenant").textContent = user.tenantCode || "Portal propietario";
  if (qs("#account-role-label")) qs("#account-role-label").textContent = user.displayName || user.email || "Cuenta";

  wireBottomNavIcons();
  wireChrome();
  applyRoute({ fromHash: true });
  await loadPortalData();
  try {
    const fresh = await me({ force: true });
    state.user = { ...state.user, ...fresh };
    rememberMe(state.user);
    syncAvatars();
    renderAccount();
  } catch {
    /* keep warm session */
  }

  try {
    const { ensureJoinSummonPresence } = await import("./join-summon-presence.js");
    await ensureJoinSummonPresence({
      user,
      onJoin: (payload) => {
        const id = payload?.assemblyId || payload?.AssemblyId;
        if (id) location.href = `/assembly.html?assemblyId=${encodeURIComponent(id)}`;
      },
      onDismiss: () => {}
    });
  } catch (err) {
    console.warn("join-summon presence unavailable", err);
  }
}

export async function mount(ctx = {}) {
  await init();
  await startHybridShell({
    mount,
    unmount,
    canLeave,
    dispose: unmount
  });
  void ctx;
}

export async function unmount() {
  cleanupModalTrap();
  modalUi.chromeAbort?.abort();
  modalUi.chromeAbort = null;
  lockPageScroll(false);
}

export async function canLeave() {
  return true;
}

export async function dispose() {
  await unmount();
}

if (!window.__ASAM_SOFT_MOUNTING__ && !window.__ASAM_HYBRID__) {
  mount().catch((error) => {
    console.error(error);
  });
}
