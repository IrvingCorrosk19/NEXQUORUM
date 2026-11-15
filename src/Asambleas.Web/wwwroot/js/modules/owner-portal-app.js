import { api } from "./api.js";
import { hasPermission, logout, me } from "./auth.js";
import { isOperator, isOwnerPortalUser } from "./roles.js?v=rbac2";
import { escapeHtml, formatDateTime, qs } from "./ui.js";
import { showPageError } from "./app-feedback.js";
import { mountIaShell } from "./ia-nav.js?v=own4";
import { utcIsoToPhLocalParts } from "./schedule-time.js";
import { startHybridShell } from "./hybrid-router.js";
import {
  bindSheetViewport,
  lockPageScroll,
  rememberOpener,
  restoreOpener,
  trapFocus,
  wireSheetKeyboard
} from "./query-guard.js?v=polish11";

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
  sectionError: null
};

const modalUi = {
  opener: null,
  scrollY: 0,
  returnView: "units",
  untrap: null,
  unbind: null,
  closingByUi: false
};

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

function setHash(partial, { replace = false } = {}) {
  const next = { ...state.route, ...partial };
  const desired = desiredHash(next);
  if (location.hash === desired) {
    state.route = next;
    applyRoute({ fromHash: false });
    return;
  }
  if (replace) {
    history.replaceState(null, "", desired);
    state.route = next;
    applyRoute({ fromHash: false });
    return;
  }
  location.hash = desired;
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
    return { day: "—", time: "—", label: formatDateTime(ev.scheduledAtUtc) };
  }
}

function isLive(ev) {
  const status = String(ev?.status || "");
  return ev?.canJoin || ["InProgress", "Paused", "CheckIn"].includes(status);
}

function isUpcoming(ev) {
  return ["Scheduled", "CheckIn", "InProgress", "Paused"].includes(String(ev?.status || ""));
}

function primaryHomeCta(ev) {
  if (isLive(ev) && (ev.canJoin || ["InProgress", "Paused", "CheckIn"].includes(String(ev.status)))) {
    return {
      kind: "join",
      href: `/assembly.html?assemblyId=${encodeURIComponent(ev.assemblyId || ev.id)}`,
      label: "Entrar a la asamblea",
      primary: true
    };
  }
  return {
    kind: "convocation",
    href: `#assemblies/${encodeURIComponent(ev.assemblyId || ev.id)}/convocatoria`,
    label: "Ver convocatoria",
    primary: true
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
    <button type="button" class="btn btn-secondary" data-retry="${escapeHtml(retryAttr)}">Reintentar</button>
  </div>`;
}

function skeletonList() {
  return `<div class="owner-skeleton owner-skeleton--list" aria-hidden="true"><span></span><span></span><span></span></div>`;
}

function skeletonInline() {
  return `<div class="owner-skeleton" aria-hidden="true"><span></span><span></span><span></span></div>`;
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

function remountNav() {
  const base = visibleBaseView();
  const meta = VIEWS[base] || VIEWS.home;
  const crumb =
    state.route.modal === "unit"
      ? "Detalle de unidad"
      : state.route.modal === "convocation"
        ? "Convocatoria"
        : state.route.modal === "assembly"
          ? "Detalle de asamblea"
          : meta.crumb;
  mountIaShell(
    { level: "global", user: state.user, current: activeNavKey() },
    { breadcrumbs: [{ label: "Mi portal", href: "/owner.html#home" }, { label: crumb }] }
  );
  const label = qs("#ia-context-label");
  if (label) label.textContent = crumb;
}

function showView(view) {
  const target = VIEWS[view] || VIEWS.home;
  Object.values(VIEWS).forEach((v) => {
    const el = qs(`#${v.id}`);
    if (el) el.hidden = v.id !== target.id;
  });
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

function renderUnitCard(u, { compact = false } = {}) {
  const code = u.unitCode || u.code || "—";
  const active = u.isActive !== false;
  return `<article class="owner-unit-card${compact ? " owner-unit-card--compact" : ""}">
    <div class="owner-unit-card__top">
      <h3>Unidad ${escapeHtml(code)}</h3>
      <span class="owner-badge ${active ? "owner-badge--ok" : "owner-badge--done"}">${active ? "Activa" : "Inactiva"}</span>
    </div>
    <p class="owner-meta">${escapeHtml(u.propertyHorizontalName || "—")}</p>
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
      <a class="btn btn-secondary" href="#units/${encodeURIComponent(code)}" data-owner-open="unit" data-unit-code="${escapeHtml(code)}">Ver detalle</a>
    </div>
  </article>`;
}

