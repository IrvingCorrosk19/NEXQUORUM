/**
 * Global PH context switcher — mounts into app topbar.
 */
import { escapeHtml, qs } from "./ui.js";
import {
  getCurrentPh,
  getRecentPhs,
  loadMyMemberships,
  phInitials,
  subscribePhContext,
  switchPh
} from "./ph-context.js";

let mountedRoot = null;
let open = false;
let searchQuery = "";
let boundDocClick = null;
let boundKey = null;

function openPopover() {
  open = true;
  const pop = mountedRoot?.querySelector(".ph-switcher-pop");
  const btn = mountedRoot?.querySelector(".ph-switcher-trigger");
  if (pop) {
    pop.hidden = false;
    // Ensure measurable visibility even if ancestors clip.
    pop.style.display = "flex";
  }
  btn?.setAttribute("aria-expanded", "true");
  const input = pop?.querySelector("[data-ph-search]");
  input?.focus();
  renderList();
}

function closePopover() {
  open = false;
  searchQuery = "";
  const pop = mountedRoot?.querySelector(".ph-switcher-pop");
  const btn = mountedRoot?.querySelector(".ph-switcher-trigger");
  if (pop) {
    pop.hidden = true;
    pop.style.display = "";
  }
  btn?.setAttribute("aria-expanded", "false");
}

function filteredMemberships(memberships) {
  const q = searchQuery.trim().toLowerCase();
  if (!q) return memberships;
  return memberships.filter(
    (m) =>
      String(m.name || "")
        .toLowerCase()
        .includes(q) ||
      String(m.code || "")
        .toLowerCase()
        .includes(q)
  );
}

function renderList() {
  const listEl = mountedRoot?.querySelector("[data-ph-list]");
  if (!listEl) return;
  const { phId, memberships, switching } = getCurrentPh();
  const recentIds = new Set(getRecentPhs().map((r) => String(r.phId)));
  const filtered = filteredMemberships(memberships);
  const recent = filtered.filter((m) => recentIds.has(String(m.propertyHorizontalId)));
  const rest = filtered.filter((m) => !recentIds.has(String(m.propertyHorizontalId)));

  const row = (m) => {
    const id = String(m.propertyHorizontalId);
    const active = String(phId) === id;
    const ini = phInitials(m.name);
    return `
      <button type="button" class="ph-switcher-option${active ? " is-active" : ""}" data-ph-id="${escapeHtml(id)}" ${
        switching || active ? "disabled" : ""
      } role="option" aria-selected="${active}">
        <span class="ph-switcher-avatar" aria-hidden="true">${escapeHtml(ini)}</span>
        <span class="ph-switcher-option__text">
          <strong>${escapeHtml(m.name || "PH")}</strong>
          ${m.roleHint ? `<span class="muted">${escapeHtml(m.roleHint)}</span>` : ""}
        </span>
        ${active ? `<span class="ph-switcher-check" aria-hidden="true">✓</span>` : ""}
      </button>`;
  };

  let html = "";
  if (!filtered.length) {
    html = `<p class="ph-switcher-empty">No hay propiedades que coincidan.</p>`;
  } else {
    if (recent.length && !searchQuery.trim()) {
      html += `<p class="ph-switcher-section">Recientes</p>${recent.map(row).join("")}`;
      if (rest.length) html += `<p class="ph-switcher-section">Todas</p>${rest.map(row).join("")}`;
    } else {
      html += rest.length || recent.length ? `${[...recent, ...rest].map(row).join("")}` : filtered.map(row).join("");
    }
  }
  listEl.innerHTML = html;
  listEl.querySelectorAll("[data-ph-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-ph-id");
      closePopover();
      await switchPh(id);
    });
  });
}

