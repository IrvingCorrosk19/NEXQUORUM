/**
 * ASAMBLEAS — Contextual Information Architecture navigation.
 * Levels: Global → PH → Assembly (Live stays on dedicated shells).
 */
import { hasPermission } from "./auth.js";
import { isOperator, isOwnerPortalUser } from "./roles.js";
import { escapeHtml, qs } from "./ui.js";
import { iconSvg } from "./tabler-icons.js?v=idn2";
import { persistNavSnapshot } from "./session-shell-cache.js";

/**
 * @typedef {"global"|"ph"|"assembly"} IaLevel
 * @typedef {{
 *   level: IaLevel,
 *   user: object,
 *   phId?: string|null,
 *   phName?: string|null,
 *   assemblyId?: string|null,
 *   assemblyTitle?: string|null,
 *   current?: string
 * }} IaContext
 */

export function roleFamily(user) {
  if (isOwnerPortalUser(user)) return "owner";
  const roles = user?.roles || [];
  if (roles.includes("PHAdmin") || roles.includes("TenantAdmin") || roles.includes("PlatformAdmin")) {
    return "phadmin";
  }
  if (roles.includes("AssemblyPresident")) return "president";
  if (roles.includes("AssemblySecretary")) return "secretary";
  if (isOperator(user)) return "operator";
  return "operator";
}

function isTablerShell() {
  return document.body?.classList.contains("layout-tabler");
}

function link(href, label, { current = false, id = null, icon = null, key = null } = {}) {
  const cur = current ? ' aria-current="page"' : "";
  const idAttr = id ? ` id="${id}"` : "";
  const keyAttr = key ? ` data-ia="${key}"` : "";
  if (isTablerShell()) {
    const active = current ? " active" : "";
    const iconHtml = icon
      ? `<span class="nav-link-icon">${iconSvg(icon, 20)}</span>`
      : "";
    return `<li class="nav-item"><a class="nav-link${active}" href="${href}"${idAttr}${keyAttr}${cur}>${iconHtml}<span class="nav-link-title">${escapeHtml(label)}</span></a></li>`;
  }
  return `<a href="${href}"${idAttr}${keyAttr}${cur}>${escapeHtml(label)}</a>`;
}

function section(title, itemsHtml) {
  if (!itemsHtml) return "";
  if (isTablerShell()) {
    return `<div class="nav-section"><p class="nav-section-label">${escapeHtml(title)}</p><ul class="navbar-nav nav-section__links">${itemsHtml}</ul></div>`;
  }
  return `
    <div class="ia-nav-section">
      <p class="ia-nav-section__title">${escapeHtml(title)}</p>
      <div class="ia-nav-section__links">${itemsHtml}</div>
    </div>`;
}

/**
 * Build sidebar HTML for the given IA context.
 */