function renderAssemblyRow(ev) {
  const badge = statusBadge(ev);
  const when = formatEventWhen(ev);
  const id = encodeURIComponent(ev.assemblyId || ev.id);
  const join =
    isLive(ev) && (ev.canJoin || ["InProgress", "Paused", "CheckIn"].includes(String(ev.status)))
      ? `<a class="btn btn-primary" href="/assembly.html?assemblyId=${id}">Entrar a la asamblea</a>`
      : "";
  return `<article class="owner-asm-row" data-assembly-id="${escapeHtml(String(ev.assemblyId || ev.id))}">
    <div class="owner-asm-row__when" aria-label="${escapeHtml(when.label)}">
      <span class="owner-asm-row__day">${escapeHtml(when.day)}</span>
      <span class="owner-asm-row__time">${escapeHtml(when.time)}</span>
      <span class="owner-asm-row__tz">Panamá</span>
    </div>
    <div class="owner-asm-row__main">
      <h3>${escapeHtml(ev.title || "Asamblea")}</h3>
      <p class="owner-meta">${escapeHtml(ev.propertyHorizontalName || "—")}</p>
      <div class="owner-badges">
        <span class="owner-badge ${badge.cls}">${escapeHtml(badge.label)}</span>
        <span class="owner-badge owner-badge--neutral">${escapeHtml(modalityLabel(ev.modality))}</span>
      </div>
    </div>
    <div class="owner-asm-row__actions">
      ${join}
      <a class="btn btn-secondary" href="#assemblies/${id}" data-owner-open="assembly" data-assembly-id="${escapeHtml(String(ev.assemblyId || ev.id))}">Ver detalle</a>
      <a class="btn btn-ghost" href="#assemblies/${id}/convocatoria" data-owner-open="convocation" data-assembly-id="${escapeHtml(String(ev.assemblyId || ev.id))}">Ver convocatoria</a>
    </div>
  </article>`;
}

function renderNextFeature(next) {
  if (!next) {
    return emptyHtml(
      "No hay asambleas próximas",
      "Cuando haya una convocatoria o una asamblea en curso, aparecerá aquí.",
      `<a class="owner-link" href="#assemblies">Ir a Mis asambleas</a>`
    );
  }
  const badge = statusBadge(next);
  const when = formatEventWhen(next);
  const cta = primaryHomeCta(next);
  return `<div class="owner-next">
    <div class="owner-next__head">
      <h3>${escapeHtml(next.title || "Asamblea")}</h3>
      <span class="owner-badge ${badge.cls}">${escapeHtml(badge.label)}</span>
    </div>
    <dl class="owner-dl owner-dl--inline">
      <div><dt>Fecha</dt><dd>${escapeHtml(when.day)}</dd></div>
      <div><dt>Hora (Panamá)</dt><dd>${escapeHtml(when.time)}</dd></div>
      <div><dt>Modalidad</dt><dd>${escapeHtml(modalityLabel(next.modality))}</dd></div>
      <div><dt>Estado</dt><dd>${escapeHtml(badge.label)}</dd></div>
    </dl>
    <p class="owner-meta">${escapeHtml(next.propertyHorizontalName || "")}</p>
    <div class="owner-next__actions">
      <a class="btn ${cta.primary ? "btn-primary" : "btn-secondary"}" href="${cta.href}" ${
        cta.kind === "convocation"
          ? `data-owner-open="convocation" data-assembly-id="${escapeHtml(String(next.assemblyId || next.id))}"`
          : ""
      }>${escapeHtml(cta.label)}</a>
      <a class="btn btn-ghost" href="#assemblies/${encodeURIComponent(next.assemblyId || next.id)}" data-owner-open="assembly" data-assembly-id="${escapeHtml(String(next.assemblyId || next.id))}">Ver detalle</a>
    </div>
  </div>`;
}

