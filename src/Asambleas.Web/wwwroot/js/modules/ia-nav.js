/**
 * ASAMBLEAS — Contextual Information Architecture navigation.
 * Levels: Global → PH → Assembly (Live stays on dedicated shells).
 */
import { hasPermission } from "./auth.js";
import { isOperator, isOwnerPortalUser } from "./roles.js";
import { escapeHtml, qs } from "./ui.js";

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

function link(href, label, { current = false, id = null } = {}) {
  const cur = current ? ' aria-current="page"' : "";
  const idAttr = id ? ` id="${id}"` : "";
  return `<a href="${href}"${idAttr}${cur}>${escapeHtml(label)}</a>`;
}

function section(title, itemsHtml) {
  if (!itemsHtml) return "";
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

  const global = [
    link("/ph.html", "Propiedades", { current: current === "ph-list" && !phId }),
    link("/calendar.html", "Calendario", { current: current === "calendar" }),
    link("/assemblies-history.html", "Histórico", { current: current === "history" })
  ].join("");

  let phBlock = "";
  if (phId) {
    const phBase = `/ph.html?${qPh}`;
    const items = [
      link(`${phBase}#resumen`, "Resumen", { current: current === "ph-overview" }),
      link(`${phBase}#owners`, "Propietarios", { current: current === "ph-owners" }),
      link(`${phBase}#units`, "Unidades", { current: current === "ph-units" }),
      link(`${phBase}#assemblies`, "Asambleas", { current: current === "ph-assemblies" }),
      hasPermission(ctx.user, "communications:view")
        ? link(`/communications.html?${qPh}`, "Comunicaciones", { current: current === "comms" })
        : "",
      link(`${phBase}#info`, "Configuración", { current: current === "ph-config" })
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
  const isLive = ["InProgress", "Paused", "CheckIn"].includes(status);
  const isDone = ["Completed", "Cancelled"].includes(status);

  // Lifecycle-aware priority: live → room first; finished → results; else → prep.
  const tabs = isLive
    ? [
        { id: "asm-overview", href: `/dashboard.html?${q}`, label: "Resumen" },
        { id: "asm-room", href: `/lobby.html?${q}`, label: "Sala" },
        { id: "asm-checkin", href: `/checkin.html?${q}`, label: "Participantes" },
        { id: "asm-agenda", href: `/agenda.html?${q}`, label: "Agenda" },
        canVote ? { id: "asm-voting", href: `/voting-studio.html?${q}`, label: "Votaciones" } : null,
        canAudit ? { id: "asm-evidence", href: `/evidence.html?${q}`, label: "Evidencias" } : null,
        { id: "asm-minutes", href: `/minutes.html?${q}`, label: "Acta", more: true },
        canComms ? { id: "asm-convocation", href: `/convocation.html?${q}`, label: "Convocatoria", more: true } : null,
        { id: "asm-readiness", href: `/dashboard.html?${q}#readiness`, label: "Preparación", more: true },
        canExp ? { id: "asm-expediente", href: `/expediente.html?${q}`, label: "Expediente", more: true } : null
      ]
    : isDone
      ? [
          { id: "asm-overview", href: `/dashboard.html?${q}`, label: "Resumen" },
          { id: "asm-minutes", href: `/minutes.html?${q}`, label: "Acta" },
          canAudit ? { id: "asm-evidence", href: `/evidence.html?${q}`, label: "Evidencias" } : null,
          canExp ? { id: "asm-expediente", href: `/expediente.html?${q}`, label: "Expediente" } : null,
          canVote ? { id: "asm-voting", href: `/voting-studio.html?${q}`, label: "Resultados", more: true } : null,
          { id: "asm-agenda", href: `/agenda.html?${q}`, label: "Agenda", more: true },
          { id: "asm-checkin", href: `/checkin.html?${q}`, label: "Participantes", more: true }
        ]
      : [
          { id: "asm-overview", href: `/dashboard.html?${q}`, label: "Resumen" },
          { id: "asm-readiness", href: `/dashboard.html?${q}#readiness`, label: "Preparación" },
          canComms ? { id: "asm-convocation", href: `/convocation.html?${q}`, label: "Convocatoria" } : null,
          { id: "asm-checkin", href: `/checkin.html?${q}`, label: "Acreditación" },
          { id: "asm-agenda", href: `/agenda.html?${q}`, label: "Agenda" },
          canVote ? { id: "asm-voting", href: `/voting-studio.html?${q}`, label: "Votaciones" } : null,
          { id: "asm-room", href: `/lobby.html?${q}`, label: "Sala" },
          { id: "asm-minutes", href: `/minutes.html?${q}`, label: "Acta" },
          canAudit ? { id: "asm-evidence", href: `/evidence.html?${q}`, label: "Evidencias", more: true } : null,
          canExp ? { id: "asm-expediente", href: `/expediente.html?${q}`, label: "Expediente", more: true } : null
        ];

  const filtered = tabs.filter(Boolean);
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
    link("/owner.html", "Inicio", { current: current === "owner-home" }),
    link("/owner.html#assemblies", "Mis asambleas", { current: current === "owner-assemblies" }),
    link("/owner.html#units", "Mis unidades", { current: current === "owner-units" }),
    link("/owner.html#account", "Mi cuenta", { current: current === "owner-account" }),
    ctx.assemblyId
      ? link(`/dashboard.html?${a}`, "Asamblea actual", { current: current === "asm-overview" })
      : ""
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
  if (topCtx) {
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

  // Immediate click feedback for in-app navigation (not full SPA).
  document.querySelectorAll("#ia-nav a[href], #ia-assembly-tabs a[href], #ia-breadcrumbs a[href]").forEach((a) => {
    if (a.dataset.progressBound) return;
    a.dataset.progressBound = "1";
    a.addEventListener("click", (ev) => {
      if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey || a.target === "_blank") return;
      const href = a.getAttribute("href") || "";
      if (!href || href.startsWith("#") || href.startsWith("mailto:")) return;
      import("./loading.js").then(({ startTopProgress }) => startTopProgress()).catch(() => {});
    });
  });
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