export function buildIaNavHtml(ctx) {
  const family = roleFamily(ctx.user);
  if (family === "owner") {
    return buildOwnerNav(ctx);
  }

  const phId = ctx.phId;
  const assemblyId = ctx.assemblyId;
  const qPh = phId ? `phId=${encodeURIComponent(phId)}` : "";
  const current = ctx.current || "";

  const calendarHref = phId ? `/calendar.html?${qPh}` : "/calendar.html";
  const historyHref = phId ? `/assemblies-history.html?${qPh}` : "/assemblies-history.html";
  const global = [
    link("/ph.html", "Propiedades", { current: current === "ph-list" && !phId, icon: "building", key: "ph-list" }),
    link(calendarHref, "Calendario", { current: current === "calendar", icon: "calendar", key: "calendar" }),
    link(historyHref, "Histórico", { current: current === "history", icon: "archive", key: "history" })
  ].join("");

  let phBlock = "";
  if (phId) {
    const phBase = `/ph.html?${qPh}`;
    const items = [
      link(`${phBase}#resumen`, "Resumen", { current: current === "ph-overview", icon: "layoutDashboard", key: "ph-overview" }),
      link(`${phBase}#assemblies`, "Asambleas", { current: current === "ph-assemblies", icon: "microphone", key: "ph-assemblies" }),
      link(`${phBase}#units`, "Unidades", { current: current === "ph-units", icon: "layoutGrid", key: "ph-units" }),
      link(`${phBase}#owners`, "Propietarios", { current: current === "ph-owners", icon: "users", key: "ph-owners" }),
      link(`${phBase}#coefficients`, "Coeficientes", { current: current === "ph-coefficients", icon: "percentage", key: "ph-coefficients" }),
      link(`${phBase}#import`, "Importar", { current: current === "ph-import", icon: "fileImport", key: "ph-import" }),
      link(`${phBase}#readiness`, "Preparación", { current: current === "ph-readiness", icon: "checklist", key: "ph-readiness" }),
      hasPermission(ctx.user, "communications:view")
        ? link(`/communications.html?${qPh}`, "Comunicaciones", { current: current === "comms", icon: "mail", key: "comms" })
        : "",
      link(`${phBase}#info`, "Configuración", { current: current === "ph-config", icon: "settings", key: "ph-config" })
    ]
      .filter(Boolean)
      .join("");
    phBlock = section(ctx.phName || "Propiedad", items);
  }

  return `
    ${section("Inicio", global)}
    ${phBlock}
  `;
}

/** Horizontal assembly sub-navigation (replaces a second sidebar). */
export function buildAssemblyTabsHtml(ctx) {
  const assemblyId = ctx.assemblyId;
  if (!assemblyId) return "";

  const current = ctx.current || "";
  const status = String(ctx.assemblyStatus || "");
  const q = `assemblyId=${encodeURIComponent(assemblyId)}`;
  const canComms = hasPermission(ctx.user, "communications:view");
  const canVote = hasPermission(ctx.user, "motion:create") || hasPermission(ctx.user, "vote:open");
  const canAudit = hasPermission(ctx.user, "audit:view");
  const canExp = hasPermission(ctx.user, "expediente:view");
  const isDone = ["Completed", "Cancelled"].includes(status);

  // Convocatoria is a primary tab. Agenda stays before Sala.
  const tabs = [
    { id: "asm-overview", href: `/dashboard.html?${q}`, label: "Resumen" },
    canComms ? { id: "asm-convocation", href: `/preparar.html?${q}`, label: "Convocatoria" } : null,
    { id: "asm-checkin", href: `/checkin.html?${q}`, label: "Participantes" },
    { id: "asm-agenda", href: `/agenda.html?${q}`, label: "Agenda" },
    { id: "asm-room", href: `/lobby.html?${q}`, label: "Sala" },
    canVote ? { id: "asm-voting", href: `/voting-studio.html?${q}`, label: "Votaciones" } : null,
    canAudit ? { id: "asm-evidence", href: `/evidence.html?${q}`, label: "Evidencias" } : null,
    { id: "asm-minutes", href: `/minutes.html?${q}`, label: "Acta", more: true },
    !isDone ? { id: "asm-readiness", href: `/dashboard.html?${q}#readiness`, label: "Preparación", more: true } : null,
    canExp ? { id: "asm-expediente", href: `/expediente.html?${q}`, label: "Expediente", more: true } : null
  ];

  const filtered = tabs.filter(Boolean).filter((t) => {
    // Owners never see the operator presence desk tab.
    if (t.id === "asm-checkin" && roleFamily(ctx.user) === "owner") return false;
    return true;
  });
  const primary = filtered.filter((t) => !t.more);
  const more = filtered.filter((t) => t.more);

  const tabLink = (t) => {
    const active = current === t.id ? ' aria-current="page"' : "";
    return `<a href="${t.href}" class="ia-asm-tab${current === t.id ? " is-active" : ""}"${active}>${escapeHtml(t.label)}</a>`;
  };

  const moreHtml =
    more.length > 0
      ? `<details class="ia-asm-tabs__more">
          <summary>Más</summary>
          <div class="ia-asm-tabs__menu">${more.map(tabLink).join("")}</div>
        </details>`
      : "";

  return `
    <nav class="ia-asm-tabs" aria-label="Módulos de la asamblea">
      ${primary.map(tabLink).join("")}
      ${moreHtml}
    </nav>`;
}