function renderHome() {
  const nextBody = qs("#home-next-body");
  const unitsBody = qs("#home-units-body");
  const asmBody = qs("#home-asm-body");
  const nextCard = qs("#home-next");
  if (!nextBody || !unitsBody || !asmBody) return;

  if (state.loading && !state.profile && !state.events.length) {
    nextBody.innerHTML = skeletonInline();
    unitsBody.innerHTML = skeletonInline();
    asmBody.innerHTML = skeletonInline();
    nextCard?.classList.remove("owner-card--empty-next");
    return;
  }

  if (state.loadError) {
    nextBody.innerHTML = errorHtml("No pudimos cargar tu portal", "Intenta nuevamente.", "all");
    unitsBody.innerHTML = "";
    asmBody.innerHTML = "";
    return;
  }

  const next = state.next || upcomingEvents()[0] || null;
  nextBody.innerHTML = renderNextFeature(next);
  nextCard?.classList.toggle("owner-card--empty-next", !next);

  const units = state.profile?.units || [];
  if (!units.length) {
    unitsBody.innerHTML = emptyHtml(
      "No hay unidades vinculadas",
      "Cuando tu administración vincule una unidad a tu cuenta, la verás aquí."
    );
  } else {
    unitsBody.innerHTML = units.slice(0, 3).map((u) => renderUnitCard(u, { compact: true })).join("");
  }

  const up = upcomingEvents();
  const done = recentCompleted();
  asmBody.innerHTML = `
    <div class="owner-summary-row"><span>Próximas / en curso</span><span>${up.length}</span></div>
    <div class="owner-summary-row"><span>Finalizadas recientes</span><span>${done.length}</span></div>
    <div class="owner-summary-row"><span>Total visibles</span><span>${state.events.length}</span></div>
    ${
      up[0]
        ? `<p class="owner-meta mt-2 mb-0">Siguiente: <strong>${escapeHtml(up[0].title || "Asamblea")}</strong> · ${escapeHtml(formatEventWhen(up[0]).label)}</p>`
        : `<p class="owner-meta mt-2 mb-0"><a class="owner-link" href="#assemblies">Ver historial en Mis asambleas</a></p>`
    }`;
}