function renderShell() {
  if (!mountedRoot) return;
  const { phId, phName, switching, memberships } = getCurrentPh();
  if (!memberships.length || memberships.length < 2) {
    mountedRoot.hidden = true;
    return;
  }
  mountedRoot.hidden = false;
  const name = phName || memberships.find((m) => m.isCurrent)?.name || "Seleccionar PH";
  const ini = phInitials(name);
  const trigger = mountedRoot.querySelector(".ph-switcher-trigger");
  const avatar = mountedRoot.querySelector("[data-ph-avatar]");
  const title = mountedRoot.querySelector("[data-ph-title]");
  const sub = mountedRoot.querySelector("[data-ph-sub]");
  if (avatar) avatar.textContent = ini;
  if (title) title.textContent = switching ? `Cambiando a ${name}…` : name;
  if (sub) sub.textContent = switching ? "Actualizando contexto" : "PH activo";
  trigger?.classList.toggle("is-switching", switching);
  trigger?.toggleAttribute("disabled", switching);
  if (open) renderList();
}

/**
 * Mount into `.app-top .cluster` (before user chip) or replace legacy #ph-switcher.
 */
export async function mountGlobalPhSwitcher(host = null) {
  const cluster = host || qs(".app-top .cluster");
  if (!cluster) return null;

  // Remove legacy select switcher if present.
  qs("#ph-switcher")?.remove();

  let root = qs("#global-ph-switcher");
  if (!root) {
    root = document.createElement("div");
    root.id = "global-ph-switcher";
    root.className = "ph-switcher-global";
    root.innerHTML = `
      <button type="button" class="ph-switcher-trigger" aria-haspopup="listbox" aria-expanded="false" aria-controls="ph-switcher-list">
        <span class="ph-switcher-avatar" data-ph-avatar aria-hidden="true">PH</span>
        <span class="ph-switcher-meta">
          <span class="ph-switcher-title" data-ph-title>Propiedad</span>
          <span class="ph-switcher-sub" data-ph-sub>PH activo</span>
        </span>
        <span class="ph-switcher-caret" aria-hidden="true">▾</span>
      </button>
      <div class="ph-switcher-pop" hidden role="dialog" aria-label="Cambiar de propiedad">
        <div class="ph-switcher-pop__head">
          <strong>Cambiar de propiedad</strong>
          <label class="ph-switcher-search">
            <span class="visually-hidden">Buscar PH</span>
            <input type="search" data-ph-search placeholder="Buscar PH…" autocomplete="off" />
          </label>
        </div>
        <div class="ph-switcher-pop__list" id="ph-switcher-list" data-ph-list role="listbox"></div>
      </div>`;
    const userChip = cluster.querySelector("#user-chip");
    if (userChip) cluster.insertBefore(root, userChip);
    else cluster.appendChild(root);
  }

  mountedRoot = root;

  const trigger = root.querySelector(".ph-switcher-trigger");
  trigger?.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    if (open) closePopover();
    else openPopover();
  });

  root.querySelector(".ph-switcher-pop")?.addEventListener("click", (ev) => {
    ev.stopPropagation();
  });

  root.querySelector("[data-ph-search]")?.addEventListener("input", (e) => {
    searchQuery = e.target.value || "";
    renderList();
  });

  if (!boundDocClick) {
    boundDocClick = (ev) => {
      if (!open || !mountedRoot) return;
      if (mountedRoot.contains(ev.target)) return;
      closePopover();
    };
    // Capture on next tick so the opening click does not immediately close.
    document.addEventListener("pointerdown", boundDocClick);
  }

  if (!boundKey) {
    boundKey = (ev) => {
      if (!open) return;
      if (ev.key === "Escape") {
        closePopover();
        mountedRoot?.querySelector(".ph-switcher-trigger")?.focus();
      }
    };
    document.addEventListener("keydown", boundKey);
  }

  subscribePhContext(() => renderShell());

  try {
    await loadMyMemberships();
  } catch {
    root.hidden = true;
    return root;
  }

  renderShell();
  return root;
}