/**
 * Standard breadcrumb trail for assembly-scoped pages.
 * @param {{ phId?: string|null, phName?: string|null, assemblyId?: string|null, assemblyTitle?: string|null, pageLabel?: string|null }} ctx
 */
export function buildAssemblyBreadcrumbs(ctx) {
  const crumbs = [{ label: "Propiedades", href: "/ph.html" }];
  if (ctx.phName && ctx.phId) {
    crumbs.push({ label: ctx.phName, href: phHref(ctx.phId, "resumen") });
    crumbs.push({ label: "Asambleas", href: phHref(ctx.phId, "assemblies") });
  }
  if (ctx.assemblyTitle && ctx.assemblyId) {
    crumbs.push({
      label: ctx.assemblyTitle,
      href: assemblyHref(ctx.assemblyId, "dashboard")
    });
  }
  if (ctx.pageLabel) crumbs.push({ label: ctx.pageLabel });
  return crumbs;
}

function ownerPortalHref(hash) {
  const onOwner = /\/owner\.html$/i.test(location.pathname || "");
  return onOwner ? hash : `/owner.html${hash}`;
}

function buildOwnerNav(ctx) {
  const current = ctx.current || "";
  const homeCurrent =
    current === "owner-home" || current === "asm-room" || current === "asm-overview";
  return section("Mi portal", [
    link(ownerPortalHref("#home"), "Inicio", {
      current: homeCurrent,
      icon: "home",
      key: "owner-home"
    }),
    link(ownerPortalHref("#units"), "Mis unidades", {
      current: current === "owner-units",
      icon: "layoutGrid",
      key: "owner-units"
    }),
    link(ownerPortalHref("#assemblies"), "Mis asambleas", {
      current: current === "owner-assemblies",
      icon: "calendar",
      key: "owner-assemblies"
    }),
    link(ownerPortalHref("#account"), "Mi perfil", {
      current: current === "owner-account",
      icon: "user",
      key: "owner-account"
    })
  ].join(""));
}

/**
 * Breadcrumb trail HTML.
 * @param {{ label: string, href?: string|null }[]} crumbs
 */
export function buildBreadcrumbsHtml(crumbs) {
  if (!crumbs?.length) return "";
  return `
    <nav class="ia-breadcrumbs" aria-label="Ruta de navegación">
      <ol>
        ${crumbs
          .map((c, i) => {
            const last = i === crumbs.length - 1;
            if (last || !c.href) {
              return `<li aria-current="page"><span>${escapeHtml(c.label)}</span></li>`;
            }
            return `<li><a href="${c.href}">${escapeHtml(c.label)}</a></li>`;
          })
          .join("")}
      </ol>
    </nav>`;
}

/**
 * Mount IA nav into `.app-nav > nav` (or #ia-nav) and optional breadcrumbs into #ia-breadcrumbs.
 */