function renderAssemblies() {
  const el = qs("#assemblies-panel");
  if (!el) return;
  if (state.loading && !state.events.length) {
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
  if (state.loading && !state.profile) {
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

function renderAccount() {
  const el = qs("#account-panel");
  if (!el) return;
  if (state.loading && !state.profile) {
    el.innerHTML = skeletonList();
    return;
  }
  const p = state.profile;
  const user = state.user;
  if (!p && !user) {
    el.innerHTML = errorHtml("No pudimos cargar tu perfil", "Intenta nuevamente.", "account");
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
          ? `<ul class="owner-prop-list">${props
              .map(
                (x) =>
                  `<li><span class="owner-prop-list__name">${escapeHtml(x.name)}</span>${
                    x.code ? `<span class="owner-prop-list__code">${escapeHtml(x.code)}</span>` : ""
                  }${x.isCurrent ? `<span class="owner-badge owner-badge--ok">Actual</span>` : ""}</li>`
              )
              .join("")}</ul>`
          : `<p class="owner-meta">No hay propiedades asociadas.</p>`
      }
    </article>
    <article class="owner-account-card">
      <h3>Seguridad</h3>
      <p class="owner-meta mb-0">Si olvidaste tu contraseña, usa «¿Olvidaste tu contraseña?» en la pantalla de acceso. Usa «Cerrar sesión» en el menú de cuenta para terminar la sesión en este dispositivo.</p>
    </article>`;
}

function renderChromeContext() {
  const ph = activePh();
  const chip = qs("#owner-ph-chip");
  const kicker = qs("#owner-ph-kicker");
  if (chip) {
    if (ph?.name) {
      chip.hidden = false;
      chip.textContent = ph.name;
    } else {
      chip.hidden = true;
    }
  }
  if (kicker) kicker.textContent = ph?.name || "Portal del propietario";

  const media = qs("#owner-hero-media");
  const img = qs("#owner-hero-photo");
  const photo =
    state.phDetail?.coverImageUrl ||
    state.phDetail?.imageUrl ||
    state.phDetail?.photoUrl ||
    state.phDetail?.heroImageUrl ||
    null;
  if (media && img) {
    if (photo) {
      img.src = photo;
      img.alt = ph?.name ? `Foto de ${ph.name}` : "Foto del PH";
      media.hidden = false;
    } else {
      media.hidden = true;
      img.removeAttribute("src");
    }
  }
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
  modalUi.closingByUi = true;
  if (dlg.open) dlg.close();
  else {
    dlg.removeAttribute("open");
    lockPageScroll(false);
    restoreOpener(modalUi.opener);
    modalUi.opener = null;
    window.scrollTo(0, modalUi.scrollY || 0);
  }
}

function rememberOpenContext(openerEl, returnView) {
  modalUi.opener = openerEl || rememberOpener();
  modalUi.scrollY = window.scrollY || window.pageYOffset || 0;
  if (returnView) modalUi.returnView = returnView;
  else if (!state.route.modal) modalUi.returnView = state.route.view || "units";
}

function unitDetailHtml(unit) {
  if (!unit) {
    return emptyHtml(
      "No encontramos esta unidad",
      "Es posible que no esté vinculada a tu cuenta o que el enlace no sea válido."
    ) + `<div class="mt-3"><button type="button" class="btn btn-secondary" data-close-modal="unit">Volver</button></div>`;
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
    return emptyHtml(
      mode === "convocation" ? "Convocatoria no disponible" : "Detalle no disponible",
      "No tenemos información autorizada para este registro, o ya no está visible en tu portal."
    ) + `<div class="mt-3"><button type="button" class="btn btn-secondary" data-close-modal="assembly">Volver a Mis asambleas</button></div>`;
  }
  const badge = statusBadge(ev);
  const when = formatEventWhen(ev);
  const id = encodeURIComponent(ev.assemblyId || ev.id);
  if (mode === "convocation") {
    const sent = String(ev.convocationStatus || "").toLowerCase() === "sent";
    return `<div class="owner-convocation">
      <p class="owner-meta">Contenido autorizado de la convocatoria</p>
      <dl class="owner-dl">
        <dt>Asamblea</dt><dd>${escapeHtml(ev.title || "Asamblea")}</dd>
        <dt>Fecha</dt><dd>${escapeHtml(when.day)}</dd>
        <dt>Hora (Panamá)</dt><dd>${escapeHtml(when.time)}</dd>
        <dt>Modalidad</dt><dd>${escapeHtml(modalityLabel(ev.modality))}</dd>
        <dt>Estado</dt><dd>${escapeHtml(badge.label)}</dd>
        <dt>PH</dt><dd>${escapeHtml(ev.propertyHorizontalName || "—")}</dd>
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
      <dt>PH</dt><dd>${escapeHtml(ev.propertyHorizontalName || "—")}</dd>
      ${ev.locationText ? `<dt>Ubicación</dt><dd>${escapeHtml(ev.locationText)}</dd>` : ""}
    </dl>
    <div class="owner-asm-row__actions mt-3">
      ${
        isLive(ev) && (ev.canJoin || ["InProgress", "Paused", "CheckIn"].includes(String(ev.status)))
          ? `<a class="btn btn-primary" href="/assembly.html?assemblyId=${id}">Entrar a la asamblea</a>`
          : ""
      }
      <a class="btn btn-secondary" href="#assemblies/${id}/convocatoria" data-owner-open="convocation" data-assembly-id="${escapeHtml(String(ev.assemblyId || ev.id))}">Ver convocatoria</a>
    </div>`;
}

async function syncUnitModal() {
  const dlg = qs("#dlg-owner-unit");
  const body = qs("#owner-unit-body");
  if (!dlg || !body) return;
  if (state.route.modal !== "unit" || !state.route.unitCode) {
    if (dlg.open) closeDialog(dlg);
    return;
  }
  const code = state.route.unitCode;
  openDialogShell(dlg, { title: `Unidad ${code}`, eyebrow: "Detalle de unidad" });
  if (!state.profile && state.loading) {
    body.innerHTML = skeletonInline();
    return;
  }
  body.innerHTML = unitDetailHtml(findUnit(code));
}

async function syncAssemblyModal() {
  const dlg = qs("#dlg-owner-assembly");
  const body = qs("#owner-asm-body");
  const foot = qs("#owner-asm-foot");
  if (!dlg || !body) return;
  const mode = state.route.modal;
  if (mode !== "assembly" && mode !== "convocation") {
    if (dlg.open) closeDialog(dlg);
    return;
  }
  const id = state.route.assemblyId;
  const isConv = mode === "convocation";
  openDialogShell(dlg, {
    title: isConv ? "Convocatoria" : "Detalle de asamblea",
    eyebrow: isConv ? "Documento autorizado" : "Asamblea"
  });
  body.innerHTML = skeletonInline();
  if (foot) foot.innerHTML = `<button type="button" class="btn btn-secondary" data-close-modal="assembly">Volver a Mis asambleas</button>`;

  let ev = findEvent(id);
  try {
    const fetched = await api(`/api/calendar/events/${encodeURIComponent(id)}`);
    if (fetched) {
      ev = fetched;
      const idx = state.events.findIndex((e) => String(e.assemblyId || e.id) === String(id));
      if (idx >= 0) state.events[idx] = { ...state.events[idx], ...fetched };
      else state.events.push(fetched);
    }
  } catch (err) {
    if (!ev) {
      body.innerHTML =
        emptyHtml(
          isConv ? "Convocatoria no disponible" : "Detalle no disponible",
          err?.message || "No pudimos cargar este registro."
        ) +
        `<div class="mt-3"><button type="button" class="btn btn-secondary" data-retry-assembly="${escapeHtml(id)}">Reintentar</button>
         <button type="button" class="btn btn-ghost" data-close-modal="assembly">Volver</button></div>`;
      return;
    }
  }

  if (state.route.modal !== mode || state.route.assemblyId !== id) return;
  qs("#owner-asm-title").textContent = isConv
    ? `Convocatoria · ${ev?.title || "Asamblea"}`
    : ev?.title || "Asamblea";
  body.innerHTML = assemblyDetailHtml(ev, { mode: isConv ? "convocation" : "detail" });
}

function closeOwnerModal(kind) {
  modalUi.closingByUi = true;
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
  setHash({ view: fallbackView, unitCode: null, assemblyId: null, modal: null });
  requestAnimationFrame(() => {
    window.scrollTo(0, modalUi.scrollY || 0);
    restoreOpener(modalUi.opener);
  });
}

function applyRoute({ fromHash = true } = {}) {
  if (fromHash) {
    const next = parseHash();
    if (next.modal && !state.route.modal) {
      rememberOpenContext(document.activeElement, state.route.view || next.view);
    }
    state.route = next;
  }
  showView(visibleBaseView());
  remountNav();
  // Open modal shell on the same tick as the click (before async fetches).
  if (state.route.modal === "unit") {
    const dlg = qs("#dlg-owner-unit");
    const body = qs("#owner-unit-body");
    if (dlg && body && !dlg.open) {
      body.innerHTML = skeletonInline();
      openDialogShell(dlg, {
        title: `Unidad ${state.route.unitCode || ""}`,
        eyebrow: "Detalle de unidad"
      });
    }
  } else if (state.route.modal === "assembly" || state.route.modal === "convocation") {
    const dlg = qs("#dlg-owner-assembly");
    const body = qs("#owner-asm-body");
    if (dlg && body && !dlg.open) {
      body.innerHTML = skeletonInline();
      openDialogShell(dlg, {
        title: state.route.modal === "convocation" ? "Convocatoria" : "Detalle de asamblea",
        eyebrow: state.route.modal === "convocation" ? "Documento autorizado" : "Asamblea"
      });
    }
  }
  void syncUnitModal();
  void syncAssemblyModal();
}

async function loadPortalData() {
  state.loading = true;
  state.loadError = null;
  state.sectionError = null;
  renderAll();
  try {
    const profile = await api("/api/ph/me/owner-profile").catch(() => null);
    state.profile = profile;

    const ph = activePh();
    if (ph?.propertyHorizontalId) {
      state.phDetail = await api(`/api/ph/${encodeURIComponent(ph.propertyHorizontalId)}`).catch(() => null);
    }

    const from = new Date();
    from.setUTCMonth(from.getUTCMonth() - 2);
    const to = new Date();
    to.setUTCMonth(to.getUTCMonth() + 6);
    const q = new URLSearchParams({
      from: from.toISOString(),
      to: to.toISOString()
    });
    if (ph?.propertyHorizontalId) {
      q.set("propertyHorizontalId", ph.propertyHorizontalId);
    }

    const [nextRes, eventsRes] = await Promise.all([
      api("/api/calendar/next").catch(() => null),
      api(`/api/calendar/events?${q}`).catch((err) => {
        state.sectionError = "assemblies";
        throw err;
      })
    ]);

    state.next = nextRes?.next || null;
    state.events = eventsRes?.events || [];

    const name = profile?.displayName || state.user?.displayName || "Propietario";
    const hello = qs("#owner-hello");
    if (hello) hello.textContent = `Hola, ${name}`;
    const lede = qs("#owner-lede");
    if (lede) {
      lede.textContent = ph?.name
        ? `Resumen para ${ph.name}.`
        : "Tu resumen de asambleas, unidades y cuenta.";
    }
  } catch (err) {
    state.loadError = err?.message || "Error de carga";
    console.error("[owner-portal]", err);
  } finally {
    state.loading = false;
    renderAll();
    applyRoute({ fromHash: false });
  }
}

function wireChrome() {
  qs("#btn-logout")?.addEventListener("click", async (e) => {
    e.preventDefault();
    await logout();
    location.href = "/";
  });

  qs("#btn-nav-toggle")?.addEventListener("click", () => {
    const menu = qs("#sidebar-menu");
    const btn = qs("#btn-nav-toggle");
    if (!menu || !btn) return;
    const open = menu.classList.toggle("show");
    btn.setAttribute("aria-expanded", open ? "true" : "false");
  });

  window.addEventListener("hashchange", () => applyRoute({ fromHash: true }));

  document.addEventListener("click", (e) => {
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

    const retry = e.target.closest?.("[data-retry]");
    if (retry) {
      e.preventDefault();
      loadPortalData();
      return;
    }

    const open = e.target.closest?.("[data-owner-open]");
    if (open) {
      const kind = open.getAttribute("data-owner-open");
      rememberOpenContext(
        open,
        kind === "unit"
          ? state.route.view === "home"
            ? "home"
            : "units"
          : state.route.view === "home"
            ? "home"
            : "assemblies"
      );
      // Hash navigation opens the modal immediately in applyRoute.
    }
  });

  qs("#owner-unit-close")?.addEventListener("click", (e) => {
    e.preventDefault();
    closeOwnerModal("unit");
  });
  qs("#owner-asm-close")?.addEventListener("click", (e) => {
    e.preventDefault();
    closeOwnerModal("assembly");
  });

  qs("#dlg-owner-unit")?.addEventListener("close", () => {
    cleanupModalTrap();
    lockPageScroll(false);
    window.scrollTo(0, modalUi.scrollY || 0);
    restoreOpener(modalUi.opener);
    if (!modalUi.closingByUi && state.route.modal === "unit") {
      setHash(
        {
          view: modalUi.returnView === "home" ? "home" : "units",
          unitCode: null,
          modal: null
        },
        { replace: true }
      );
    }
    modalUi.closingByUi = false;
    requestAnimationFrame(() => window.scrollTo(0, modalUi.scrollY || 0));
  });

  qs("#dlg-owner-assembly")?.addEventListener("close", () => {
    cleanupModalTrap();
    lockPageScroll(false);
    window.scrollTo(0, modalUi.scrollY || 0);
    restoreOpener(modalUi.opener);
    if (!modalUi.closingByUi && (state.route.modal === "assembly" || state.route.modal === "convocation")) {
      setHash(
        {
          view: modalUi.returnView === "home" ? "home" : "assemblies",
          assemblyId: null,
          modal: null
        },
        { replace: true }
      );
    }
    modalUi.closingByUi = false;
    requestAnimationFrame(() => window.scrollTo(0, modalUi.scrollY || 0));
  });

  qs("#dlg-owner-unit")?.addEventListener("cancel", (ev) => {
    ev.preventDefault();
    closeOwnerModal("unit");
  });
  qs("#dlg-owner-assembly")?.addEventListener("cancel", (ev) => {
    ev.preventDefault();
    closeOwnerModal("assembly");
  });
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
  const avatar = qs("#user-avatar");
  if (avatar) avatar.textContent = initials(user.displayName || user.email || "PR");
  if (qs("#nav-tenant")) qs("#nav-tenant").textContent = user.tenantCode || "Portal propietario";
  if (qs("#account-role-label")) qs("#account-role-label").textContent = user.displayName || user.email || "Cuenta";

  wireChrome();
  applyRoute({ fromHash: true });
  await loadPortalData();

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
