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
  const qAsm = assemblyId ? `assemblyId=${encodeURIComponent(assemblyId)}` : "";
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

  let asmBlock = "";
  if (assemblyId) {
    const a = qAsm;
    const canComms = hasPermission(ctx.user, "communications:view");
    const items = [
      link(`/dashboard.html?${a}`, "Resumen", { current: current === "asm-overview", id: "nav-dashboard" }),
      link(`/agenda.html?${a}`, "Agenda", { current: current === "asm-agenda" }),
      link(`/calendar.html?${a}`, "Calendario", { current: current === "asm-agenda-cal" }),
      canComms
        ? link(`/convocation.html?${a}`, "Convocatoria", {
            current: current === "asm-convocation",
            id: "nav-convocation"
          })
        : "",
      link(`/checkin.html?${a}`, "Participantes / Acreditación", {
        current: current === "asm-checkin",
        id: "nav-checkin"
      }),
      hasPermission(ctx.user, "motion:create") || hasPermission(ctx.user, "vote:open")
        ? link(`/voting-studio.html?${a}`, "Votaciones", { current: current === "asm-voting" })
        : "",
      link(`/lobby.html?${a}`, "Sala", { current: current === "asm-room", id: "nav-lobby" }),
      link(`/minutes.html?${a}`, "Acta", { current: current === "asm-minutes", id: "nav-minutes" }),
      hasPermission(ctx.user, "audit:view")
        ? link(`/evidence.html?${a}`, "Evidencias", {
            current: current === "asm-evidence",
            id: "nav-evidence"
          })
        : "",
      hasPermission(ctx.user, "expediente:view")
        ? link(`/expediente.html?${a}`, "Expediente", { current: current === "asm-expediente" })
        : ""
    ]
      .filter(Boolean)
      .join("");
    asmBlock = section(ctx.assemblyTitle || "Asamblea", items);
  }

  return `
    ${section("Inicio", global)}
    ${phBlock}
    ${asmBlock}
  `;
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