function syncNavCurrent(nav, ctx) {
  const current = ctx.current || "";
  nav.querySelectorAll("[data-ia]").forEach((a) => {
    const on = a.getAttribute("data-ia") === current;
    a.classList.toggle("active", on);
    if (on) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
}

function persistMountedNav(nav, ctx) {
  if (!nav || nav.querySelector(".ia-nav-skel")) return;
  persistNavSnapshot({
    phId: ctx.phId || "",
    navHtml: nav.innerHTML,
    displayName: qs("#user-chip")?.textContent || ctx.user?.displayName || ctx.user?.email || "",
    roleLabel: qs("#ia-role-chip")?.textContent || "",
    avatar: qs("#user-avatar")?.textContent || "",
    avatarUrl: ctx.user?.avatarUrl || ""
  });
}

function ensureAccountMenu(user) {
  const menu = document.querySelector(".navbar .dropdown-menu");
  if (menu && !menu.querySelector("[data-account-profile], a[href*='#account']")) {
    const link = document.createElement("a");
    link.className = "dropdown-item";
    const ret = `${location.pathname}${location.search}`;
    link.href = `/owner.html?return=${encodeURIComponent(ret)}#account`;
    link.dataset.accountProfile = "1";
    link.textContent = "Mi perfil";
    const logout = menu.querySelector("#btn-logout");
    if (logout) menu.insertBefore(link, logout);
    else menu.appendChild(link);
  }
  const avatar = document.querySelector("#user-avatar");
  if (!avatar || !user) return;
  import("./avatar-ui.js")
    .then(({ applyAvatarElement, avatarCacheBust }) => {
      const url = user.avatarUrl ? avatarCacheBust(user.avatarUrl) : "";
      applyAvatarElement(avatar, { url, label: user.displayName || user.email || "AS" });
    })
    .catch(() => {});
}

export function mountIaShell(ctx, { breadcrumbs = [] } = {}) {
  const aside = document.querySelector(".app-nav");
  if (aside) {
    let nav = aside.querySelector("nav#ia-nav") || aside.querySelector("nav");
    if (!nav) {
      nav = document.createElement("nav");
      nav.id = "ia-nav";
      aside.appendChild(nav);
    }
    nav.id = "ia-nav";
    nav.setAttribute("aria-label", "Navegación contextual");
    const phKey = `${ctx.phId || ""}|${ctx.phName || ""}`;
    const live = nav.querySelector("[data-ia]") && !nav.querySelector(".ia-nav-skel");
    if (live && nav.dataset.phKey === phKey) {
      syncNavCurrent(nav, ctx);
    } else {
      nav.innerHTML = buildIaNavHtml(ctx);
      nav.dataset.phKey = phKey;
      nav.dataset.phId = String(ctx.phId || "");
    }
    persistMountedNav(nav, ctx);
  }

  const crumbHost = qs("#ia-breadcrumbs");
  if (crumbHost) {
    crumbHost.innerHTML = buildBreadcrumbsHtml(breadcrumbs);
  }

  if (ctx.assemblyId) {
    let tabsHost = qs("#ia-assembly-tabs");
    if (!tabsHost && crumbHost) {
      tabsHost = document.createElement("div");
      tabsHost.id = "ia-assembly-tabs";
      crumbHost.insertAdjacentElement("afterend", tabsHost);
    }
    if (tabsHost) {
      tabsHost.innerHTML = buildAssemblyTabsHtml(ctx);
    }
  } else {
    qs("#ia-assembly-tabs")?.replaceChildren();
  }

  const topCtx = qs("#ia-context-label");
  if (topCtx && !isTablerShell()) {
    const parts = [ctx.phName, ctx.assemblyTitle].filter(Boolean);
    topCtx.textContent = parts.join(" · ") || "ASAMBLEAS";
  }

  ensureAccountMenu(ctx.user);

  const roleChip = qs("#ia-role-chip");
  if (roleChip) {
    const labels = {
      owner: "Propietario",
      phadmin: "Admin PH",
      president: "Presidente",
      secretary: "Secretario",
      operator: "Operador"
    };
    roleChip.textContent = labels[roleFamily(ctx.user)] || ctx.user.displayName || "";
  }

  // Global PH switcher in app shell (authorized memberships only).
  import("./ph-context.js")
    .then(({ hydratePhContext }) => {
      hydratePhContext({
        phId: ctx.phId || null,
        phName: ctx.phName || null,
        user: ctx.user || null
      });
      return import("./ph-switcher.js");
    })
    .then((m) => m.mountGlobalPhSwitcher())
    .catch(() => {});

  // Immediate click feedback for in-app navigation (not full SPA).
  document.querySelectorAll("#ia-nav a[href], #ia-assembly-tabs a[href], #ia-breadcrumbs a[href]").forEach((a) => {
    if (a.dataset.progressBound) return;
    a.dataset.progressBound = "1";
    a.addEventListener("click", (ev) => {
      if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey || a.target === "_blank") return;
      closeMobileNav();
      const href = a.getAttribute("href") || "";
      if (!href || href.startsWith("#") || href.startsWith("mailto:")) return;
      import("./loading.js").then(({ startTopProgress }) => startTopProgress()).catch(() => {});
    });
  });

  ensureMobileNav();
}

function closeMobileNav() {
  const shell = document.querySelector(".app-shell");
  const btn = document.querySelector("#btn-nav-toggle");
  shell?.classList.remove("is-nav-open");
  if (btn) {
    btn.setAttribute("aria-expanded", "false");
    btn.setAttribute("aria-label", "Abrir menú de navegación");
  }
  document.body.style.removeProperty("overflow");
  if (isTablerShell()) {
    const menu = document.querySelector("#sidebar-menu");
    if (menu?.classList.contains("show")) {
      const Collapse = window.bootstrap?.Collapse || window.tabler?.Collapse;
      if (Collapse) {
        Collapse.getOrCreateInstance(menu, { toggle: false }).hide();
      } else {
        menu.classList.remove("show");
        btn?.classList.add("collapsed");
      }
    }
  }
}

function openMobileNav() {
  const shell = document.querySelector(".app-shell");
  const btn = document.querySelector("#btn-nav-toggle");
  shell?.classList.add("is-nav-open");
  if (btn) {
    btn.setAttribute("aria-expanded", "true");
    btn.setAttribute("aria-label", "Cerrar menú de navegación");
  }
  document.body.style.overflow = "hidden";
  document.querySelector(".app-nav a, .app-nav button")?.focus();
}

function ensureMobileNav() {
  const shell = document.querySelector(".app-shell");
  const header = document.querySelector(".app-top");
  const nav = document.querySelector(".app-nav");
  if (!shell || !nav) return;
  if (isTablerShell()) {
    const toggle = document.querySelector("#btn-nav-toggle");
    toggle?.addEventListener("click", () => {
      /* Tabler/Bootstrap collapse owns the drawer. */
    }, { once: true });
    return;
  }
  if (!header) return;

  if (!document.querySelector(".nav-backdrop")) {
    const backdrop = document.createElement("div");
    backdrop.className = "nav-backdrop";
    backdrop.addEventListener("click", closeMobileNav);
    shell.appendChild(backdrop);
  }

  let btn = header.querySelector("#btn-nav-toggle");
  if (!btn) {
    btn = document.createElement("button");
    btn.type = "button";
    btn.id = "btn-nav-toggle";
    btn.className = "btn-nav-toggle";
    btn.setAttribute("aria-controls", "ia-nav");
    btn.setAttribute("aria-expanded", "false");
    btn.setAttribute("aria-label", "Abrir menú de navegación");
    btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>`;
    header.insertBefore(btn, header.firstChild);
    btn.addEventListener("click", () => {
      if (shell.classList.contains("is-nav-open")) closeMobileNav();
      else openMobileNav();
    });
  }

  if (!document.body.dataset.navEscBound) {
    document.body.dataset.navEscBound = "1";
    document.addEventListener("keydown", (ev) => {
      if (ev.key !== "Escape") return;
      if (!document.querySelector(".app-shell.is-nav-open")) return;
      closeMobileNav();
      document.querySelector("#btn-nav-toggle")?.focus();
    });
  }
}

export function phHref(phId, hash = "") {
  return `/ph.html?phId=${encodeURIComponent(phId)}${hash ? `#${hash}` : ""}`;
}

export function assemblyHref(assemblyId, page = "dashboard") {
  const map = {
    dashboard: "/dashboard.html",
    convocation: "/preparar.html",
    checkin: "/checkin.html",
    lobby: "/lobby.html",
    room: "/assembly.html",
    minutes: "/minutes.html",
    evidence: "/evidence.html",
    voting: "/voting-studio.html",
    expediente: "/expediente.html"
  };
  const base = map[page] || "/dashboard.html";
  return `${base}?assemblyId=${encodeURIComponent(assemblyId)}`;
}
