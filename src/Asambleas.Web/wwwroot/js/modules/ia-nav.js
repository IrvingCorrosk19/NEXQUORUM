/**
 * ASAMBLEAS — Contextual Information Architecture navigation.
 * Levels: Global → PH → Assembly (Live stays on dedicated shells).
 */
import { hasPermission } from "./auth.js";
import { isOperator, isOwnerPortalUser } from "./roles.js";
import { escapeHtml, qs } from "./ui.js";
import { iconSvg } from "./tabler-icons.js?v=idn2";

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

function link(href, label, { current = false, id = null, icon = null } = {}) {
  const cur = current ? ' aria-current="page"' : "";
  const idAttr = id ? ` id="${id}"` : "";
  if (isTablerShell()) {
    const active = current ? " active" : "";
    const iconHtml = icon
      ? `<span class="nav-link-icon">${iconSvg(icon, 20)}</span>`
      : "";
    return `<li class="nav-item"><a class="nav-link${active}" href="${href}"${idAttr}${cur}>${iconHtml}<span class="nav-link-title">${escapeHtml(label)}</span></a></li>`;
  }
  return `<a href="${href}"${idAttr}${cur}>${escapeHtml(label)}</a>`;
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
    link("/ph.html", "Propiedades", { current: current === "ph-list" && !phId, icon: "building" }),
    link(calendarHref, "Calendario", { current: current === "calendar", icon: "calendar" }),
    link(historyHref, "Histórico", { current: current === "history", icon: "archive" })
  ].join("");

  let phBlock = "";
  if (phId) {
    const phBase = `/ph.html?${qPh}`;
    const items = [
      link(`${phBase}#resumen`, "Resumen", { current: current === "ph-overview", icon: "layoutDashboard" }),
      link(`${phBase}#assemblies`, "Asambleas", { current: current === "ph-assemblies", icon: "microphone" }),
      link(`${phBase}#units`, "Unidades", { current: current === "ph-units", icon: "layoutGrid" }),
      link(`${phBase}#owners`, "Propietarios", { current: current === "ph-owners", icon: "users" }),
      link(`${phBase}#coefficients`, "Coeficientes", { current: current === "ph-coefficients", icon: "percentage" }),
      link(`${phBase}#import`, "Importar", { current: current === "ph-import", icon: "fileImport" }),
      link(`${phBase}#readiness`, "Preparación", { current: current === "ph-readiness", icon: "checklist" }),
      hasPermission(ctx.user, "communications:view")
        ? link(`/communications.html?${qPh}`, "Comunicaciones", { current: current === "comms", icon: "mail" })
        : "",
      link(`${phBase}#info`, "Configuración", { current: current === "ph-config", icon: "settings" })
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
    canComms ? { id: "asm-convocation", href: `/convocation.html?${q}`, label: "Convocatoria" } : null,
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

function buildOwnerNav(ctx) {
  const current = ctx.current || "";
  const a = ctx.assemblyId ? `assemblyId=${encodeURIComponent(ctx.assemblyId)}` : "";
  return section("Mi portal", [
    ctx.assemblyId
      ? link(`/assembly.html?${a}`, "Asamblea actual", {
          current: current === "asm-room" || current === "asm-overview" || current === "owner-home"
        })
      : link("/owner.html#home", "Asamblea actual", { current: current === "owner-home" }),
    link("/owner.html#assemblies", "Mis asambleas", { current: current === "owner-assemblies" }),
    link("/owner.html#account", "Mi perfil", { current: current === "owner-account" })
  ]
    .filter(Boolean)
    .join(""));
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
    nav.innerHTML = buildIaNavHtml(ctx);
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
    convocation: "/convocation.html",
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
