/**
 * Hybrid soft-router for critical IA routes (Alternative C).
 * Soft: dashboard, ph, agenda, checkin, voting-studio, owner.
 * Room (assembly): controlled hard enter; outbound soft after dispose when possible.
 */
import { invalidateShellSessionCache } from "./session-shell-cache.js";

const SHELL_ID_KEY = "__ASAM_SHELL_ID__";
const HYBRID_FLAG = "__ASAM_HYBRID__";

const SOFT_PAGES = new Set([
  "dashboard.html",
  "ph.html",
  "agenda.html",
  "checkin.html",
  "voting-studio.html",
  "owner.html"
]);

const MODULE_LOADERS = {
  "dashboard.html": () => import("./dashboard-app.js"),
  "ph.html": () => import("./ph-app.js?v=units-hub3"),
  "agenda.html": () => import("./agenda-app.js"),
  "checkin.html": () => import("./checkin-app.js"),
  "voting-studio.html": () => import("./voting-studio-app.js"),
  "owner.html": () => import("./owner-portal-app.js")
};

const PAGE_STYLES = {
  "dashboard.html": ["/css/ia.css?v=hist1", "/css/ux-remediation.css?v=ux1", "/css/ux-ia-reeng.css?v=ia2"],
  "ph.html": ["/css/ph.css?v=units-hub3", "/css/ia.css?v=phsw2", "/css/ux-remediation.css?v=ux1", "/css/ux-ia-reeng.css?v=ia4", "/css/ph-roster-import.css?v=pri1", "/css/feedback.css?v=fb1"],
  "agenda.html": ["/css/ia.css?v=hist1", "/css/ux-remediation.css?v=ux1", "/css/ux-ia-reeng.css?v=ia2"],
  "checkin.html": ["/css/ia.css?v=hist1", "/css/ux-remediation.css?v=ux1", "/css/ux-ia-reeng.css?v=ia2"],
  "voting-studio.html": ["/css/voting-studio.css?v=vs1", "/css/ia.css?v=hist1", "/css/ux-remediation.css?v=ux1", "/css/ux-ia-reeng.css?v=ia2"],
  "owner.html": ["/css/ia.css?v=hist1", "/css/ux-remediation.css?v=ux1", "/css/ux-ia-reeng.css?v=ia2"]
};

let currentModule = null;
let currentPage = null;
let navigating = false;
let started = false;
let lastPortalIds = [];

function pageName(pathname) {
  const p = (pathname || "/").split("?")[0];
  const leaf = p.split("/").pop() || "";
  return leaf.toLowerCase();
}

function ensureShellId() {
  if (!window[SHELL_ID_KEY]) {
    window[SHELL_ID_KEY] = `shell-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
  document.documentElement.dataset.asamShellId = window[SHELL_ID_KEY];
  return window[SHELL_ID_KEY];
}

function isSoftTarget(url) {
  try {
    const u = new URL(url, location.origin);
    if (u.origin !== location.origin) return false;
    return SOFT_PAGES.has(pageName(u.pathname));
  } catch {
    return false;
  }
}

function ensureStyles(page) {
  const list = PAGE_STYLES[page] || [];
  for (const href of list) {
    const exists = [...document.querySelectorAll("link[rel=stylesheet]")].some((l) => (l.getAttribute("href") || "") === href);
    if (exists) continue;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.dataset.hybridStyle = page;
    document.head.appendChild(link);
  }
}

function portalHost() {
  let host = document.getElementById("hybrid-portals");
  if (!host) {
    host = document.createElement("div");
    host.id = "hybrid-portals";
    host.setAttribute("data-hybrid-portals", "1");
    document.body.appendChild(host);
  }
  return host;
}

function clearHybridPortals() {
  for (const id of lastPortalIds) {
    document.getElementById(id)?.remove();
  }
  lastPortalIds = [];
  const host = document.getElementById("hybrid-portals");
  if (host) host.replaceChildren();
  document.querySelectorAll("style[data-hybrid-page-style], link[data-hybrid-page-style]").forEach((n) => n.remove());
}

function applyPageExtras(doc, page) {
  clearHybridPortals();
  const host = portalHost();
  // Body-level dialogs / portals that live outside #main (check-in, voting studio).
  for (const dialog of doc.querySelectorAll("body > dialog, body > [data-hybrid-portal]")) {
    const id = dialog.id || "";
    if (id) {
      document.getElementById(id)?.remove();
      lastPortalIds.push(id);
    }
    host.appendChild(document.importNode(dialog, true));
  }
  // Page-scoped inline <style> from head (layout-critical, e.g. check-in).
  for (const style of doc.head?.querySelectorAll("style") || []) {
    const el = document.createElement("style");
    el.dataset.hybridPageStyle = page;
    el.textContent = style.textContent || "";
    document.head.appendChild(el);
  }
}

async function fetchMainHtml(url) {
  const res = await fetch(url, { credentials: "same-origin", headers: { Accept: "text/html" } });
  if (!res.ok) throw new Error(`soft-nav fetch failed ${res.status}`);
  const text = await res.text();
  const doc = new DOMParser().parseFromString(text, "text/html");
  const main = doc.querySelector("#main") || doc.querySelector("main.app-workspace");
  if (!main) throw new Error("soft-nav: target main not found");
  return {
    title: doc.title || document.title,
    mainHtml: main.innerHTML,
    mainId: main.id || "main",
    doc
  };
}

async function disposeCurrent() {
  const mod = currentModule;
  currentModule = null;
  if (!mod) return;
  try {
    if (typeof mod.canLeave === "function") {
      const ok = await mod.canLeave();
      if (ok === false) return false;
    }
  } catch {
    /* continue leave */
  }
  try {
    if (typeof mod.unmount === "function") await mod.unmount();
    else if (typeof mod.dispose === "function") await mod.dispose();
  } catch (err) {
    console.warn("[hybrid] unmount failed", err);
  }
  return true;
}

async function mountPage(page, url) {
  ensureStyles(page);
  const loader = MODULE_LOADERS[page];
  if (!loader) throw new Error(`no module for ${page}`);
  window.__ASAM_SOFT_MOUNTING__ = true;
  let mod;
  try {
    mod = await loader();
  } finally {
    window.__ASAM_SOFT_MOUNTING__ = false;
  }
  currentModule = mod;
  currentPage = page;
  if (typeof mod.mount === "function") {
    await mod.mount({ url, hybrid: true, shellId: ensureShellId() });
  } else if (typeof mod.defaultMount === "function") {
    await mod.defaultMount({ url, hybrid: true });
  } else {
    throw new Error(`${page} missing mount()`);
  }
}

/**
 * Soft-navigate within the admin/owner cluster.
 */
export async function softNavigate(href, { replace = false, scroll = true } = {}) {
  if (navigating) return false;
  const abs = new URL(href, location.origin);
  if (!isSoftTarget(abs.href)) {
    location.assign(abs.pathname + abs.search + abs.hash);
    return false;
  }

  const page = pageName(abs.pathname);
  navigating = true;
  const t0 = performance.now();
  try {
    const left = await disposeCurrent();
    if (left === false) {
      navigating = false;
      return false;
    }

    const fetched = await fetchMainHtml(abs.pathname + abs.search + abs.hash);
    const main = document.querySelector("#main") || document.querySelector("main.app-workspace");
    if (!main) {
      location.assign(abs.pathname + abs.search + abs.hash);
      return false;
    }

    main.innerHTML = fetched.mainHtml;
    applyPageExtras(fetched.doc, page);
    document.title = fetched.title;
    if (replace) history.replaceState({ hybrid: true, page }, fetched.title, abs.pathname + abs.search + abs.hash);
    else history.pushState({ hybrid: true, page }, fetched.title, abs.pathname + abs.search + abs.hash);

    await mountPage(page, abs.pathname + abs.search + abs.hash);
    if (scroll) window.scrollTo(0, 0);
    document.documentElement.dataset.asamLastSoftNavMs = String(Math.round(performance.now() - t0));
    document.documentElement.dataset.asamShellId = ensureShellId();
    return true;
  } catch (err) {
    console.error("[hybrid] softNavigate failed; hard fallback", err);
    document.documentElement.dataset.asamLastSoftNavError = String(err?.message || err);
    location.assign(abs.pathname + abs.search + abs.hash);
    return false;
  } finally {
    navigating = false;
  }
}

function onDocumentClick(ev) {
  if (ev.defaultPrevented) return;
  if (ev.button !== 0) return;
  if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
  const a = ev.target?.closest?.("a[href]");
  if (!a) return;
  if (a.target === "_blank" || a.hasAttribute("download")) return;
  const href = a.getAttribute("href") || "";
  if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
  let url;
  try {
    url = new URL(href, location.origin);
  } catch {
    return;
  }
  if (url.origin !== location.origin) return;

  const targetPage = pageName(url.pathname);
  const here = pageName(location.pathname);

  // Same path+query, hash-only change (PH tabs): keep native hash routing.
  if (targetPage === here && url.pathname === location.pathname && url.search === location.search) {
    return;
  }

  // ph.html → ph.html (add/change phId or hash): stay in-page, do not soft-remount.
  // Soft remount re-imports a differently-cached module URL and can revive the legacy units table.
  if (here === "ph.html" && targetPage === "ph.html") {
    ev.preventDefault();
    const next = url.pathname + url.search + url.hash;
    history.pushState({ hybrid: true, page: "ph.html" }, document.title, next);
    if (typeof window.__asambleasHandlePhUrl === "function") {
      Promise.resolve(window.__asambleasHandlePhUrl(url)).catch(() => location.assign(next));
    } else {
      location.assign(next);
    }
    return;
  }

  // Room boundary: leave room via hard navigation after module dispose if room exposes it.
  if (here === "assembly.html" && SOFT_PAGES.has(targetPage)) {
    ev.preventDefault();
    Promise.resolve()
      .then(async () => {
        try {
          const room = await import("./room-app.js");
          if (typeof room.disposeForHybridLeave === "function") await room.disposeForHybridLeave();
        } catch {
          /* ignore */
        }
        location.assign(url.pathname + url.search + url.hash);
      })
      .catch(() => location.assign(url.pathname + url.search + url.hash));
    return;
  }

  // Enter room / lobby: always native hard navigation (never soft-route).
  // Soft-routing assembly.html risks DOM/lifecycle races with LiveKit+SignalR.
  if (targetPage === "assembly.html" || targetPage === "lobby.html") {
    return;
  }

  // Leaving soft cluster toward a hard page: allow native navigation.
  if (!SOFT_PAGES.has(targetPage)) return;
  if (!SOFT_PAGES.has(here)) return;

  ev.preventDefault();
  softNavigate(url.pathname + url.search + url.hash).catch(() => {
    location.assign(url.pathname + url.search + url.hash);
  });
}

function onPopState() {
  const page = pageName(location.pathname);
  if (!SOFT_PAGES.has(page)) {
    location.reload();
    return;
  }
  // Keep ph.html history transitions in-page (same reason as click handler above).
  if (page === "ph.html" && currentPage === "ph.html" && typeof window.__asambleasHandlePhUrl === "function") {
    Promise.resolve(window.__asambleasHandlePhUrl(new URL(location.href))).catch(() => location.reload());
    return;
  }
  softNavigate(location.pathname + location.search + location.hash, { replace: true }).catch(() => location.reload());
}

/**
 * Boot hybrid on a soft page. Call once from page entry.
 */
export async function startHybridShell(pageModule) {
  if (started) return ensureShellId();
  started = true;
  window[HYBRID_FLAG] = true;
  const id = ensureShellId();
  currentPage = pageName(location.pathname);
  currentModule = pageModule || null;
  document.addEventListener("click", onDocumentClick, true);
  window.addEventListener("popstate", onPopState);
  window.addEventListener("asam:logout", () => invalidateShellSessionCache("logout"));
  window.addEventListener("asam:ph-switched", () => invalidateShellSessionCache("ph-switch"));
  if (!history.state || !history.state.hybrid) {
    history.replaceState({ hybrid: true, page: currentPage }, document.title, location.href);
  }
  return id;
}

export function getShellId() {
  return window[SHELL_ID_KEY] || null;
}

export function isHybridActive() {
  return Boolean(window[HYBRID_FLAG]);
}