import { api, ensureAntiforgery, cachedGet, invalidateCachedGet } from "./api.js";
import { me, logout, hasPermission } from "./auth.js";
import { applyAvatarElement, avatarCacheBust } from "./avatar-ui.js?v=own11";
import { mountIaShell, phHref, roleFamily } from "./ia-nav.js?v=flow6";
import { assemblyListBucket, statusLabelEs, resolvePrimaryAction, preparationAction } from "./ia-actions.js?v=flow2";
import { formatDateTime, confirmDialog, notify } from "./ui.js?v=cancel-label1";
import { AppFeedback } from "./app-feedback.js";
import { bindStickyForm } from "./ux-forms.js";
import { runWithButton, startTopProgress, stopTopProgress } from "./loading.js";
import { startHybridShell } from "./hybrid-router.js?v=polish13";
import { createUnitsHub } from "./ph-units-hub.js?v=vps8";
import { coefficientRollupCopy, formatCoefficientAmount } from "./coefficient-rollup.js";
import { bindSheetViewport, createQueryGuard, rememberOpener, restoreOpener, trapFocus, wireSheetKeyboard, applyTestHooks, lockPageScroll, scrollFieldIntoSheet } from "./query-guard.js?v=polish11";

const STEP_LABELS = [
  "Información",
  "Estructura",
  "Unidades",
  "Propietarios",
  "Coeficientes",
  "Configuración",
  "Revisión",
  "Activar"
];

let user = null;
let currentPhId = null;
let currentPh = null;
let createPhBusy = false;
let createPhOpener = null;
let createPhUntrap = null;
let createPhUnbindKeyboard = null;
let editingOwnerId = null;
const ownerSheetGuard = createQueryGuard();
const asmSummaryGuard = createQueryGuard();
let asmSummaryOpener = null;
let asmSummaryUntrap = null;
let asmSummaryUnbind = null;
let asmListY = 0;
const ownerSheet = {
  mode: "view",
  returnTo: "list",
  ownerId: null,
  opener: null,
  untrap: null,
  unbind: null,
  listY: 0,
  tableY: 0
};
let myMemberships = [];
let phAssemblies = [];
let asmFilter = "upcoming";
let asmSearch = "";
let phFormBinder = null;
/** @type {Map<string, number>} */
const phTabFreshAt = new Map();
const PH_TAB_TTL_MS = 8000;
let unitSearchTimer = 0;
let ownerSearchTimer = 0;
let unitsHub = null;
let applyingRoute = false;

function phTabKey(kind) {
  return `${currentPhId || ""}:${kind}`;
}

function isPhTabFresh(kind) {
  const at = phTabFreshAt.get(phTabKey(kind));
  return Boolean(at && Date.now() - at < PH_TAB_TTL_MS);
}

function markPhTabFresh(kind) {
  if (!currentPhId) return;
  phTabFreshAt.set(phTabKey(kind), Date.now());
}

function invalidatePhTabData(phId = currentPhId) {
  if (!phId) return;
  const prefix = `${phId}:`;
  for (const key of [...phTabFreshAt.keys()]) {
    if (key.startsWith(prefix)) phTabFreshAt.delete(key);
  }
  invalidateCachedGet(`/api/ph/${phId}/`);
}

const $ = (sel) => document.querySelector(sel);
const alertEl = $("#page-alert");

function canAdministerPh(phId = currentPhId) {
  if (hasPermission(user, "ph:manage") || hasPermission(user, "owner:manage")) {
    return true;
  }
  if (!phId) return false;
  const m = myMemberships.find(
    (x) => String(x.propertyHorizontalId).toLowerCase() === String(phId).toLowerCase()
  );
  const hint = (m?.roleHint || "").toLowerCase();
  return hint === "phadmin" || hint === "tenantadmin" || hint === "platformadmin";
}

function canAdministerCurrentPh() {
  return canAdministerPh(currentPhId);
}

function canScheduleAssembly() {
  return hasPermission(user, "assembly:schedule") || hasPermission(user, "assembly:manage");
}

function setDetailBusy(busy, copy) {
  const el = $("#ph-detail-status");
  const copyEl = $("#ph-detail-status-copy");
  const skel = $("#ph-module-skeleton");
  if (copyEl && copy) copyEl.textContent = copy;
  if (el) el.hidden = !busy;
  if (skel) skel.hidden = !busy;
  const detail = $("#view-detail");
  if (detail) {
    detail.classList.toggle("is-ph-loading", !!busy);
    if (busy) {
      detail.setAttribute("aria-busy", "true");
      document.querySelectorAll("#view-detail .wizard-panel").forEach((p) => {
        p.hidden = true;
      });
    } else {
      detail.removeAttribute("aria-busy");
    }
  }
}

function syncAsmFilterButtons() {
  document.querySelectorAll("#asm-filters button").forEach((b) => {
    const on = (b.dataset.filter || "upcoming") === asmFilter;
    b.setAttribute("aria-pressed", String(on));
    b.classList.toggle("active", on);
    b.classList.toggle("btn-primary", on);
    b.classList.toggle("btn-outline-secondary", !on);
  });
}

function applyNewAssemblyGate() {
  const btn = $("#btn-new-assembly");
  if (btn) btn.hidden = !canScheduleAssembly();
}

const PH_COVER_FALLBACK = "/img/brand/architecture-cover.jpg";
const PH_BUILDING_ICON = `<svg xmlns="http://www.w3.org/2000/svg" class="icon" width="22" height="22" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" aria-hidden="true"><path d="M3 21h18"/><path d="M5 21V8l7-4 7 4v13"/><path d="M9 21v-6h6v6"/><path d="M10 9h.01"/><path d="M14 9h.01"/><path d="M10 13h.01"/><path d="M14 13h.01"/></svg>`;
const PH_KPI_ICONS = {
  units: PH_BUILDING_ICON,
  owners: `<svg xmlns="http://www.w3.org/2000/svg" class="icon" width="20" height="20" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" aria-hidden="true"><path d="M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0"/><path d="M6 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2"/></svg>`,
  users: `<svg xmlns="http://www.w3.org/2000/svg" class="icon" width="20" height="20" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" aria-hidden="true"><path d="M9 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0"/><path d="M3 21v-2a4 4 0 0 1 4 -4h4"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/><path d="M21 21v-2a4 4 0 0 0 -3 -3.85"/></svg>`,
  coeff: `<svg xmlns="http://www.w3.org/2000/svg" class="icon" width="20" height="20" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" aria-hidden="true"><path d="M17 17l-10 -10"/><path d="M7 10a3 3 0 1 0 0 -6a3 3 0 0 0 0 6z"/><path d="M17 20a3 3 0 1 0 0 -6a3 3 0 0 0 0 6z"/></svg>`
};

function phCoverSrc(ph) {
  return ph?.coverImageUrl || ph?.imageUrl || ph?.photoUrl || ph?.heroImageUrl || PH_COVER_FALLBACK;
}

function applyPhCover(ph) {
  const hero = $("#ph-hero");
  if (!hero) return;
  const src = String(phCoverSrc(ph)).replace(/"/g, "");
  hero.style.setProperty("--ph-cover", `url("${src}")`);
}

function phStatCard(label, value, kind = "units") {
  return `<div class="col-6 col-md-3">
    <div class="card card-sm ph-kpi">
      <div class="card-body">
        <span class="ph-kpi__icon" data-kpi="${escapeHtml(kind)}" aria-hidden="true">${PH_KPI_ICONS[kind] || PH_BUILDING_ICON}</span>
        <div class="ph-kpi__value">${escapeHtml(String(value))}</div>
        <div class="ph-kpi__label">${escapeHtml(label)}</div>
      </div>
    </div>
  </div>`;
}

function asmStatusBadgeClass(bucket) {
  if (bucket === "live") return "badge bg-green-lt";
  if (bucket === "upcoming") return "badge bg-blue-lt";
  if (bucket === "cancelled") return "badge bg-red-lt";
  return "badge bg-secondary-lt";
}

function asmEmptyHtml({ title, subtitle, action = "" }) {
  return `<div class="empty">
    <p class="empty-title">${escapeHtml(title)}</p>
    <p class="empty-subtitle text-secondary">${escapeHtml(subtitle)}</p>
    ${action ? `<div class="empty-action">${action}</div>` : ""}
  </div>`;
}

function clearAlert() {
  if (alertEl) alertEl.hidden = true;
}

function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function closeStraySheets() {
  document.querySelectorAll("dialog.app-sheet, #dlg-confirm-action, #dlg-ph-created").forEach((dlg) => {
    if (dlg.open) {
      try {
        dlg.close();
      } catch {
        dlg.removeAttribute("open");
      }
    } else {
      dlg.removeAttribute("open");
    }
  });
}

async function init() {
  closeStraySheets();
  try {
    user = await me();
  } catch {
    location.href = "/";
    return;
  }

  if (!hasPermission(user, "ph:view")) {
    location.href = "/owner.html?denied=ph-admin";
    return;
  }

  const chip = $("#user-chip");
  if (chip) chip.textContent = user.displayName || user.email;
  const tenant = $("#nav-tenant");
  if (tenant) tenant.textContent = user.tenantCode || "Gobernanza";
  const avatar = $("#user-avatar");
  if (avatar) {
    const url = user.avatarUrl ? avatarCacheBust(user.avatarUrl) : null;
    applyAvatarElement(avatar, { url, label: user.displayName || user.email || "AS" });
  }
  const roleChip = $("#ia-role-chip");
  const roleLabel = $("#account-role-label");
  const roleNames = {
    owner: "Propietario",
    phadmin: "Admin PH",
    president: "Presidente",
    secretary: "Secretario",
    operator: "Operador"
  };
  const roleText = roleNames[roleFamily(user)] || user.displayName || "Cuenta";
  if (roleChip) roleChip.textContent = roleText;
  if (roleLabel) roleLabel.textContent = roleText;
  $("#btn-logout")?.addEventListener("click", async (ev) => {
    ev.preventDefault();
    await logout();
    location.href = "/";
  });

  wireUi();
  await refreshSwitcher();
  await loadList();

  try {
    const { subscribePhContext } = await import("./ph-context.js");
    subscribePhContext((ctx) => {
      const next = ctx?.phId ? String(ctx.phId) : null;
      if (!next) return;
      if (String(currentPhId || "") === next) {
        if ($("#view-detail") && !$("#view-detail").hidden) {
          const panel = document.querySelector('[data-panel="assemblies"]');
          if (panel && !panel.hidden) loadAssemblies();
        }
        return;
      }
      // Catalog / post-login: do not auto-open the claim's PH — operators pick from Propiedades.
      const urlPhNow = new URLSearchParams(location.search).get("phId");
      const onCatalog = !urlPhNow && Boolean($("#view-detail")?.hidden);
      if (onCatalog) return;

      // Global PH switch while already in a PH detail: clear stale list then reopen.
      phAssemblies = [];
      const host = $("#ph-assemblies-list");
      if (host) host.innerHTML = `<div class="skeleton" style="height:4rem">Cambiando de PH…</div>`;
      const hashTab = (location.hash || "").replace("#", "");
      openPh(next, hashTab || "resumen").catch(() => {});
    });
  } catch {
    /* optional */
  }

  const urlPh = new URLSearchParams(location.search).get("phId");
  if (urlPh) {
    const desiredHash = (location.hash || "").replace("#", "");
    await openPh(urlPh, desiredHash || null);
  } else {
    // Landing without phId = property picker (president / operators).
    if (location.hash) {
      history.replaceState({}, "", `${location.pathname}${location.search}`);
    }
    mountPhListShell();
  }
}

function mountPhListShell() {
  mountIaShell(
    { level: "global", user, current: "ph-list" },
    { breadcrumbs: [{ label: "Propiedades" }] }
  );
}

function canonicalPhTab(tab) {
  const key = String(tab || "").replace(/^#/, "").toLowerCase();
  const aliases = {
    settings: "info",
    config: "info",
    configuracion: "info",
    prep: "readiness",
    preparacion: "readiness"
  };
  return aliases[key] || key;
}

function applyHashTab() {
  const hash = canonicalPhTab(location.hash || "");
  const map = {
    resumen: "resumen",
    info: "info",
    assemblies: "assemblies",
    units: "units",
    owners: "owners",
    coefficients: "coefficients",
    import: "import",
    readiness: "readiness"
  };
  applyingRoute = true;
  try {
    if (map[hash]) switchTab(map[hash]);
    else if (currentPh && !isOnboardingMode(currentPh)) switchTab("resumen");
  } finally {
    applyingRoute = false;
    stopTopProgress();
  }
}

/** Wizard only for empty Draft PHs. Operational chrome otherwise. */
function isOnboardingMode(ph) {
  if (!ph) return false;
  if (ph.status === "Active" || ph.status === "ReadyForAssembly" || ph.status === "Inactive") {
    return false;
  }
  // Missing counts must NOT collapse into "empty" — that hid module tabs after create/import races.
  if (ph.unitCount == null && ph.ownerCount == null) return false;
  const units = Number(ph.unitCount ?? 0);
  const owners = Number(ph.ownerCount ?? 0);
  return ph.status === "Draft" && units === 0 && owners === 0;
}

function applyPhMode(ph) {
  const detail = $("#view-detail");
  if (!detail || !ph) return;
  const onboarding = isOnboardingMode(ph);
  detail.dataset.phMode = onboarding ? "onboarding" : "ops";

  const wizard = $("#wizard-steps");
  const progress = $("#onboarding-progress");
  const moduleTabs = $("#ph-module-tabs");
  if (wizard) wizard.hidden = !onboarding;
  if (progress) {
    progress.hidden = !onboarding;
    const step = Math.min(Math.max(Number(ph.onboardingStep) || 1, 1), STEP_LABELS.length);
    progress.textContent = `Paso ${step} de ${STEP_LABELS.length}`;
  }
  if (moduleTabs) {
    moduleTabs.hidden = onboarding || document.body.classList.contains("layout-tabler");
  }

  const inactive = ph.status === "Inactive";
  const showActivate = !inactive && ph.status !== "Active";
  const showReady = !inactive && ph.status === "Draft";
  $("#btn-activate-ph").hidden = !showActivate;
  $("#btn-mark-ready").hidden = !showReady;
  $("#btn-continue-onboarding").hidden = !(onboarding || (ph.status === "Draft" && !inactive));
  $("#btn-reactivate-ph").hidden = !inactive;
  $("#btn-activate-ph").disabled = inactive;
  $("#btn-mark-ready").disabled = inactive;
  const activateBtn = $("#btn-activate-ph");
  if (activateBtn) {
    activateBtn.title = inactive
      ? "Reactiva el PH antes de activarlo"
      : "Activa el PH cuando coeficientes y preparacion esten completos";
  }
  const readyBtn = $("#btn-mark-ready");
  if (readyBtn) {
    readyBtn.title = "Marca el PH como listo para asamblea cuando no haya bloqueos de preparacion";
  }
  const contBtn = $("#btn-continue-onboarding");
  if (contBtn) {
    contBtn.title = "Continua el asistente de configuracion inicial";
  }
  const adminMenu = $("#ph-admin-menu");
  if (adminMenu) {
    const setItem = (act, hidden, title) => {
      const b = adminMenu.querySelector(`[data-ph-admin="${act}"]`);
      if (!b) return;
      b.hidden = !!hidden;
      if (title) b.title = title;
    };
    setItem("activate", !($("#btn-activate-ph") && !$("#btn-activate-ph").hidden), activateBtn?.title);
    setItem("ready", !($("#btn-mark-ready") && !$("#btn-mark-ready").hidden), readyBtn?.title);
    setItem("deactivate", inactive, "Archiva el PH: deja de operar pero conserva historial");
    setItem("reactivate", !inactive, "Vuelve a poner el PH en operacion");
  }
}

function canCreatePh() {
  return hasPermission(user, "ph:manage");
}

function applyCreatePhGate() {
  const can = canCreatePh();
  ["#btn-create-ph", "#btn-create-first"].forEach((sel) => {
    const btn = $(sel);
    if (!btn) return;
    btn.hidden = !can;
    btn.disabled = !can;
  });
  const emptyCopy = $("#ph-empty-copy");
  if (emptyCopy) {
    emptyCopy.textContent = can
      ? "Primero debes crear o seleccionar una propiedad horizontal para continuar."
      : "Tu usuario puede ver propiedades, pero no crearlas. Usa una cuenta con permiso «Administrar PH» (Administrador PH o Presidente).";
  }
}

function suggestPhCodeFromName(name) {
  const raw = String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
  let out = "";
  let lastDash = false;
  for (const ch of raw) {
    if ((ch >= "A" && ch <= "Z") || (ch >= "0" && ch <= "9")) {
      out += ch;
      lastDash = false;
    } else if (out && !lastDash) {
      out += "-";
      lastDash = true;
    }
  }
  out = out.replace(/^-+|-+$/g, "");
  if (!out) return "PH";
  return out.length <= 48 ? out : out.slice(0, 48).replace(/-+$/g, "");
}

function openCreatePhDialog() {
  if (!canCreatePh()) {
    AppFeedback.error("Inicia sesión con Administrador PH o Presidente de asamblea.", {
      title: "Sin permiso"
    });
    return;
  }
  clearAlert();
  const form = $("#form-create-ph");
  form?.reset();
  const nameInput = form?.querySelector('input[name="name"]');
  const codeInput = form?.querySelector('input[name="code"]');
  if (codeInput) {
    codeInput.dataset.userEdited = "0";
    codeInput.value = "";
  }
  createPhOpener = rememberOpener();
  const dlg = $("#dlg-create-ph");
  const inlineErr = $("#create-ph-error");
  if (inlineErr) {
    inlineErr.hidden = true;
    inlineErr.textContent = "";
  }
  if (dlg && dlg.parentElement !== document.body) document.body.appendChild(dlg);
  dlg?.showModal();
  lockPageScroll(true);
  bindSheetViewport(dlg);
  createPhUntrap?.();
  createPhUnbindKeyboard?.();
  createPhUntrap = trapFocus(dlg);
  createPhUnbindKeyboard = wireSheetKeyboard(dlg);
  dlg?.querySelector(".app-sheet__body")?.scrollTo(0, 0);
  requestAnimationFrame(() => {
    $("#create-ph-title")?.focus?.({ preventScroll: true });
    nameInput?.focus?.({ preventScroll: true });
  });
}

function wireCreatePhCodeSuggest() {
  const form = $("#form-create-ph");
  if (!form || form.dataset.codeSuggestWired === "1") return;
  form.dataset.codeSuggestWired = "1";
  const nameInput = form.querySelector('input[name="name"]');
  const codeInput = form.querySelector('input[name="code"]');
  if (!nameInput || !codeInput) return;

  codeInput.addEventListener("input", () => {
    codeInput.dataset.userEdited = "1";
  });
  nameInput.addEventListener("input", () => {
    if (codeInput.dataset.userEdited === "1") return;
    codeInput.value = suggestPhCodeFromName(nameInput.value);
  });
}

function wireUi() {
  unitsHub = createUnitsHub({
    get user() { return user; },
    get currentPhId() { return currentPhId; },
    get currentPh() { return currentPh; },
    canAdministerCurrentPh,
    isPhTabFresh,
    markPhTabFresh,
    switchTab,
  });
  unitsHub.wire();

  applyCreatePhGate();
  wireCreatePhCodeSuggest();
  $("#btn-create-ph").addEventListener("click", openCreatePhDialog);
  $("#btn-create-first")?.addEventListener("click", openCreatePhDialog);
  const closeCreate = () => {
    $("#dlg-create-ph")?.close();
  };
  $("#btn-cancel-create").addEventListener("click", closeCreate);
  $("#btn-cancel-create-foot")?.addEventListener("click", closeCreate);
  $("#dlg-create-ph")?.addEventListener("close", () => {
    createPhUntrap?.();
    createPhUnbindKeyboard?.();
    createPhUntrap = null;
    createPhUnbindKeyboard = null;
    lockPageScroll(false);
    restoreOpener(createPhOpener);
    createPhOpener = null;
  });
  $("#form-create-ph").addEventListener("submit", onCreatePh);
  $("#btn-continue-config")?.addEventListener("click", () => {
    $("#dlg-ph-created").close();
    if (currentPhId) {
      openPh(currentPhId).then(() => switchTab("units"));
    }
  });
  $("#form-ph").addEventListener("submit", onSavePh);
  $("#btn-mark-ready").addEventListener("click", async () => {
    try {
      await api(`/api/ph/${currentPhId}/ready`, { method: "POST" });
      AppFeedback.success("La propiedad está lista para convocar asambleas.", { title: "PH listo" });
      await openPh(currentPhId);
    } catch (err) {
      AppFeedback.fromError(err);
      await loadReadiness();
    }
  });
  $("#btn-activate-ph").addEventListener("click", async () => {
    await api(`/api/ph/${currentPhId}/activate`, { method: "POST" });
    AppFeedback.success("La propiedad horizontal quedó activa.", { title: "PH activado" });
    await openPh(currentPhId);
  });
  $("#btn-continue-onboarding")?.addEventListener("click", () => {
    if (isOnboardingMode(currentPh)) {
      switchTab("info");
      return;
    }
    switchTab("info");
  });
  $("#btn-archive-ph")?.addEventListener("click", onArchivePh);
  $("#btn-reactivate-ph").addEventListener("click", onReactivatePh);
  $("#btn-delete-ph")?.addEventListener("click", onDeletePh);

  document.querySelectorAll(".tabs button, .ph-module-tabs button").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  document.querySelectorAll("#asm-filters button").forEach((btn) => {
    btn.addEventListener("click", () => {
      asmFilter = btn.dataset.filter || "upcoming";
      syncAsmFilterButtons();
      renderAssembliesList();
    });
  });

  $("#asm-search")?.addEventListener("input", (ev) => {
    asmSearch = String(ev.target.value || "");
    renderAssembliesList();
  });

  window.addEventListener("hashchange", () => {
    if (currentPhId) applyHashTab();
  });

  $("#btn-new-unit").addEventListener("click", () => {
    $("#unit-form-wrap").hidden = true;
    $("#bulk-form-wrap").hidden = true;
  });
  $("#btn-bulk-units").addEventListener("click", () => {
    $("#bulk-form-wrap").hidden = false;
    $("#unit-form-wrap").hidden = true;
  });
  $("#form-unit").addEventListener("submit", onCreateUnit);
  $("#btn-bulk-preview").addEventListener("click", () => runBulk(true));
  $("#form-bulk").addEventListener("submit", (e) => {
    e.preventDefault();
    runBulk(false);
  });
  $("#unit-search").addEventListener("input", () => {
    window.clearTimeout(unitSearchTimer);
    unitSearchTimer = window.setTimeout(() => loadUnits(), 250);
  });
  $("#form-transfer")?.addEventListener("submit", onTransferOwnership);
  $("#btn-cancel-transfer")?.addEventListener("click", () => {
    const dlg = $("#transfer-dialog");
    if (dlg) dlg.hidden = true;
  });

  $("#btn-new-owner").addEventListener("click", () => startOwnerCreate());
  $("#btn-empty-add-owner")?.addEventListener("click", () => startOwnerCreate());
  $("#btn-cancel-owner")?.addEventListener("click", () => cancelOwnerSheet());
  $("#owner-sheet-close")?.addEventListener("click", () => closeOwnerSheet({ restore: true }));
  $("#dlg-owner")?.addEventListener("close", () => {
    ownerSheet.untrap?.();
    ownerSheet.unbind?.();
    ownerSheet.untrap = null;
    ownerSheet.unbind = null;
    lockPageScroll(false);
    if (ownerSheet.opener) restoreOpener(ownerSheet.opener);
    ownerSheet.opener = null;
  });
  $("#dlg-owner")?.addEventListener("cancel", (ev) => {
    ev.preventDefault();
    if (ownerSheet.mode === "edit" && ownerSheet.returnTo === "view" && ownerSheet.ownerId) {
      void showOwner(ownerSheet.ownerId, { keepOpen: true });
      return;
    }
    closeOwnerSheet({ restore: true });
  });
  $("#btn-goto-import")?.addEventListener("click", () => {
    switchTab("import");
    openRosterImport();
  });
  $("#btn-empty-import")?.addEventListener("click", () => {
    switchTab("import");
    openRosterImport();
  });
  $("#btn-open-roster-import")?.addEventListener("click", () => openRosterImport());
  $("#btn-units-goto-import")?.addEventListener("click", () => {
    switchTab("import");
    openRosterImport();
  });
  $("#asm-summary-close")?.addEventListener("click", closeAssemblySummary);
  $("#dlg-asm-summary")?.addEventListener("close", () => {
    asmSummaryUntrap?.();
    asmSummaryUnbind?.();
    asmSummaryUntrap = null;
    asmSummaryUnbind = null;
    lockPageScroll(false);
    restoreOpener(asmSummaryOpener);
    asmSummaryOpener = null;
    window.scrollTo(0, asmListY || 0);
  });
  $("#form-owner").addEventListener("submit", onSaveOwner);
  $("#owner-unit-select")?.addEventListener("change", () => syncOwnerShareForSelectedUnit());
  $("#owner-search")?.addEventListener("input", () => {
    window.clearTimeout(ownerSearchTimer);
    ownerSearchTimer = window.setTimeout(() => loadOwners(), 250);
  });
  $("#btn-owner-filters")?.addEventListener("click", () => {
    const pop = $("#owner-filters-popover");
    if (!pop) return;
    pop.hidden = !pop.hidden;
    $("#btn-owner-filters").setAttribute("aria-expanded", String(!pop.hidden));
  });
  $("#btn-filters-apply")?.addEventListener("click", () => {
    $("#owner-filters-popover").hidden = true;
    $("#btn-owner-filters")?.setAttribute("aria-expanded", "false");
    renderOwnerFilterChips();
    loadOwners();
  });
  $("#btn-filters-clear")?.addEventListener("click", () => {
    ["filter-tower", "filter-status", "filter-email", "filter-access", "filter-invited"].forEach((id) => {
      const el = $(`#${id}`);
      if (el) el.value = "";
    });
    syncAccessFilterUi();
    renderOwnerFilterChips();
    loadOwners();
  });
  $("#owner-access-filters")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-access-filter]");
    if (!btn) return;
    const select = $("#filter-access");
    if (select) select.value = btn.dataset.accessFilter || "";
    syncAccessFilterUi();
    renderOwnerFilterChips();
    loadOwners();
  });
  $("#filter-access")?.addEventListener("change", syncAccessFilterUi);
  document.querySelectorAll("[data-close-owner-drawer]").forEach((el) => {
    el.addEventListener("click", () => closeOwnerSheet({ restore: true }));
  });
  $("#btn-export-owners")?.addEventListener("click", exportOwners);
  $("#btn-validate-owners")?.addEventListener("click", validateOwnersBulk);
  $("#btn-bulk-invite")?.addEventListener("click", bulkInvite);
  $("#owners-check-all")?.addEventListener("change", (e) => {
    document.querySelectorAll("#owners-table tbody input[type=checkbox]").forEach((cb) => {
      cb.checked = e.target.checked;
    });
  });

}

async function refreshSwitcher() {
  // Legacy select removed — global topbar switcher owns PH switching.
  try {
    const { loadMyMemberships, hydratePhContext } = await import("./ph-context.js");
    hydratePhContext({ user });
    const memberships = await loadMyMemberships();
    myMemberships = memberships;
    if (currentPhId) {
      hydratePhContext({
        phId: currentPhId,
        phName: currentPh?.name || null,
        user
      });
    }
    const { mountGlobalPhSwitcher } = await import("./ph-switcher.js");
    await mountGlobalPhSwitcher();
  } catch {
    myMemberships = [];
  }
}

async function onSwitchPh(_ev) {
  /* no-op: global switcher */
}

function phStatusBadgeClass(status) {
  if (status === "Active") return "badge bg-green-lt";
  if (status === "ReadyForAssembly") return "badge bg-blue-lt";
  if (status === "Inactive") return "badge bg-secondary-lt";
  return "badge bg-yellow-lt";
}

function phActionsMenu(p) {
  const archiveOrRestore =
    p.status === "Inactive"
      ? `<button type="button" class="dropdown-item" data-reactivate="${p.id}">Reactivar</button>`
      : `<button type="button" class="dropdown-item" data-archive="${p.id}">Archivar</button>`;
  const del = canAdministerPh(p.id)
    ? `<button type="button" class="dropdown-item text-danger" data-delete="${p.id}">Eliminar…</button>`
    : "";
  return `
    <div class="dropdown">
      <button type="button" class="btn btn-ghost-secondary btn-icon" data-bs-toggle="dropdown" aria-expanded="false" aria-haspopup="menu" aria-label="Acciones de ${escapeHtml(p.name)}">
        <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="20" height="20" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" aria-hidden="true"><path d="M12 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /><path d="M12 19m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /><path d="M12 5m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /></svg>
      </button>
      <div class="dropdown-menu dropdown-menu-end">
        <button type="button" class="dropdown-item" data-edit="${p.id}">Editar</button>
        ${archiveOrRestore}
        ${del}
      </div>
    </div>`;
}

function bindPhListActions(root) {
  root.querySelectorAll(".ph-open-link").forEach((a) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      openPh(a.dataset.view);
    });
  });
  root.querySelectorAll("[data-edit]").forEach((btn) => {
    btn.addEventListener("click", () => {
      openPh(btn.dataset.edit).then(() => switchTab("info"));
    });
  });
  root.querySelectorAll("[data-archive]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      currentPhId = btn.dataset.archive;
      const prev = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Archivando…";
      try {
        await onArchivePh();
        await loadList();
      } finally {
        btn.disabled = false;
        btn.textContent = prev;
      }
    })
  );
  root.querySelectorAll("[data-reactivate]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      currentPhId = btn.dataset.reactivate;
      const prev = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Reactivando…";
      try {
        await onReactivatePh();
        await loadList();
      } finally {
        btn.disabled = false;
        btn.textContent = prev;
      }
    })
  );
  root.querySelectorAll("[data-delete]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      currentPhId = btn.dataset.delete;
      const prev = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Eliminando…";
      try {
        await onDeletePh();
        await loadList();
      } finally {
        btn.disabled = false;
        btn.textContent = prev;
      }
    })
  );
}

async function loadList() {
  clearAlert();
  const root = $("#ph-list");
  const empty = $("#ph-empty");
  const status = $("#ph-list-status");
  const errBox = $("#ph-list-error");
  if (!root) return;
  if (empty) empty.hidden = true;
  if (errBox) {
    errBox.hidden = true;
    errBox.textContent = "";
  }
  if (status) status.hidden = false;
  root.innerHTML = "";
  let list = [];
  try {
    list = await cachedGet("/api/ph", { ttlMs: 5000, cacheKey: "GET:/api/ph" });
  } catch (err) {
    if (status) status.hidden = true;
    if (errBox) {
      errBox.hidden = false;
      errBox.textContent = err?.message || "No se pudieron cargar las propiedades.";
    }
    return;
  }
  if (status) status.hidden = true;
  if (!list.length) {
    if (empty) empty.hidden = false;
    root.innerHTML = "";
    return;
  }
  if (empty) empty.hidden = true;
  const rows = list
    .map((p) => {
      const href = `/ph.html?phId=${encodeURIComponent(p.id)}`;
      const badge = `<span class="${phStatusBadgeClass(p.status)}">${escapeHtml(phLifecycleLabel(p.status))}</span>`;
      return `
        <tr>
          <td>
            <div class="ph-row">
              <span class="ph-row__icon" aria-hidden="true">${PH_BUILDING_ICON}</span>
              <div>
                <a class="ph-open-link ph-name-link" href="${href}" data-view="${p.id}">${escapeHtml(p.name)}</a>
                <div class="ph-row__meta">${badge}
                  <span class="ph-row__counts">${Number(p.unitCount ?? 0)} unid. · ${Number(p.ownerCount ?? 0)} prop.</span>
                </div>
              </div>
            </div>
          </td>
          <td class="w-1">
            <div class="ph-row__actions">
              <a class="btn btn-primary btn-sm ph-open-link" href="${href}" data-view="${p.id}">Abrir PH</a>
              ${phActionsMenu(p)}
            </div>
          </td>
        </tr>`;
    })
    .join("");
  const cards = list
    .map((p) => {
      const href = `/ph.html?phId=${encodeURIComponent(p.id)}`;
      const badge = `<span class="${phStatusBadgeClass(p.status)}">${escapeHtml(phLifecycleLabel(p.status))}</span>`;
      return `
        <div class="card">
          <div class="card-body">
            <div class="ph-row">
              <span class="ph-row__icon" aria-hidden="true">${PH_BUILDING_ICON}</span>
              <div class="flex-fill">
                <a class="ph-open-link ph-name-link" href="${href}" data-view="${p.id}">${escapeHtml(p.name)}</a>
                <div class="ph-row__meta">${badge}
                  <span class="ph-row__counts">${Number(p.unitCount ?? 0)} unid. · ${Number(p.ownerCount ?? 0)} prop.</span>
                </div>
              </div>
              ${phActionsMenu(p)}
            </div>
            <a class="btn btn-primary w-100 mt-3 ph-open-link" href="${href}" data-view="${p.id}">Abrir PH</a>
          </div>
        </div>`;
    })
    .join("");
  root.innerHTML = `
    <div class="card" id="ph-list-table-wrap">
      <div class="table-responsive">
        <table class="table table-vcenter card-table table-nowrap">
          <thead class="visually-hidden">
            <tr>
              <th>Propiedad</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
    <div class="ph-stack">${cards}</div>`;
  bindPhListActions(root);
}

async function onCreatePh(ev) {
  ev.preventDefault();
  ev.stopPropagation();
  if (createPhBusy) return;
  createPhBusy = true;
  if (!canCreatePh()) {
    AppFeedback.error("No tienes permiso para crear un PH. Se requiere «Administrar PH».", {
      title: "Creación bloqueada"
    });
    createPhBusy = false;
    return;
  }

  const form = ev.target;
  const submitBtn = form.querySelector('button[type="submit"]') || $("#btn-submit-create-ph");
  if (submitBtn) submitBtn.disabled = true;
  const data = formData(form);

    const inlineErr = $("#create-ph-error");
    if (inlineErr) {
      inlineErr.hidden = true;
      inlineErr.textContent = "";
    }

  try {
    const created = await runWithButton(submitBtn, "Creando…", async () => {
      await applyTestHooks();
      return api("/api/ph", {
        method: "POST",
        body: {
          name: data.name,
          legalName: data.legalName || null,
          code: data.code?.trim() || null,
          country: data.country || null,
          stateProvince: data.stateProvince || null,
          city: data.city || null,
          address: data.address || null,
          timeZoneId: data.timeZoneId,
          adminEmail: data.adminEmail || null,
          phone: data.phone || null,
          organizationId: null
        },
        dedupeKey: "ph-create"
      });
    });

    $("#dlg-create-ph").close();
    form.reset();
    invalidateCachedGet("GET:/api/ph");
    invalidateCachedGet("GET:/api/ph/memberships/mine");
    AppFeedback.success(`${created.name} está listo para comenzar.`, { title: "PH creado" });
    await refreshSwitcher();
    currentPhId = created.id;
    $("#dlg-ph-created-name").textContent = created.name;
    $("#dlg-ph-created").showModal();
  } catch (err) {
    const status = err?.status;
    let msg = err?.message || "No se pudo crear el PH.";
    if (status === 403) {
      msg =
        "No tienes permiso para crear el PH. Tu rol no incluye «Administrar PH». " +
        "Usa Administrador PH (phadmin@ocean.demo) o Presidente de asamblea, e inicia sesión de nuevo.";
    } else if (status === 401) {
      msg = "Tu sesión expiró. Vuelve a iniciar sesión e intenta crear el PH otra vez.";
    }
    if (inlineErr) {
      inlineErr.hidden = false;
      inlineErr.textContent = msg;
    }
    AppFeedback.error(msg, { title: "No se creó el PH" });
  } finally {
    createPhBusy = false;
  }
}

let openPhSeq = 0;

async function openPh(id, preferredTab = null) {
  const seq = ++openPhSeq;
  clearAlert();
  const previousPh = currentPh;
  currentPhId = id;
  $("#view-list").hidden = true;
  $("#view-detail").hidden = false;
  unitsHub?.reset?.();
  const samePh = previousPh && String(previousPh.id) === String(id);
  const listedName =
    myMemberships.find((m) => String(m.propertyHorizontalId) === String(id))?.name ||
    (samePh ? previousPh?.name : null);
  setDetailBusy(true, listedName ? `Cargando ${listedName}…` : "Cargando propiedad…");
  const title = $("#ph-title");
  if (listedName && title) title.textContent = listedName;
  else if (!samePh && title) title.textContent = "Cargando…";
  if (!samePh) currentPh = null;
  startTopProgress();
  let ph;
  try {
    ph = await api(`/api/ph/${id}`);
  } catch (err) {
    if (seq === openPhSeq) {
      setDetailBusy(false);
      stopTopProgress();
    }
    throw err;
  }
  if (seq !== openPhSeq) {
    stopTopProgress();
    return;
  }
  currentPh = ph;
  // Keep deep-link URL in sync so sidebar Unidades stays on the premium hub path.
  try {
    const u = new URL(location.href);
    if (u.searchParams.get("phId") !== String(id)) {
      u.searchParams.set("phId", String(id));
      const hash = preferredTab ? `#${preferredTab}` : (u.hash || "#resumen");
      history.replaceState({ hybrid: true, page: "ph.html" }, document.title, `${u.pathname}?${u.searchParams.toString()}${hash.startsWith("#") ? hash : "#" + hash}`);
    }
  } catch { /* ignore */ }

  $("#ph-title").textContent = ph.name;
  applyPhCover(ph);
  const eyebrow = document.querySelector("#ph-hero .command-eyebrow");
  if (eyebrow) eyebrow.textContent = "Propiedad horizontal";
  const prepHint =
    ph.status === "ReadyForAssembly"
      ? `<span class="badge bg-blue-lt">Lista para convocar</span>`
      : "";
  $("#ph-meta").innerHTML = `<span class="${phStatusBadgeClass(ph.status)}">${escapeHtml(phLifecycleLabel(ph.status))}</span>${prepHint}`;

  applyPhMode(ph);

  // Detail DTO may omit aggregate counts — enrich from list summary when needed.
  let unitCount = ph.unitCount;
  let ownerCount = ph.ownerCount;
  let activeUserCount = ph.activeUserCount;
  let coefficientTotalPercent = ph.coefficientTotalPercent;
  let coefficientsComplete = ph.coefficientsComplete;
  if (unitCount == null || ownerCount == null) {
    try {
      const list = await cachedGet("/api/ph", { ttlMs: 5000, cacheKey: "GET:/api/ph" });
      const row = (list || []).find((p) => String(p.id) === String(id));
      if (row) {
        unitCount = row.unitCount;
        ownerCount = row.ownerCount;
        activeUserCount = row.activeUserCount;
        coefficientTotalPercent = row.coefficientTotalPercent;
        coefficientsComplete = row.coefficientsComplete;
        ph.unitCount = unitCount;
        ph.ownerCount = ownerCount;
        ph.activeUserCount = activeUserCount;
        ph.coefficientTotalPercent = coefficientTotalPercent;
        ph.coefficientsComplete = coefficientsComplete;
        ph.nextAssemblyAtUtc = ph.nextAssemblyAtUtc ?? row.nextAssemblyAtUtc;
        ph.nextAssemblyTitle = ph.nextAssemblyTitle ?? row.nextAssemblyTitle;
      }
    } catch {
      /* ignore */
    }
  }
  if (seq !== openPhSeq) {
    stopTopProgress();
    return;
  }

  $("#ph-stat-strip").innerHTML = [
    phStatCard("Unidades", unitCount ?? 0, "units"),
    phStatCard("Propietarios", ownerCount ?? 0, "owners"),
    phStatCard("Usuarios activos", activeUserCount ?? 0, "users"),
    phStatCard("Coeficientes", coefficientsComplete ? "100%" : `${Number(coefficientTotalPercent ?? 0).toFixed(0)}%`, "coeff")
  ].join("");

  const nextHost = $("#ph-next-assembly");
  if (nextHost) {
    nextHost.hidden = true;
    nextHost.innerHTML = "";
  }
  renderPhCommand(ph, id);

  const newAsm = $("#btn-new-assembly");
  if (newAsm) {
    newAsm.href = `/preparar.html?phId=${encodeURIComponent(id)}`;
  }
  applyNewAssemblyGate();

  const asmTitle = $("#ph-assemblies-title");
  if (asmTitle) asmTitle.textContent = "Asambleas";
  const asmLede = $("#ph-assemblies-lede");
  if (asmLede) {
    asmLede.textContent = "Administra las reuniones, convocatorias y resultados del PH.";
  }

  mountIaShell(
    {
      level: "ph",
      user,
      phId: id,
      phName: ph.name,
      current: "ph-overview"
    },
    {
      breadcrumbs: [
        { label: "Propiedades", href: "/ph.html" },
        { label: ph.name }
      ]
    }
  );

  try {
    const { hydratePhContext, ensureActivePhClaim, setDirtyGuard } = await import("./ph-context.js");
    if (String(user?.propertyHorizontalId || "") !== String(id)) {
      await ensureActivePhClaim(id);
      user = (await me()) || user;
    }
    hydratePhContext({ phId: id, phName: ph.name, user, bump: true });
    setDirtyGuard(() => {
      const dirty = Boolean(phFormBinder?.isDirty?.() || phFormBinder?.dirty);
      return dirty
        ? { dirty: true, message: "Hay cambios sin guardar en la configuración del PH." }
        : false;
    });
  } catch {
    /* ignore */
  }
  if (seq !== openPhSeq) {
    stopTopProgress();
    return;
  }

  window.__asambleasOpenPh = (phId) => openPh(phId, (location.hash || "").replace("#", "") || null);

  if (isOnboardingMode(ph)) {
    renderSteps(ph.onboardingStep);
  }
  const form = $("#form-ph");
  form.name.value = ph.name || "";
  form.legalName.value = ph.legalName || "";
  form.code.value = ph.code || "";
  form.country.value = ph.country || "";
  form.stateProvince.value = ph.stateProvince || "";
  form.city.value = ph.city || "";
  form.address.value = ph.address || "";
  form.timeZoneId.value = ph.timeZoneId || "";
  form.adminEmail.value = ph.adminEmail || "";
  form.phone.value = ph.phone || "";
  if (form.concurrencyStamp) form.concurrencyStamp.value = ph.concurrencyStamp || "";
  const inactive = ph.status === "Inactive";
  $("#btn-archive-ph").hidden = inactive;
  $("#btn-template").href = `/api/ph/${id}/import/template`;
  const initialTab = canonicalPhTab(preferredTab) || (isOnboardingMode(ph) ? "info" : "resumen");
  const allowed = new Set(["resumen", "info", "assemblies", "units", "owners", "coefficients", "import", "readiness"]);
  invalidatePhTabData(id);
  // Lazy-load only the active tab (switchTab). Avoids 5 parallel GETs on every PH open.
  switchTab(allowed.has(initialTab) ? initialTab : isOnboardingMode(ph) ? "info" : "resumen");
  setupPhFormBinder();
  // Defer delete-eval so tab content paints before the secondary risk check.
  void refreshPhDeleteAvailability();
  // Enrich next-assembly CTA when calendar rows are already warm (assemblies tab).
  const nextBtn = $("#btn-view-next-assembly");
  const upcoming = phAssemblies.find((e) => assemblyListTimeBucket(e) === "upcoming" || assemblyListTimeBucket(e) === "live");
  if (nextBtn && upcoming) {
    nextBtn.href = `/dashboard.html?assemblyId=${encodeURIComponent(upcoming.assemblyId)}`;
    nextBtn.textContent = "Ver asamblea";
  }
  if (seq === openPhSeq) {
    setDetailBusy(false);
    stopTopProgress();
  }
}

function setupPhFormBinder() {
  const form = $("#form-ph");
  if (!form) return;
  phFormBinder?.destroy?.();
  phFormBinder = bindStickyForm(form, {
    bar: $("#ph-sticky-actions"),
    hint: $("#ph-dirty-hint"),
    saveBtn: $("#btn-ph-save"),
    cancelBtn: $("#btn-ph-discard")
  });
  phFormBinder.markClean();
}

async function refreshPhDeleteAvailability() {
  const delBtn = $("#btn-delete-ph");
  if (!delBtn || !currentPhId) return;
  try {
    const evaluation = await api(`/api/ph/${currentPhId}/delete-evaluation`);
    delBtn.hidden = false;
    delBtn.disabled = !evaluation.canHardDelete;
    delBtn.title = evaluation.canHardDelete
      ? evaluation.summary || "Eliminar permanentemente"
      : (evaluation.blockingReasons || []).join(" ") || evaluation.summary || "No se puede eliminar";
    const copy = $("#ph-danger-copy");
    if (copy) {
      if (evaluation.canHardDelete) {
        copy.textContent =
          evaluation.summary ||
          "Puedes eliminar este PH de forma permanente. Esta acción no se puede deshacer.";
      } else {
        copy.textContent =
          `${evaluation.summary || "No se puede eliminar."} ${(evaluation.blockingReasons || []).join(" ")} Usa Archivar para sacarlo de operación sin destruir evidencias.`.trim();
      }
    }
  } catch {
    delBtn.hidden = false;
    delBtn.disabled = true;
  }
}

function renderSteps(current) {
  const root = $("#wizard-steps");
  root.innerHTML = STEP_LABELS.map((label, i) => {
    const n = i + 1;
    const cls = n < current ? "is-done" : n === current ? "is-active" : "";
    const rail = i < STEP_LABELS.length - 1 ? `<span class="rail" aria-hidden="true"></span>` : "";
    return `<span class="step ${cls}"><span class="num">${n}</span> ${label}</span>${rail}`;
  }).join("");
}

function switchTab(tab) {
  document.querySelectorAll(".ph-module-tabs button, .tabs button").forEach((b) =>
    b.classList.toggle("is-active", b.dataset.tab === tab)
  );
  document.querySelectorAll(".wizard-panel").forEach((p) => {
    p.hidden = p.dataset.panel !== tab;
  });
  $("#view-detail")?.setAttribute("data-active-panel", tab);
  const unitsLabel = $("#units-ph-label");
  if (unitsLabel) unitsLabel.textContent = currentPh?.name || "PH";
  if (tab === "units") loadUnits({ soft: false });
  if (tab === "owners") {
    loadOwners({ soft: true });
    void ensureOwnerUnitSelectOptions();
  }
  if (tab === "coefficients") loadCoefficients({ soft: true });
  if (tab === "readiness") loadReadiness({ soft: true });
  if (tab === "assemblies") loadAssemblies({ soft: true });
  if (tab === "resumen") {
    renderAttentionAndPrep(currentPh);
    loadAssemblies({ soft: true });
  }
  if (tab === "import") {
    /* import wizard is on-demand */
  }

  const currentMap = {
    resumen: "ph-overview",
    info: "ph-config",
    assemblies: "ph-assemblies",
    units: "ph-units",
    owners: "ph-owners",
    coefficients: "ph-coefficients",
    import: "ph-import",
    readiness: "ph-readiness"
  };
  if (currentPh) {
    mountIaShell(
      {
        level: "ph",
        user,
        phId: currentPhId,
        phName: currentPh.name,
        current: currentMap[tab] || "ph-overview"
      },
      {
        breadcrumbs: [
          { label: "Propiedades", href: "/ph.html" },
          { label: currentPh.name, href: phHref(currentPhId, "resumen") },
          tab === "resumen" ? null : { label: tabLabel(tab) }
        ].filter(Boolean)
      }
    );
  }

  const desiredHash = tab === "info" ? "info" : tab;
  try {
    const u = new URL(location.href);
    if (currentPhId) u.searchParams.set("phId", String(currentPhId));
    const next = `${u.pathname}?${u.searchParams.toString()}#${desiredHash}`;
    if (location.pathname + location.search + location.hash !== next) {
      const write = applyingRoute ? history.replaceState.bind(history) : history.pushState.bind(history);
      write({ hybrid: true, page: "ph.html" }, document.title, next);
    }
  } catch {
    if (location.hash.replace("#", "") !== desiredHash) {
      const write = applyingRoute ? history.replaceState.bind(history) : history.pushState.bind(history);
      write({ hybrid: true, page: "ph.html" }, document.title, `${location.pathname}${location.search}#${desiredHash}`);
    }
  }
  focusPhPanelTitle(tab);
}

function focusPhPanelTitle(tab) {
  if ($("#dlg-owner")?.open || $("#dlg-unit-hub")?.open || $("#dlg-create-ph")?.open) return;
  const map = {
    resumen: "#ph-title",
    info: "#ph-config-title",
    assemblies: "#ph-assemblies-title",
    units: "#units-title",
    owners: "#owners-title",
    coefficients: "#coeff-title",
    import: "#import-ph-title",
    readiness: "#readiness-title"
  };
  const el = $(map[tab] || "");
  if (!el) return;
  if (!el.hasAttribute("tabindex")) el.tabIndex = -1;
  try {
    el.focus({ preventScroll: false });
  } catch {
    /* ignore */
  }
}

function tabLabel(tab) {
  const labels = {
    resumen: "Resumen",
    info: "Configuración",
    assemblies: "Asambleas",
    units: "Unidades",
    owners: "Propietarios",
    coefficients: "Coeficientes",
    import: "Importar propietarios y unidades",
    readiness: "Preparación"
  };
  return labels[tab] || tab;
}

async function renderAttentionAndPrep(ph) {
  if (!ph || !currentPhId) return;
  const attention = $("#ph-attention");
  const prep = $("#ph-prep-summary");
  if (!attention || !prep) return;

  let issues = [];
  try {
    const validation = await api(`/api/ph/${currentPhId}/owners/validate-bulk`, { method: "POST" });
    if (validation.withoutEmail) issues.push(`${validation.withoutEmail} propietarios sin correo`);
    if (validation.withoutUnit) issues.push(`${validation.withoutUnit} propietarios sin unidad`);
    if (validation.withoutUser) issues.push(`${validation.withoutUser} propietarios sin acceso activado`);
  } catch {
    /* ignore */
  }
  if (!ph.coefficientsComplete) issues.push("Coeficientes incompletos");

  if (issues.length) {
    attention.hidden = false;
    attention.innerHTML = `
      <div class="card">
        <div class="card-body">
          <h3 class="card-title">Atención</h3>
          <ul class="mb-3">${issues.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>
          <button type="button" class="btn btn-secondary" id="btn-review-pending">Revisar pendientes</button>
        </div>
      </div>`;
    $("#btn-review-pending")?.addEventListener("click", () => switchTab("owners"));
  } else {
    attention.hidden = true;
    attention.innerHTML = "";
  }

  prep.hidden = false;
  prep.innerHTML = `
    <div class="card">
      <div class="card-body">
        <h3 class="card-title">Preparación del PH</h3>
        <ul class="mb-0">
          <li>${(ph.unitCount ?? 0) > 0 ? "✓" : "○"} Unidades</li>
          <li>${(ph.ownerCount ?? 0) > 0 ? "✓" : "○"} Propietarios</li>
          <li>${ph.coefficientsComplete ? "✓" : "⚠"} Coeficientes</li>
          <li>${ph.status === "Active" || ph.status === "ReadyForAssembly" ? "✓" : "○"} Activación</li>
        </ul>
      </div>
    </div>`;
}

let assembliesLoadInflight = null;
let assembliesLoadPh = null;

async function loadAssemblies({ soft = false } = {}) {
  if (!currentPhId) {
    const host = $("#ph-assemblies-list");
    if (host) {
      host.innerHTML = asmEmptyHtml({
        title: "Selecciona un PH",
        subtitle: "Elige una propiedad para ver sus asambleas."
      });
    }
    phAssemblies = [];
    assembliesLoadInflight = null;
    assembliesLoadPh = null;
    return;
  }
  if (soft && isPhTabFresh("assemblies") && phAssemblies.length) {
    renderAssembliesList();
    return;
  }
  const host = $("#ph-assemblies-list");
  if (!host) return;
  const requestPh = String(currentPhId);
  if (assembliesLoadInflight && assembliesLoadPh === requestPh) {
    return assembliesLoadInflight;
  }
  host.innerHTML = `<div class="card" aria-busy="true"><div class="card-body"><div class="progress progress-sm"><div class="progress-bar progress-bar-indeterminate"></div></div><p class="text-secondary mt-2 mb-0">Cargando asambleas…</p></div></div>`;
  // Assign synchronously before any await so concurrent tab/hash callers join the same promise.
  assembliesLoadPh = requestPh;
  let resolveGate;
  assembliesLoadInflight = new Promise((r) => {
    resolveGate = r;
  });
  const work = (async () => {
    try {
      // Stabilize window to minute boundaries so concurrent tab/hash triggers share one request.
      const from = new Date();
      from.setMonth(from.getMonth() - 6);
      from.setSeconds(0, 0);
      const to = new Date();
      to.setMonth(to.getMonth() + 12);
      to.setSeconds(0, 0);
      const data = await api(
        `/api/calendar/events?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}&propertyHorizontalId=${encodeURIComponent(requestPh)}`,
        { dedupeKey: `ph-assemblies:${requestPh}` }
      );
      // Drop stale responses after a PH switch.
      if (String(currentPhId) !== requestPh) return;
      phAssemblies = Array.isArray(data?.events) ? data.events : Array.isArray(data) ? data : [];
      // Defense in depth: never render another PH's rows even if API misbehaves.
      phAssemblies = phAssemblies.filter(
        (e) => String(e.propertyHorizontalId || "") === requestPh
      );
      markPhTabFresh("assemblies");
      renderAssembliesList();
      if (currentPh) renderPhCommand(currentPh, requestPh);
    } catch (err) {
      if (String(currentPhId) !== requestPh) return;
      host.innerHTML = `
        <div class="empty" role="alert">
          <p class="empty-title">No se pudieron cargar las asambleas</p>
          <p class="empty-subtitle text-secondary">${escapeHtml(err.message || "Comprueba tu conexión e inténtalo de nuevo.")}</p>
          <div class="empty-action">
            <button type="button" class="btn btn-secondary" data-retry-assemblies>Reintentar</button>
          </div>
        </div>`;
      host.querySelector("[data-retry-assemblies]")?.addEventListener("click", () => {
        assembliesLoadInflight = null;
        assembliesLoadPh = null;
        loadAssemblies({ soft: false });
      });
    } finally {
      if (assembliesLoadPh === requestPh) {
        assembliesLoadInflight = null;
        assembliesLoadPh = null;
      }
    }
  })();
  resolveGate(work);
  assembliesLoadInflight = work;
  return work;
}

function renderPhCommand(ph, id) {
  const host = $("#ph-command");
  if (!host || !ph) return;
  const live = phAssemblies.find((e) => assemblyListBucket(e.status) === "live");
  const upcoming =
    phAssemblies.find((e) => assemblyListTimeBucket(e) === "upcoming") ||
    (ph.nextAssemblyTitle || ph.nextAssemblyAtUtc
      ? { title: ph.nextAssemblyTitle, scheduledAtUtc: ph.nextAssemblyAtUtc, status: "Scheduled" }
      : null);
  const canSchedule = canScheduleAssembly();

  if (live?.assemblyId) {
    const primary = resolvePrimaryAction(live, { assemblyId: live.assemblyId });
    host.dataset.kind = "live";
    host.innerHTML = `
      <div class="card">
        <div class="card-body">
          <div class="subheader">Asamblea en curso</div>
          <h2 class="mb-2">${escapeHtml(live.title || "Asamblea")}</h2>
          <p class="text-secondary mb-3">
            <span class="badge bg-green-lt">${escapeHtml(statusLabelEs(live.status))}</span>
          </p>
          <div class="d-flex flex-wrap gap-2">
            <a class="btn btn-primary" href="${primary.href || `/lobby.html?assemblyId=${encodeURIComponent(live.assemblyId)}`}">${escapeHtml(
              primary.label || "Entrar a la sala"
            )}</a>
            <a class="btn" href="/dashboard.html?assemblyId=${encodeURIComponent(live.assemblyId)}">Ver detalle</a>
          </div>
        </div>
      </div>`;
    return;
  }

  if (upcoming && (upcoming.title || upcoming.scheduledAtUtc)) {
    const when = upcoming.scheduledAtUtc ? formatDateTime(upcoming.scheduledAtUtc) : "Fecha por confirmar";
    const aid = upcoming.assemblyId;
    host.dataset.kind = "next";
    host.innerHTML = `
      <div class="card">
        <div class="card-body">
          <div class="subheader">Próxima asamblea</div>
          <h2 class="mb-2">${escapeHtml(upcoming.title || "Asamblea")}</h2>
          <p class="text-secondary mb-3">
            ${escapeHtml(when)}
            <span class="badge bg-blue-lt ms-1">${escapeHtml(statusLabelEs(upcoming.status || "Scheduled"))}</span>
          </p>
          <a class="btn btn-primary" id="btn-view-next-assembly" href="${
            aid
              ? preparationAction(upcoming).href
              : `/preparar.html?phId=${encodeURIComponent(id)}`
          }">${aid ? escapeHtml(preparationAction(upcoming).label) : "Nueva asamblea"}</a>
        </div>
      </div>`;
    return;
  }

  host.dataset.kind = "empty";
  host.innerHTML = `
    <div class="card">
      <div class="card-body">
        <div class="subheader">Próxima asamblea</div>
        <h2 class="mb-2">No hay asambleas programadas</h2>
        <p class="text-secondary mb-3">Cuando exista una reunión, aquí verás el estado y la acción disponible para tu rol.</p>
        ${
          canSchedule
            ? `<a class="btn btn-primary" href="/preparar.html?phId=${encodeURIComponent(id)}">Nueva asamblea</a>`
            : ""
        }
      </div>
    </div>`;
}

function assemblyListTimeBucket(entry) {
  const statusBucket = assemblyListBucket(entry.status);
  if (statusBucket !== "upcoming") return statusBucket;
  const when = new Date(entry.scheduledAtUtc).getTime();
  if (Number.isFinite(when) && when < Date.now() - 60000) return "overdue";
  return "upcoming";
}

function renderAssembliesList() {
  const host = $("#ph-assemblies-list");
  if (!host) return;
  const filterLabels = {
    upcoming: "Próximas",
    overdue: "Atrasadas",
    live: "En curso",
    done: "Finalizadas",
    cancelled: "Canceladas",
    all: "Todas"
  };
  const newAsmAction = canScheduleAssembly()
    ? `<a class="btn btn-primary" href="/preparar.html?phId=${encodeURIComponent(currentPhId || "")}">Nueva asamblea</a>`
    : "";

  if (!currentPhId) {
    host.innerHTML = asmEmptyHtml({
      title: "Selecciona un PH",
      subtitle: "Elige una propiedad para ver sus asambleas."
    });
    return;
  }

  const q = asmSearch.trim().toLowerCase();
  let rows =
    asmFilter === "all"
      ? phAssemblies
      : phAssemblies.filter((e) => assemblyListTimeBucket(e) === asmFilter);
  if (q) {
    rows = rows.filter((e) => String(e.title || "").toLowerCase().includes(q));
  }

  if (!phAssemblies.length) {
    host.innerHTML = asmEmptyHtml({
      title: "Este PH no tiene asambleas",
      subtitle: "Cuando programes la primera reunión, aparecerá aquí.",
      action: newAsmAction
    });
    return;
  }

  if (!rows.length) {
    const filterName = filterLabels[asmFilter] || asmFilter;
    host.innerHTML = asmEmptyHtml({
      title: q ? "Sin coincidencias" : `No hay asambleas en «${filterName}»`,
      subtitle: q
        ? `Ninguna asamblea coincide con «${q}».`
        : `Ninguna asamblea coincide con el filtro «${filterName}». Prueba otro estado o «Todas».`
    });
    return;
  }

  const sorted = [...rows].sort(
    (a, b) => new Date(a.scheduledAtUtc).getTime() - new Date(b.scheduledAtUtc).getTime()
  );

  const fmtRow = (e, { compact = false } = {}) => {
    const d = new Date(e.scheduledAtUtc);
    const when = Number.isNaN(d.getTime())
      ? "—"
      : d.toLocaleString("es-PA", {
          day: "numeric",
          month: "short",
          hour: "numeric",
          minute: "2-digit"
        });
    const id = encodeURIComponent(e.assemblyId);
    const bucket = assemblyListBucket(e.status);
    const primary = resolvePrimaryAction(e, { assemblyId: e.assemblyId });
    const prep = preparationAction(e);
    const continuePrep = bucket === "upcoming" && prep.pending;
    const primaryLabel = continuePrep ? prep.label : primary.label || (
      bucket === "done"
        ? "Ver resultados"
        : bucket === "live"
          ? "Entrar a la sala"
          : bucket === "cancelled"
            ? "Ver detalle"
            : "Ver asamblea"
    );
    const primaryHref = continuePrep ? prep.href : primary.href || (
      bucket === "live"
        ? `/lobby.html?assemblyId=${id}`
        : bucket === "done"
          ? `/minutes.html?assemblyId=${id}`
          : `/dashboard.html?assemblyId=${id}`
    );
    const secondary =
      bucket === "done"
        ? `<a class="btn btn-ghost btn-sm" href="/minutes.html?assemblyId=${id}">Acta</a>`
        : bucket === "upcoming"
          ? `<a class="btn btn-ghost btn-sm" href="/dashboard.html?assemblyId=${id}">Abrir asamblea</a>`
          : "";
    const moreMenu =
      bucket === "done" || bucket === "cancelled"
        ? `
      <details class="ia-row-menu">
        <summary class="btn btn-ghost btn-sm" aria-label="Más acciones">•••</summary>
        <div class="ia-row-menu__panel" role="menu">
          <button type="button" role="menuitem" data-asm-summary="${id}">Ver resumen</button>
          <a role="menuitem" href="/minutes.html?assemblyId=${id}">Acta</a>
          <a role="menuitem" href="/expediente.html?assemblyId=${id}">Expediente</a>
        </div>
      </details>`
        : `
      <details class="ia-row-menu">
        <summary class="btn btn-ghost btn-sm" aria-label="Más acciones">•••</summary>
        <div class="ia-row-menu__panel" role="menu">
          <button type="button" role="menuitem" data-asm-summary="${id}">Ver resumen</button>
          <a role="menuitem" href="/calendar.html?assemblyId=${id}">Reprogramar</a>
          <a role="menuitem" href="/preparar.html?assemblyId=${id}">Continuar preparación</a>
          <a role="menuitem" href="/minutes.html?assemblyId=${id}">Acta</a>
        </div>
      </details>`;

    const badgeClass = asmStatusBadgeClass(bucket);
    return {
      table: `
        <tr data-assembly-id="${escapeHtml(String(e.assemblyId))}" data-ph-id="${escapeHtml(String(e.propertyHorizontalId || currentPhId))}">
          <td><strong>${escapeHtml(e.title)}</strong></td>
          <td class="text-secondary">${escapeHtml(when)}</td>
          <td><span class="${badgeClass}">${escapeHtml(statusLabelEs(e.status))}</span></td>
          <td class="w-1">
            <button type="button" class="btn btn-ghost btn-sm" data-asm-summary="${id}">Consultar</button>
            <a class="btn btn-primary btn-sm" href="${primaryHref}">${escapeHtml(primaryLabel)}</a>
          </td>
        </tr>`,
      stack: `
      <div class="card" data-assembly-id="${escapeHtml(String(e.assemblyId))}" data-ph-id="${escapeHtml(String(e.propertyHorizontalId || currentPhId))}" data-status="${escapeHtml(String(e.status || ""))}">
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-start gap-2">
            <div>
              <strong>${escapeHtml(e.title)}</strong>
              <p class="text-secondary mb-0">${escapeHtml(when)} · ${escapeHtml(e.modality || "—")}${e.assemblyKind ? ` · ${escapeHtml(e.assemblyKind)}` : ""}</p>
            </div>
            <span class="${badgeClass}">${escapeHtml(statusLabelEs(e.status))}</span>
          </div>
          <div class="mt-3 d-flex flex-wrap gap-2">
            <button type="button" class="btn btn-ghost btn-sm" data-asm-summary="${id}">Consultar</button>
            <a class="btn btn-${compact ? "secondary" : "primary"} btn-sm" href="${primaryHref}">${escapeHtml(primaryLabel)}</a>
            ${secondary}
            ${moreMenu}
          </div>
        </div>
      </div>`
    };
  };

  const parts = sorted.map((e) => fmtRow(e, { compact: asmFilter === "done" }));
  host.innerHTML = `
    <div class="card asm-table-wrap">
      <div class="table-responsive">
        <table class="table card-table table-vcenter">
          <thead><tr><th>Asamblea</th><th>Fecha</th><th>Estado</th><th></th></tr></thead>
          <tbody>${parts.map((p) => p.table).join("")}</tbody>
        </table>
      </div>
    </div>
    <div class="asm-stack">${parts.map((p) => p.stack).join("")}</div>`;
  host.querySelectorAll("[data-asm-summary]").forEach((btn) => {
    btn.addEventListener("click", () => openAssemblySummary(btn.dataset.asmSummary, btn));
  });
}

function closeAssemblySummary() {
  const dlg = $("#dlg-asm-summary");
  if (dlg?.open) dlg.close();
}

async function openAssemblySummary(assemblyId, opener) {
  const dlg = $("#dlg-asm-summary");
  if (!dlg) return;
  const token = asmSummaryGuard.next();
  asmListY = window.scrollY || 0;
  asmSummaryOpener = opener || rememberOpener();
  if (dlg.parentElement !== document.body) document.body.appendChild(dlg);
  $("#asm-summary-status").textContent = "Cargando";
  $("#asm-summary-title").textContent = "Asamblea";
  $("#asm-summary-body").innerHTML = `<p class="muted" style="margin:0">Cargando resumen…</p>`;
  $("#asm-summary-foot").innerHTML = `<button type="button" class="btn btn-secondary" data-asm-summary-close>Cerrar</button>`;
  $("#asm-summary-foot [data-asm-summary-close]")?.addEventListener("click", closeAssemblySummary);
  lockPageScroll(true);
  if (!dlg.open) {
    try { dlg.showModal(); } catch { dlg.setAttribute("open", ""); }
  }
  bindSheetViewport(dlg);
  asmSummaryUntrap?.();
  asmSummaryUnbind?.();
  asmSummaryUntrap = trapFocus(dlg);
  asmSummaryUnbind = wireSheetKeyboard(dlg);
  requestAnimationFrame(() => $("#asm-summary-title")?.focus?.({ preventScroll: true }));
  const cached = phAssemblies.find((e) => String(e.assemblyId) === String(assemblyId));
  let ev = cached;
  try {
    await applyTestHooks();
    ev = await api(`/api/assemblies/${assemblyId}`);
  } catch (err) {
    if (!asmSummaryGuard.isCurrent(token)) return;
    if (cached) ev = cached;
    else {
      $("#asm-summary-status").textContent = "No disponible";
      $("#asm-summary-title").textContent = "Asamblea no encontrada";
      $("#asm-summary-body").innerHTML = `<p style="margin:0">Esta asamblea ya no está en el PH o no se pudo cargar.</p>`;
      $("#asm-summary-foot").innerHTML = `<button type="button" class="btn btn-primary" data-asm-summary-close>Volver a la lista</button>`;
      $("#asm-summary-foot [data-asm-summary-close]")?.addEventListener("click", closeAssemblySummary);
      return;
    }
  }
  if (!asmSummaryGuard.isCurrent(token)) return;
  const id = encodeURIComponent(ev.id || ev.assemblyId || assemblyId);
  const when = ev.scheduledAtUtc ? formatDateTime(ev.scheduledAtUtc) : "Sin fecha";
  const status = statusLabelEs(ev.status || ev.calendarStatus || "");
  const [dash, convRows] = await Promise.all([
    api(`/api/assemblies/${assemblyId}/dashboard`).catch(() => null),
    api(`/api/assemblies/${assemblyId}/convocations`).catch(() => [])
  ]);
  const counts = dash?.counts || {};
  const owners = counts.ownerParticipants ?? counts.OwnerParticipants;
  const desk = counts.deskStaff ?? counts.DeskStaff;
  const list = Array.isArray(convRows) ? convRows : [];
  const currentConv = [...list].sort((a, b) => (b.version || 0) - (a.version || 0))[0];
  const recipients = currentConv?.recipientCount ?? currentConv?.validRecipientCount;
  const figure = (value) => (value == null ? "No disponible en este resumen" : String(value));
  $("#asm-summary-title").textContent = ev.title || "Asamblea";
  $("#asm-summary-status").textContent = status || "Asamblea";
  $("#asm-summary-body").innerHTML = `
    <dl class="sheet-summary">
      <div><dt>Fecha</dt><dd>${escapeHtml(when)}</dd></div>
      <div><dt>Modalidad</dt><dd>${escapeHtml(ev.modality || "—")}</dd></div>
      <div><dt>Estado</dt><dd>${escapeHtml(status)}</dd></div>
      <div><dt>Propietarios convocados</dt><dd>${escapeHtml(figure(owners))}</dd></div>
      <div><dt>Personal de mesa</dt><dd>${escapeHtml(figure(desk))}</dd></div>
      <div><dt>Destinatarios de la convocatoria</dt><dd>${escapeHtml(figure(recipients))}</dd></div>
    </dl>`;
  const bucket = assemblyListBucket(ev.status);
  const prep = preparationAction({ ...ev, convocationStatus: currentConv?.status || ev.convocationStatus, assemblyId: ev.id || ev.assemblyId || assemblyId });
  const operate =
    bucket === "live"
      ? `<a class="btn btn-primary" href="/assembly.html?assemblyId=${id}">Entrar a la sala</a>`
      : bucket === "done"
        ? `<a class="btn btn-primary" href="/minutes.html?assemblyId=${id}">Ver acta</a>`
        : `<a class="btn btn-primary" href="${prep.href}">${escapeHtml(prep.label)}</a>`;
  $("#asm-summary-foot").innerHTML = `
    <button type="button" class="btn btn-secondary" data-asm-summary-close>Cerrar</button>
    ${operate}`;
  $("#asm-summary-foot [data-asm-summary-close]")?.addEventListener("click", closeAssemblySummary);
}

async function confirmAction(title, body, okLabel = "Confirmar") {
  $("#dlg-confirm-title").textContent = title;
  $("#dlg-confirm-body").textContent = body;
  $("#dlg-confirm-ok").textContent = okLabel;
  const dlg = $("#dlg-confirm-action");
  dlg.showModal();
  return new Promise((resolve) => {
    dlg.addEventListener(
      "close",
      () => resolve(dlg.returnValue === "ok"),
      { once: true }
    );
  });
}

async function onArchivePh() {
  if (!currentPhId) return;
  const ok = await confirmAction(
    "Archivar propiedad",
    "Esta propiedad dejará de estar disponible para operación normal. El historial será conservado.",
    "Archivar"
  );
  if (!ok) return;
  await api(`/api/ph/${currentPhId}/deactivate`, { method: "POST", body: {} });
  AppFeedback.success("La propiedad quedó archivada. El historial se conserva.", { title: "Propiedad archivada" });
  if (!$("#view-detail").hidden) await openPh(currentPhId);
  else await loadList();
}

async function onReactivatePh() {
  if (!currentPhId) return;
  await api(`/api/ph/${currentPhId}/reactivate`, { method: "POST" });
  AppFeedback.success("La propiedad volvió a estar activa.", { title: "PH reactivado" });
  if (!$("#view-detail").hidden) await openPh(currentPhId);
}

async function onDeletePh() {
  if (!currentPhId) return;
  if (!canAdministerCurrentPh()) {
    AppFeedback.error("Se requiere Administrador PH.", { title: "Sin permiso" });
    return;
  }
  let evaluation;
  try {
    evaluation = await api(`/api/ph/${currentPhId}/delete-evaluation`);
  } catch (err) {
    const msg = err?.message || String(err);
    AppFeedback.fromError(err);
    return;
  }
  if (!evaluation.canHardDelete) {
    const ok = await confirmAction(
      "No se puede eliminar",
      `${(evaluation.blockingReasons || []).join(" ") || evaluation.summary || ""} Usa Archivar para conservar el historial.`,
      "Archivar"
    );
    if (ok) await onArchivePh();
    return;
  }
  const ok = await confirmAction(
    "Eliminar permanentemente",
    evaluation.summary || "Se eliminará este PH de forma permanente. Esta acción no se puede deshacer.",
    "Eliminar permanentemente"
  );
  if (!ok) return;
  try {
    await api(`/api/ph/${currentPhId}`, { method: "DELETE" });
    AppFeedback.success("La propiedad fue eliminada permanentemente.", { title: "PH eliminado" });
    currentPhId = null;
    $("#view-detail").hidden = true;
    $("#view-list").hidden = false;
    mountPhListShell();
    await loadList();
  } catch (err) {
    AppFeedback.fromError(err);
  }
}

async function onSavePh(ev) {
  ev.preventDefault();
  const saveBtn = $("#btn-ph-save");
  try {
    const data = formData(ev.target);
    await runWithButton(saveBtn, "Guardando…", async () => {
      await api(`/api/ph/${currentPhId}`, {
        method: "PUT",
        body: {
          name: data.name,
          legalName: data.legalName || null,
          country: data.country || null,
          stateProvince: data.stateProvince || null,
          city: data.city || null,
          address: data.address || null,
          timeZoneId: data.timeZoneId,
          adminEmail: data.adminEmail || null,
          phone: data.phone || null,
          onboardingStep: 2,
          concurrencyStamp: data.concurrencyStamp || null
        }
      });
      notify.success("Los cambios de la propiedad se guardaron correctamente.", {
        title: "PH actualizada"
      });
      await openPh(currentPhId);
    });
  } catch (err) {
    notify.fromError(err);
  }
}

async function loadUnits({ soft = false } = {}) {
  if (unitsHub) return unitsHub.loadUnits({ soft });
}

async function showUnit(unitId) {
  if (unitsHub) return unitsHub.showUnit(unitId);
  const detail = await api(`/api/ph/${currentPhId}/units/${unitId}/ownerships`);
  const el = $("#unit-detail");
  el.hidden = false;
  const total = Number(detail.activeShareTotalPercent || 0);
  const statusLabel = detail.ownershipComplete
    ? `✓ Titularidad completa (${Math.round(total)}%)`
    : total > 100.0001
      ? `⚠ Titularidad ${Math.round(total)}% — excede 100%`
      : `⚠ Titularidad ${Math.round(total)}% — falta ${Math.round(Number(detail.missingSharePercent || 0))}%`;
  const active = (detail.owners || []).filter((o) => o.isActive);
  const history = (detail.owners || []).filter((o) => !o.isActive);
  el.innerHTML = `
    <h3>Unidad ${escapeHtml(detail.unitCode)}</h3>
    <p class="muted">Torre ${escapeHtml(detail.tower || "—")} · Piso ${detail.floor ?? "—"} · Coeficiente ${Number(detail.coefficientPercent).toLocaleString("en-US", { useGrouping: false, maximumFractionDigits: 4 })}% · ${detail.isActive ? "Activa" : "Inactiva"}</p>
    <p><strong>${statusLabel}</strong></p>
    <h4>Propietarios activos</h4>
    <ul>${active.length
      ? active
          .map(
            (o) => `<li class="unit-owner-row">
              <strong>${escapeHtml(o.ownerDisplayName)}</strong>
              <label class="unit-share-edit">Participación %
                <input type="number" min="1" max="100" step="1" value="${Math.round(Number(o.sharePercent))}" data-share-input="${o.ownershipId}" />
              </label>
              <button type="button" class="btn btn-ghost" data-save-share="${o.ownershipId}">Guardar %</button>
              <span class="muted">${formatDate(o.effectiveFromUtc)} → actual</span>
              <button type="button" class="btn btn-secondary" data-transfer="${o.ownershipId}" data-unit="${detail.unitId}" data-owner-name="${escapeHtml(o.ownerDisplayName)}" data-unit-code="${escapeHtml(detail.unitCode)}">Transferir</button>
              <button type="button" class="btn btn-ghost" data-end-unit-own="${o.ownershipId}">Finalizar</button>
            </li>`
          )
          .join("")
      : "<li class='muted'>Sin titulares activos</li>"}</ul>
    <div class="cta-row">
      <button type="button" class="btn btn-primary" id="btn-add-coowner" data-unit="${detail.unitId}">+ Agregar copropietario</button>
    </div>
    <h4>Historial</h4>
    <ul>${history.length
      ? history
          .map(
            (o) => `<li class="muted">${escapeHtml(o.ownerDisplayName)} · ${Math.round(Number(o.sharePercent))}% · ${formatDate(o.effectiveFromUtc)} → ${formatDate(o.effectiveToUtc)}</li>`
          )
          .join("")
      : "<li class='muted'>Sin cambios previos</li>"}</ul>`;

  el.querySelectorAll("[data-transfer]").forEach((btn) => {
    btn.addEventListener("click", () => openTransferDialog(btn.dataset));
  });
  el.querySelectorAll("[data-save-share]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const ownershipId = btn.dataset.saveShare;
      const input = el.querySelector(`[data-share-input="${ownershipId}"]`);
      const sharePercent = Number(input?.value);
      if (!(sharePercent > 0) || sharePercent > 100) {
        AppFeedback.warning("Indica un % de participación entre 0 y 100.", { title: "Participación inválida" });
        return;
      }
      try {
        await api(`/api/ph/${currentPhId}/ownerships/${ownershipId}/share`, {
          method: "PUT",
          body: { sharePercent }
        });
        AppFeedback.success("Participación actualizada.", { title: "Copropiedad" });
        await showUnit(unitId);
        await loadOwners();
      } catch (err) {
        AppFeedback.fromError(err, err?.message || "No se pudo actualizar la participación.");
      }
    });
  });
  el.querySelectorAll("[data-end-unit-own]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (
        !(await confirmDialog({
          title: "Finalizar titularidad",
          body: "¿Finalizar esta titularidad? El historial de la unidad se conserva.",
          confirmLabel: "Finalizar",
          danger: true
        }))
      )
        return;
      await api(`/api/ph/${currentPhId}/ownerships/${btn.dataset.endUnitOwn}/end`, { method: "POST" });
      AppFeedback.success("La titularidad quedó en histórico.", { title: "Titularidad finalizada" });
      await showUnit(unitId);
      await loadOwners();
    });
  });
  el.querySelector("#btn-add-coowner")?.addEventListener("click", async () => {
    startOwnerCreate();
    const select = $("#owner-unit-select");
    if (select) select.value = unitId;
    switchTab("owners");
    await syncOwnerShareForSelectedUnit();
    notify.info("Indica el % de participación disponible para el copropietario y guarda.", {
      title: "Agregar copropietario"
    });
  });
}

function formatDate(iso) {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("es-PA", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(iso));
  } catch {
    return String(iso).slice(0, 10);
  }
}

async function openTransferDialog(dataset) {
  const owners = await api(`/api/ph/${currentPhId}/owners?status=Active`).catch(() => api(`/api/ph/${currentPhId}/owners`));
  const list = Array.isArray(owners) ? owners : owners?.items || [];
  const select = $("#transfer-owner-select");
  select.innerHTML = list
    .map((o) => `<option value="${o.id}">${escapeHtml(o.displayName || o.email)}</option>`)
    .join("");
  const form = $("#form-transfer");
  form.fromOwnershipId.value = dataset.transfer;
  form.unitId.value = dataset.unit;
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  form.effectiveFrom.value = tomorrow.toISOString().slice(0, 10);
  $("#transfer-summary").textContent = `Unidad ${dataset.unitCode || ""} · Actual: ${dataset.ownerName || ""}`;
  const dlg = $("#transfer-dialog");
  dlg.hidden = false;
  dlg.style.display = "grid";
}

async function onTransferOwnership(ev) {
  ev.preventDefault();
  const data = formData(ev.target);
  const effective = data.effectiveFrom
    ? new Date(`${data.effectiveFrom}T12:00:00`).toISOString()
    : null;
  const result = await api(`/api/ph/${currentPhId}/ownerships/transfer`, {
    method: "POST",
    body: {
      fromOwnershipId: data.fromOwnershipId,
      toOwnerId: data.toOwnerId,
      effectiveFromUtc: effective,
      reason: data.reason || null
    }
  });
  const dlg = $("#transfer-dialog");
  dlg.hidden = true;
  dlg.style.display = "none";
  AppFeedback.success(`Unidad ${result.unitCode}: ${result.fromOwnerName} → ${result.toOwnerName}.`, {
    title: "Transferencia completada"
  });
  await showUnit(result.unitId);
  await loadOwners();
}

async function onCreateUnit(ev) {
  ev.preventDefault();
  const data = formData(ev.target);
  const btn = ev.submitter || ev.target.querySelector('button[type="submit"]');
  try {
    await runWithButton(btn, "Creando…", async () => {
      await api(`/api/ph/${currentPhId}/units`, {
        method: "POST",
        body: {
          code: data.code,
          tower: data.tower || null,
          floor: data.floor === "" ? null : Number(data.floor),
          unitType: data.unitType || null,
          coefficientPercent: Number(data.coefficientPercent),
          isActive: true
        }
      });
      ev.target.reset();
      $("#unit-form-wrap").hidden = true;
      await loadUnits();
      await loadCoefficients();
      notify.success("La unidad ya aparece en el listado.", { title: "Unidad creada" });
    });
  } catch (err) {
    notify.fromError(err, "No se pudo crear la unidad");
  }
}

async function runBulk(previewOnly) {
  const data = formData($("#form-bulk"));
  const body = {
    tower: data.tower || null,
    floorFrom: Number(data.floorFrom),
    floorTo: Number(data.floorTo),
    unitFrom: Number(data.unitFrom),
    unitTo: Number(data.unitTo),
    unitNumberPad: Number(data.unitNumberPad || 2),
    prefix: data.prefix || null,
    unitType: null,
    defaultCoefficientPercent: Number(data.defaultCoefficientPercent || 0),
    previewOnly
  };
  const result = await api(`/api/ph/${currentPhId}/units/bulk-generate`, { method: "POST", body });
  const pre = $("#bulk-preview");
  pre.hidden = false;
  pre.textContent = `Crearía: ${result.wouldCreate} · Omitidas: ${result.skippedExisting}\n` +
    (result.previewCodes || []).slice(0, 40).join("\n") +
    ((result.previewCodes?.length || 0) > 40 ? "\n…" : "");
  if (!previewOnly) {
    AppFeedback.success(`${result.created?.length || 0} unidades agregadas al PH.`, { title: "Unidades creadas" });
    await loadUnits();
  }
}

async function loadOwners({ soft = false } = {}) {
  if (!currentPhId) return;
  const params = new URLSearchParams();
  const search = $("#owner-search")?.value.trim();
  if (search) params.set("search", search);
  const tower = $("#filter-tower")?.value;
  if (tower) params.set("tower", tower);
  const status = $("#filter-status")?.value;
  if (status) params.set("status", status);
  const hasEmail = $("#filter-email")?.value;
  if (hasEmail) params.set("hasEmail", hasEmail);
  const accessStatus = $("#filter-access")?.value;
  if (accessStatus) params.set("accessStatus", accessStatus);
  const invited = $("#filter-invited")?.value;
  if (invited) params.set("invited", invited);
  const q = params.toString() ? `?${params}` : "";
  const hasFilters = !!(search || tower || status || hasEmail || accessStatus || invited);
  if (soft && !hasFilters && isPhTabFresh("owners")) return;
  const owners = await api(`/api/ph/${currentPhId}/owners${q}`, {
    dedupeKey: `ph-owners:${currentPhId}`
  });
  if (!hasFilters) markPhTabFresh("owners");
  const empty = $("#owners-empty");
  const tableWrap = $("#owners-table-wrap") || $("#owners-table")?.closest(".table-wrap");
  if (!owners.length && !hasFilters) {
    empty.hidden = false;
    if (tableWrap) tableWrap.hidden = true;
  } else {
    empty.hidden = true;
    if (tableWrap) tableWrap.hidden = false;
  }
  const tbody = $("#owners-table tbody");
  if (!owners.length && hasFilters) {
    tbody.innerHTML =
      '<tr><td colspan="6" class="muted" style="text-align:center;padding:1.5rem">Ningún propietario coincide con los filtros aplicados.</td></tr>';
  } else {
  tbody.innerHTML = owners
    .map((o) => {
      const access = o.platformAccessStatus || "NotInvited";
      const action = inviteActionForAccess(access);
      const inactive = o.status === "Inactive";
      const email = maskEmail(o.email || "");
      const codes = Array.isArray(o.unitCodes) ? o.unitCodes.filter(Boolean) : [];
      const shown = codes.slice(0, 2);
      const extra = codes.length - shown.length;
      const chips = shown.length
        ? shown
            .map((c) => `<span class="assoc-chip" title="${escapeHtml(c)}">${escapeHtml(c)}</span>`)
            .join("") +
          (extra > 0
            ? `<button type="button" class="assoc-chip assoc-chip--more" data-owner-units="${o.id}" aria-label="${extra} unidades más">+${extra} más</button>`
            : "")
        : `<span class="muted">Sin unidad</span>`;
      const sendAction = action
        ? `<button type="button" class="btn btn-secondary btn-sm" data-invite="${o.id}">${escapeHtml(action)}</button>`
        : access === "Active"
          ? `<button type="button" class="btn btn-secondary btn-sm" data-reset-password="${o.id}">Enviar restablecimiento</button>`
          : "";
      const statusAction = inactive
        ? `<button type="button" class="btn btn-secondary btn-sm" data-reactivate-owner-row="${o.id}">Reactivar</button>`
        : `<button type="button" class="btn btn-secondary btn-sm" data-deactivate-owner-row="${o.id}">Desactivar</button>`;
      return `<tr class="${inactive ? "is-inactive-row" : ""}">
      <td><input type="checkbox" value="${o.id}" aria-label="Seleccionar ${escapeHtml(o.displayName)}" /></td>
      <td>
        <strong>${escapeHtml(o.displayName)}</strong>
        <div class="muted" style="font-size:0.85rem">${escapeHtml(email || "sin correo")}</div>
        <div class="muted" style="font-size:0.8rem;margin-top:0.15rem">${codes.length} unidad${codes.length === 1 ? "" : "es"} asociada${codes.length === 1 ? "" : "s"}</div>
      </td>
      <td><div class="assoc-chip-row">${chips}</div></td>
      <td>${Number(o.coefficientPercent).toLocaleString("en-US", { useGrouping: false, maximumFractionDigits: 4 })}%</td>
      <td><span class="badge badge-access">${escapeHtml(platformAccessLabel(access))}</span></td>
      <td class="owners-actions">
        <div class="owner-action-bar">
          <button type="button" class="btn btn-secondary btn-sm" data-owner="${o.id}">Ver</button>
          <button type="button" class="btn btn-secondary btn-sm" data-edit-owner="${o.id}">Editar</button>
          <div class="ux-menu">
            <button type="button" class="btn btn-secondary btn-sm" data-more-owner="${o.id}" aria-haspopup="true" aria-label="Más acciones de ${escapeHtml(o.displayName)}">Más</button>
            <div class="ux-menu__panel" id="owner-more-${o.id}" hidden>
              <button type="button" data-owner-units="${o.id}">Administrar unidades</button>
              ${sendAction}
              ${statusAction}
              <button type="button" data-delete-owner-row="${o.id}">Eliminar…</button>
            </div>
          </div>
        </div>
      </td>
    </tr>`;
    })
    .join("");
  }
  syncAccessFilterUi();
  renderOwnerFilterChips();
  // rebind row actions — continue existing handlers below
  tbody.querySelectorAll("[data-owner]").forEach((btn) =>
    btn.addEventListener("click", () => showOwner(btn.dataset.owner))
  );
  tbody.querySelectorAll("[data-owner-units]").forEach((btn) =>
    btn.addEventListener("click", () => manageOwnerUnits(btn.dataset.ownerUnits))
  );
  tbody.querySelectorAll("[data-edit-owner]").forEach((btn) =>
    btn.addEventListener("click", () => startOwnerEdit(btn.dataset.editOwner))
  );
  tbody.querySelectorAll("[data-more-owner]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const panel = $(`#owner-more-${btn.dataset.moreOwner}`);
      document.querySelectorAll(".ux-menu__panel").forEach((p) => {
        if (p !== panel) p.hidden = true;
      });
      if (panel) panel.hidden = !panel.hidden;
    });
  });
  tbody.querySelectorAll("[data-invite]").forEach((btn) =>
    btn.addEventListener("click", () => inviteOwner(btn.dataset.invite, btn))
  );
  tbody.querySelectorAll("[data-reset-password]").forEach((btn) =>
    btn.addEventListener("click", () => requestPasswordReset(btn.dataset.resetPassword, btn))
  );
  tbody.querySelectorAll("[data-deactivate-owner-row]").forEach((btn) =>
    btn.addEventListener("click", () => deactivateOwner(btn.dataset.deactivateOwnerRow))
  );
  tbody.querySelectorAll("[data-reactivate-owner-row]").forEach((btn) =>
    btn.addEventListener("click", () => reactivateOwner(btn.dataset.reactivateOwnerRow))
  );
  tbody.querySelectorAll("[data-delete-owner-row]").forEach((btn) =>
    btn.addEventListener("click", () => deleteOwner(btn.dataset.deleteOwnerRow))
  );
}

function ownerQueryString() {
  const params = new URLSearchParams();
  const search = $("#owner-search")?.value.trim();
  if (search) params.set("search", search);
  const tower = $("#filter-tower")?.value;
  if (tower) params.set("tower", tower);
  const status = $("#filter-status")?.value;
  if (status) params.set("status", status);
  const hasEmail = $("#filter-email")?.value;
  if (hasEmail) params.set("hasEmail", hasEmail);
  const accessStatus = $("#filter-access")?.value;
  if (accessStatus) params.set("accessStatus", accessStatus);
  const invited = $("#filter-invited")?.value;
  if (invited) params.set("invited", invited);
  const q = params.toString();
  return q ? `?${q}` : "";
}

async function exportOwners() {
  window.location.href = `/api/ph/${currentPhId}/owners/export${ownerQueryString()}`;
}

async function validateOwnersBulk() {
  const result = await api(`/api/ph/${currentPhId}/owners/validate-bulk`, { method: "POST" });
  if (result.issues?.length) {
    AppFeedback.warning(
      `${result.ownerCount} propietarios revisados. Sin email: ${result.withoutEmail}. Sin unidad: ${result.withoutUnit}.`,
      { title: "Validación con observaciones" }
    );
  } else {
    AppFeedback.success(`${result.ownerCount} propietarios cumplen los requisitos.`, { title: "Validación correcta" });
  }
}

async function bulkInvite() {
  const ids = [...document.querySelectorAll("#owners-table tbody input[type=checkbox]:checked")].map((cb) => cb.value);
  if (!ids.length) {
    AppFeedback.warning("Selecciona al menos un propietario.", { title: "Selección requerida" });
    return;
  }
  if (
    !(await confirmDialog({
      title: "Enviar invitaciones",
      body: `¿Enviar invitaciones a ${ids.length} propietario(s)?`,
      confirmLabel: "Enviar invitaciones"
    }))
  ) {
    return;
  }
  const btn = $("#btn-bulk-invite");
  const prev = btn?.textContent;
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Enviando invitaciones…";
  }
  try {
    const result = await api(`/api/ph/${currentPhId}/owners/invite-bulk`, {
      method: "POST",
      body: { ownerIds: ids }
    });
    const ok = !result.failed;
    const status = $("#owner-action-status");
    if (status) {
      status.hidden = false;
      status.textContent = ok
        ? `Invitaciones enviadas: ${result.sent}.`
        : `Enviadas: ${result.sent}. Fallidas: ${result.failed}. Sin email: ${result.withoutEmail}.`;
    }
    if (ok) {
    AppFeedback.success(
        `Enviadas: ${result.sent}. Ya activas: ${result.alreadyActive}. Procesadas: ${result.processed}.`,
        { title: "Invitaciones enviadas" }
      );
    } else {
      AppFeedback.warning(
        `Enviadas: ${result.sent}. Fallidas: ${result.failed}. Sin email: ${result.withoutEmail}.`,
        { title: "Invitaciones parciales" }
      );
    }
    await loadOwners();
  } catch (err) {
    const status = $("#owner-action-status");
    if (status) {
      status.hidden = false;
      status.textContent = err.message || "No pudimos enviar las invitaciones.";
    }
    AppFeedback.fromError(err, "No pudimos enviar las invitaciones.");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = prev || "Enviar invitaciones";
    }
  }
}

function renderOwnerLinkedUnitsSummary(activeLinks) {
  const summary = $("#owner-linked-units-summary");
  const labelEl = $("#owner-unit-select-label");
  if (!summary) return;
  const links = (activeLinks || []).filter((u) => u && u.isActive !== false);
  if (!links.length) {
    summary.hidden = true;
    summary.innerHTML = "";
    if (labelEl) labelEl.textContent = "Unidad";
    return;
  }
  summary.hidden = false;
  summary.innerHTML = `
    <p style="margin:0 0 0.35rem"><strong>Unidades ya vinculadas</strong></p>
    <div class="assoc-chip-row">${links
      .map(
        (u) =>
          `<span class="assoc-chip" title="${escapeHtml(u.unitCode || "")}">${escapeHtml(u.unitCode || "—")} · ${Math.round(Number(u.sharePercent || 0))}%</span>`
      )
      .join("")}</div>
    <p class="muted" style="margin:0.4rem 0 0;font-size:0.85rem">La selección previa se mantiene. Solo elige abajo si quieres vincular <em>otra</em> unidad.</p>`;
  if (labelEl) labelEl.textContent = "Vincular otra unidad (opcional)";
}

function rememberOwnerListPosition() {
  ownerSheet.listY = window.scrollY || 0;
  const wrap = $("#owners-table-wrap");
  ownerSheet.tableY = wrap?.scrollTop || 0;
}

function restoreOwnerListPosition() {
  const wrap = $("#owners-table-wrap");
  if (wrap) wrap.scrollTop = ownerSheet.tableY || 0;
  window.scrollTo(0, ownerSheet.listY || 0);
}

function ownerSheetEls() {
  return {
    dlg: $("#dlg-owner"),
    view: $("#owner-sheet-view"),
    form: $("#form-owner"),
    foot: $("#owner-sheet-foot"),
    title: $("#owner-sheet-title"),
    status: $("#owner-sheet-status")
  };
}

function setOwnerSheetMode(mode) {
  ownerSheet.mode = mode;
  const { view, form } = ownerSheetEls();
  if (view) view.hidden = mode !== "view";
  if (form) form.hidden = mode === "view";
}

function openOwnerSheetShell({ title, status, opener }) {
  const { dlg } = ownerSheetEls();
  if (!dlg) return;
  if (dlg.parentElement !== document.body) document.body.appendChild(dlg);
  if (opener !== false) ownerSheet.opener = rememberOpener();
  rememberOwnerListPosition();
  const titleEl = $("#owner-sheet-title");
  const statusEl = $("#owner-sheet-status");
  if (titleEl) titleEl.textContent = title || "Propietario";
  if (statusEl) statusEl.textContent = status || "Propietario";
  lockPageScroll(true);
  if (!dlg.open) {
    try {
      dlg.showModal();
    } catch {
      dlg.setAttribute("open", "");
    }
  }
  bindSheetViewport(dlg);
  ownerSheet.untrap?.();
  ownerSheet.unbind?.();
  ownerSheet.untrap = trapFocus(dlg);
  ownerSheet.unbind = wireSheetKeyboard(dlg);
  requestAnimationFrame(() => titleEl?.focus?.({ preventScroll: true }));
}

function closeOwnerSheet({ restore = true } = {}) {
  const { dlg, form } = ownerSheetEls();
  editingOwnerId = null;
  ownerSheet.mode = "view";
  ownerSheet.returnTo = "list";
  ownerSheet.ownerId = null;
  form?.reset();
  if (dlg?.open) dlg.close();
  else {
    lockPageScroll(false);
    if (restore) restoreOpener(ownerSheet.opener);
    ownerSheet.opener = null;
  }
  restoreOwnerListPosition();
  // Focus restore / layout can nudge scroll on narrow viewports — re-apply after paint.
  requestAnimationFrame(() => restoreOwnerListPosition());
}

function cancelOwnerSheet() {
  if (ownerSheet.mode !== "view" && ownerSheet.returnTo === "view" && ownerSheet.ownerId) {
    void showOwner(ownerSheet.ownerId, { keepOpen: true });
    return;
  }
  closeOwnerSheet({ restore: true });
}

function setOwnerSheetLoading(message) {
  setOwnerSheetMode("view");
  const { view, foot, title, status } = ownerSheetEls();
  if (status) status.textContent = "Cargando";
  if (title) title.textContent = message || "Cargando…";
  if (view) view.innerHTML = `<p class="muted" style="margin:0">${escapeHtml(message || "Cargando ficha…")}</p>`;
  if (foot) {
    foot.innerHTML = `<button type="button" class="btn btn-secondary" data-owner-sheet-close>Cerrar</button>`;
    foot.querySelector("[data-owner-sheet-close]")?.addEventListener("click", () => closeOwnerSheet({ restore: true }));
  }
}

function setOwnerSheetMissing() {
  setOwnerSheetMode("view");
  const { view, foot, title, status } = ownerSheetEls();
  if (status) status.textContent = "No disponible";
  if (title) title.textContent = "Propietario no encontrado";
  if (view) {
    view.innerHTML = `<p style="margin:0">Este propietario ya no está en el PH o no se pudo cargar. Cierra la ficha para volver a la lista.</p>`;
  }
  if (foot) {
    foot.innerHTML = `<button type="button" class="btn btn-primary" data-owner-sheet-close>Volver a la lista</button>`;
    foot.querySelector("[data-owner-sheet-close]")?.addEventListener("click", () => closeOwnerSheet({ restore: true }));
  }
}

async function startOwnerCreate() {
  const token = ownerSheetGuard.next();
  ownerSheet.returnTo = "list";
  ownerSheet.ownerId = null;
  editingOwnerId = null;
  openOwnerSheetShell({ title: "Nuevo propietario", status: "Crear" });
  setOwnerSheetMode("edit");
  const form = $("#form-owner");
  form.reset();
  form.ownerId.value = "";
  form.concurrencyStamp.value = "";
  form.identificationType.value = "Cédula";
  form.sharePercent.value = "100";
  const hint = $("#owner-share-hint");
  if (hint) {
    hint.hidden = true;
    hint.textContent = "";
  }
  const formErr = $("#owner-form-error");
  if (formErr) {
    formErr.hidden = true;
    formErr.textContent = "";
  }
  renderOwnerLinkedUnitsSummary([]);
  await ensureOwnerUnitSelectOptions({ emptyLabel: "— asociar después —" });
  if (!ownerSheetGuard.isCurrent(token)) return;
  const title = $("#owner-form-title");
  if (title) title.textContent = "Nuevo propietario";
  $("#owner-sheet-foot").innerHTML = `
    <button type="button" class="btn btn-secondary" id="btn-cancel-owner">Cancelar</button>
    <button type="submit" form="form-owner" class="btn btn-primary" id="btn-save-owner">Guardar propietario</button>`;
  $("#btn-cancel-owner")?.addEventListener("click", () => cancelOwnerSheet());
  form.firstName?.focus();
}

async function syncOwnerShareForSelectedUnit() {
  const select = $("#owner-unit-select");
  const shareInput = $("#owner-share-percent") || $("#form-owner")?.sharePercent;
  const hint = $("#owner-share-hint");
  if (!select || !shareInput) return;

  const unitId = select.value;
  if (!unitId) {
    shareInput.value = "100";
    shareInput.max = "100";
    if (hint) {
      hint.hidden = true;
      hint.textContent = "";
    }
    return;
  }

  try {
    const detail = await api(`/api/ph/${currentPhId}/units/${unitId}/ownerships`);
    const used = Number(detail.activeShareTotalPercent || 0);
    const remaining = Math.max(0, Math.round(100 - used));
    const activeCount = (detail.owners || []).filter((o) => o.isActive).length;

    if (remaining <= 0) {
      const equal = Math.round(100 / (activeCount + 1));
      shareInput.max = "100";
      shareInput.value = String(equal);
      if (hint) {
        hint.hidden = false;
        hint.textContent =
          `La unidad ya tiene ${activeCount} titular(es) al 100%. Al guardar se redistribuirá en partes iguales (~${equal}% cada uno).`;
      }
      return;
    }

    shareInput.max = String(remaining);
    shareInput.value = String(remaining);
    if (hint) {
      hint.hidden = false;
      hint.textContent =
        used > 0
          ? `Copropiedad: ya hay ${Math.round(used)}% asignado. Quedan ${remaining}% para este propietario.`
          : "Primer titular: se sugiere 100%. Si habrá copropietarios, deja espacio (ej. 50%) o agrégalos después (se redistribuye solo).";
    }
  } catch (err) {
    if (hint) {
      hint.hidden = false;
      hint.textContent = "No se pudo consultar la titularidad de la unidad. Revisa el % manualmente (máx. 100% en total).";
    }
  }
}

function ensureIdentificationTypeOption(value) {
  const select = $("#owner-id-type") || $("#form-owner")?.identificationType;
  if (!select || !value) return;
  const normalized = String(value).trim();
  if (!normalized) return;
  const exists = Array.from(select.options).some((opt) => opt.value === normalized);
  if (!exists) {
    const opt = document.createElement("option");
    opt.value = normalized;
    opt.textContent = normalized;
    select.appendChild(opt);
  }
}

async function startOwnerEdit(ownerId, { fromView = false } = {}) {
  const token = ownerSheetGuard.next();
  ownerSheet.returnTo = fromView ? "view" : "list";
  ownerSheet.ownerId = ownerId;
  editingOwnerId = ownerId;
  const keepOpen = fromView && $("#dlg-owner")?.open;
  if (!keepOpen) {
    openOwnerSheetShell({ title: "Editar propietario", status: "Editar" });
  } else {
    $("#owner-sheet-status").textContent = "Editar";
    $("#owner-sheet-title").textContent = "Editar propietario";
  }
  setOwnerSheetLoading("Cargando formulario…");
  let o;
  try {
    await applyTestHooks();
    o = await api(`/api/ph/${currentPhId}/owners/${ownerId}`);
  } catch (err) {
    if (!ownerSheetGuard.isCurrent(token)) return;
    setOwnerSheetMissing();
    AppFeedback.fromError(err, "No pudimos abrir el formulario de este propietario.");
    return;
  }
  if (!ownerSheetGuard.isCurrent(token) || String(currentPhId) !== String(o.propertyHorizontalId || currentPhId)) return;
  setOwnerSheetMode("edit");
  const form = $("#form-owner");
  form.ownerId.value = o.id;
  form.concurrencyStamp.value = o.concurrencyStamp || "";
  form.firstName.value = o.firstName || "";
  form.lastName.value = o.lastName || "";
  ensureIdentificationTypeOption(o.identificationType);
  form.identificationType.value = o.identificationType || "";
  form.identification.value = o.identification || "";
  form.email.value = o.email || "";
  form.phone.value = o.phone || "";
  const formErr = $("#owner-form-error");
  if (formErr) {
    formErr.hidden = true;
    formErr.textContent = "";
  }
  const activeLinks = (o.units || []).filter((u) => u.isActive);
  const linkedIds = activeLinks.map((u) => u.unitId);
  renderOwnerLinkedUnitsSummary(activeLinks);
  await ensureOwnerUnitSelectOptions({
    excludeUnitIds: linkedIds,
    emptyLabel: activeLinks.length ? "— no vincular otra —" : "— asociar después —"
  });
  if (!ownerSheetGuard.isCurrent(token)) return;
  form.unitId.value = "";
  const title = $("#owner-form-title");
  if (title) title.textContent = "Editar propietario";
  $("#owner-sheet-status").textContent = "Editar";
  $("#owner-sheet-title").textContent = o.displayName || "Editar propietario";
  $("#owner-sheet-foot").innerHTML = `
    <button type="button" class="btn btn-secondary" id="btn-cancel-owner">Cancelar</button>
    <button type="submit" form="form-owner" class="btn btn-primary" id="btn-save-owner">Guardar cambios</button>`;
  $("#btn-cancel-owner")?.addEventListener("click", () => cancelOwnerSheet());
  form.firstName?.focus();
}

/** Load PH units into #owner-unit-select (owner create/edit / drawer link). */
async function ensureOwnerUnitSelectOptions({
  excludeUnitIds = [],
  selectEl = null,
  emptyLabel = "— asociar después —"
} = {}) {
  const select = selectEl || $("#owner-unit-select");
  if (!select || !currentPhId) return [];
  try {
    const units = await api(`/api/ph/${currentPhId}/units`, {
      dedupeKey: `ph-units:${currentPhId}:`
    });
    const excluded = new Set((excludeUnitIds || []).map(String));
    const current = select.value;
    const options = (units || []).filter((u) => !excluded.has(String(u.id)));
    select.innerHTML =
      `<option value="">${escapeHtml(emptyLabel)}</option>` +
      options.map((u) => `<option value="${u.id}">${escapeHtml(u.code)}</option>`).join("");
    if (current && !excluded.has(String(current))) {
      select.value = current;
    }
    return units || [];
  } catch {
    return [];
  }
}

async function onSaveOwner(ev) {
  ev.preventDefault();
  if (!canAdministerCurrentPh()) {
    AppFeedback.error("No tienes permiso para editar propietarios en esta PH. Se requiere Administrador PH.", {
      title: "Sin permiso"
    });
    return;
  }
  const btn = $("#btn-save-owner");
  const data = formData(ev.target);
  const emailInput = ev.target.email;
  AppFeedback.field.clearForm(ev.target);
  if (!data.email?.trim()) {
    AppFeedback.field.error(emailInput, "El correo electrónico es obligatorio.");
    emailInput?.focus?.({ preventScroll: true });
    if (emailInput) scrollFieldIntoSheet(emailInput);
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(data.email).trim())) {
    AppFeedback.field.error(emailInput, "Ingresa un correo electrónico válido.");
    emailInput?.focus?.({ preventScroll: true });
    if (emailInput) scrollFieldIntoSheet(emailInput);
    return;
  }
  try {
    await runWithButton(btn, editingOwnerId ? "Guardando…" : "Creando…", async () => {
      await applyTestHooks();
      if (editingOwnerId) {
        await api(`/api/ph/${currentPhId}/owners/${editingOwnerId}`, {
          method: "PUT",
          body: {
            firstName: data.firstName || null,
            lastName: data.lastName || null,
            identificationType: data.identificationType || null,
            identification: data.identification || null,
            email: data.email,
            phone: data.phone || null,
            concurrencyStamp: data.concurrencyStamp || null
          }
        });
        if (data.unitId) {
          await api(`/api/ph/${currentPhId}/ownerships`, {
            method: "POST",
            body: {
              ownerId: editingOwnerId,
              unitId: data.unitId,
              sharePercent: Number(data.sharePercent || 100)
            }
          });
        }
        AppFeedback.success("Los cambios se guardaron correctamente.", {
          title: "Propietario guardado"
        });
      } else {
        await api(`/api/ph/${currentPhId}/owners`, {
          method: "POST",
          body: {
            firstName: data.firstName || null,
            lastName: data.lastName || null,
            identificationType: data.identificationType || null,
            identification: data.identification || null,
            email: data.email,
            phone: data.phone || null,
            unitId: data.unitId || null,
            sharePercent: data.unitId ? Number(data.sharePercent || 100) : null
          }
        });
        AppFeedback.success("El propietario ya aparece en el listado.", {
          title: "Propietario creado"
        });
      }
      const savedId = editingOwnerId;
      ev.target.reset();
      await loadOwners();
      restoreOwnerListPosition();
      if (savedId) {
        // Keep the same dialog open on the updated ficha (row also refreshed).
        ownerSheet.returnTo = "list";
        await showOwner(savedId, { keepOpen: true });
      } else {
        closeOwnerSheet({ restore: true });
      }
    });
  } catch (err) {
    const msg = err?.message || String(err);
    if (/already linked|OWNERSHIP_DUPLICATE|ya (está|esta) vinculad/i.test(msg)) {
      AppFeedback.warning("Este propietario ya está vinculado a esa unidad. Elige otra unidad o deja el campo vacío.", {
        title: "Unidad duplicada"
      });
      return;
    }
    if (/OWNERSHIP_SHARE_OVERFLOW|sumaría|máximo 100|copropiedad/i.test(msg) || err?.code === "OWNERSHIP_SHARE_OVERFLOW") {
      AppFeedback.warning(
        msg + " Puedes editar el % de cada titular en la ficha de la unidad, o agregar el copropietario y el sistema redistribuirá en partes iguales.",
        { title: "Participación excede 100%" }
      );
      await syncOwnerShareForSelectedUnit();
      return;
    }
    const formErr = $("#owner-form-error");
    if (formErr) {
      formErr.hidden = false;
      formErr.textContent = msg;
    }
    AppFeedback.fromError(err, msg);
    const firstInvalid = ev.target.querySelector("[aria-invalid='true'], .is-invalid, input:invalid");
    firstInvalid?.focus?.({ preventScroll: true });
    if (firstInvalid) scrollFieldIntoSheet(firstInvalid);
  }
}

function syncAccessFilterUi() {
  const current = $("#filter-access")?.value || "";
  document.querySelectorAll("[data-access-filter]").forEach((btn) => {
    const value = btn.dataset.accessFilter || "";
    const active = value === current;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-pressed", String(active));
  });
}

function renderOwnerFilterChips() {
  const host = $("#owner-filter-chips");
  if (!host) return;
  const chips = [];
  const add = (label, id) => {
    const el = $(`#${id}`);
    if (!el?.value) return;
    const text = el.options?.[el.selectedIndex]?.text || el.value;
    chips.push(`<span class="filter-chip">${escapeHtml(label)}: ${escapeHtml(text)} <button type="button" data-clear-filter="${id}" aria-label="Quitar filtro">×</button></span>`);
  };
  const search = $("#owner-search")?.value.trim();
  if (search) {
    chips.push(`<span class="filter-chip">Búsqueda: ${escapeHtml(search)} <button type="button" data-clear-search aria-label="Quitar búsqueda">×</button></span>`);
  }
  add("Torre", "filter-tower");
  add("Estado", "filter-status");
  add("Correo", "filter-email");
  add("Acceso", "filter-access");
  add("Invitación", "filter-invited");
  host.hidden = chips.length === 0;
  host.innerHTML = chips.join("");
  host.querySelector("[data-clear-search]")?.addEventListener("click", () => {
    const el = $("#owner-search");
    if (el) el.value = "";
    renderOwnerFilterChips();
    loadOwners();
  });
  host.querySelectorAll("[data-clear-filter]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const el = $(`#${btn.dataset.clearFilter}`);
      if (el) el.value = "";
      syncAccessFilterUi();
      renderOwnerFilterChips();
      loadOwners();
    });
  });
}

function closeOwnerDrawer() {
  closeOwnerSheet({ restore: true });
}

async function manageOwnerUnits(ownerId) {
  await showOwner(ownerId, { manageUnits: true });
}

async function showOwner(ownerId, opts = {}) {
  const manageUnits = opts.manageUnits === true;
  const token = ownerSheetGuard.next();
  ownerSheet.returnTo = "list";
  ownerSheet.ownerId = ownerId;
  editingOwnerId = null;
  if (!opts.keepOpen) {
    openOwnerSheetShell({ title: "Propietario", status: "Cargando" });
  }
  setOwnerSheetLoading("Cargando ficha…");
  let o;
  try {
    await applyTestHooks();
    o = await api(`/api/ph/${currentPhId}/owners/${ownerId}`);
  } catch (err) {
    if (!ownerSheetGuard.isCurrent(token)) return;
    setOwnerSheetMissing();
    AppFeedback.fromError(err, "No pudimos abrir este propietario.");
    return;
  }
  if (!ownerSheetGuard.isCurrent(token)) return;
  const inactive = o.status === "Inactive";
  const access = o.platformAccessStatus || "NotInvited";
  const canInvite = access !== "Active";
  const inviteLabel = inviteActionForAccess(access) || "Enviar invitación";
  const expires = o.invitationExpiresAtUtc
    ? new Date(o.invitationExpiresAtUtc).toLocaleString("es-PA", { dateStyle: "medium", timeStyle: "short" })
    : "—";
  const activeLinks = (o.units || []).filter((u) => u.isActive);
  const linkedIds = activeLinks.map((u) => u.unitId);
  const allUnits = manageUnits || canAdministerCurrentPh()
    ? await ensureOwnerUnitSelectOptions({ excludeUnitIds: linkedIds })
    : [];
  const linkableUnits = (allUnits || []).filter((u) => !linkedIds.map(String).includes(String(u.id)));

  $("#owner-sheet-title").textContent = o.displayName || "Propietario";
  $("#owner-sheet-status").textContent = manageUnits
    ? "Unidades"
    : ownerLifecycleLabel(o.status);
  const linkHeading = activeLinks.length ? "Vincular otra unidad" : "Vincular unidad";
  const linkBtnLabel = activeLinks.length ? "Vincular otra" : "Vincular unidad";
  const linkFormHtml = !canAdministerCurrentPh()
    ? ""
    : linkableUnits.length
      ? `<form id="form-link-owner-unit" class="owner-form-sections" style="margin-top:0.75rem">
      <fieldset class="form-grid">
        <legend id="owner-link-section">${escapeHtml(linkHeading)}</legend>
        <label>Unidad
          <select name="unitId" id="drawer-link-unit-select" required>
            <option value="">— seleccionar —</option>
            ${linkableUnits.map((u) => `<option value="${u.id}">${escapeHtml(u.code)} · coeficiente ${Number(u.coefficientPercent || u.coefficient || 0).toLocaleString("en-US", { useGrouping: false, maximumFractionDigits: 4 })}%</option>`).join("")}
          </select>
        </label>
        <label>Participación de titularidad %
          <input name="sharePercent" id="drawer-link-share" type="number" step="1" min="1" max="100" value="100" />
        </label>
        <p class="muted span-2" style="margin:0">La participación es el porcentaje de esta persona sobre la unidad. El coeficiente es el peso de la unidad en el PH y no se cambia aquí.</p>
        <p id="drawer-link-share-hint" class="muted span-2" style="margin:0" hidden></p>
        <label>Fecha efectiva
          <input name="effectiveFrom" type="date" required />
        </label>
      </fieldset>
      <div class="cta-row" style="margin-top:0.75rem">
        <button type="submit" class="btn btn-primary">${escapeHtml(linkBtnLabel)}</button>
      </div>
    </form>`
      : activeLinks.length
        ? `<p id="owner-link-section" class="muted" style="margin:0.75rem 0 0">Todas las unidades del PH ya están vinculadas a este propietario. No hace falta volver a vincular.</p>`
        : `<h3 id="owner-link-section">Vincular unidad</h3>
    <p class="muted" style="margin:0.5rem 0 0">No hay unidades disponibles en este PH para vincular.</p>`;

  setOwnerSheetMode("view");
  $("#owner-sheet-view").innerHTML = `
    <div class="owner-sheet__summary" aria-live="polite">
      <strong>${escapeHtml(o.displayName || "Propietario")}</strong>
      <p class="owner-sheet__summary-meta">
        <span>${escapeHtml(maskEmail(o.email))}</span>
        <span>${escapeHtml(o.phone || "Sin teléfono")}</span>
        <span>${activeLinks.length} unidad${activeLinks.length === 1 ? "" : "es"} vinculada${activeLinks.length === 1 ? "" : "s"}</span>
      </p>
    </div>
    <section class="owner-sheet__section">
      <h3>Información</h3>
      <div class="sheet-kv"><span>Identificación</span><span>${escapeHtml([o.identificationType, o.identification].filter(Boolean).join(" ") || "—")}</span></div>
      <div class="sheet-kv"><span>Email</span><span>${escapeHtml(maskEmail(o.email))}</span></div>
      <div class="sheet-kv"><span>Teléfono</span><span>${escapeHtml(o.phone || "—")}</span></div>
    </section>
    <section class="owner-sheet__section">
      <h3 id="owner-linked-units">Unidades vinculadas${activeLinks.length ? ` (${activeLinks.length})` : ""}</h3>
      <ul class="owner-units-list">${(o.units || [])
        .map(
          (u) =>
            `<li>${escapeHtml(u.unitCode)} · ${Number(u.unitCoefficientPercent).toLocaleString("en-US", { useGrouping: false, maximumFractionDigits: 4 })}% · participación ${Math.round(Number(u.sharePercent))}%
            ${u.isActive && canAdministerCurrentPh() ? `<button type="button" class="btn btn-ghost btn-sm" data-end-own="${u.ownershipId}">Finalizar</button>` : u.isActive ? "" : " · histórico"}</li>`
        )
        .join("") || "<li>Sin unidades</li>"}</ul>
      ${linkFormHtml}
    </section>
    <section class="owner-sheet__section">
      <h3>Acceso</h3>
      <div class="sheet-kv"><span>Estado</span><span class="badge badge-access">${escapeHtml(platformAccessLabel(access))}</span></div>
      <div class="sheet-kv"><span>Invitación expira</span><span>${escapeHtml(expires)}</span></div>
    </section>
  `;
  const canEdit = canAdministerCurrentPh();
  $("#owner-sheet-foot").innerHTML = `
    <div class="owner-sheet__access">
      ${canInvite ? `<button type="button" class="btn btn-secondary" data-invite-detail="${o.id}">${escapeHtml(inviteLabel)}</button>` : ""}
      ${
        access === "Active"
          ? `<button type="button" class="btn btn-secondary" data-reset-password-detail="${o.id}">Enviar restablecimiento</button>`
          : ""
      }
      ${
        inactive
          ? `<button type="button" class="btn btn-secondary" data-reactivate-owner="${o.id}">Reactivar</button>`
          : `<button type="button" class="btn btn-secondary" data-deactivate-owner="${o.id}">Desactivar</button>`
      }
      ${canEdit ? `<button type="button" class="btn btn-ghost owner-action-bar__danger" data-delete-owner="${o.id}">Eliminar…</button>` : ""}
    </div>
    <div class="owner-sheet__primary">
      <button type="button" class="btn btn-secondary" data-owner-sheet-close>Cerrar</button>
      ${canEdit ? `<button type="button" class="btn btn-primary" data-edit-owner="${o.id}">Editar</button>` : ""}
    </div>`;

  const body = $("#owner-sheet-view");
  const footer = $("#owner-sheet-foot");
  footer.querySelector("[data-owner-sheet-close]")?.addEventListener("click", () => closeOwnerSheet({ restore: true }));
  footer.querySelectorAll("[data-edit-owner]").forEach((btn) =>
    btn.addEventListener("click", () => startOwnerEdit(btn.dataset.editOwner, { fromView: true }))
  );
  footer.querySelectorAll("[data-deactivate-owner]").forEach((btn) =>
    btn.addEventListener("click", () => deactivateOwner(btn.dataset.deactivateOwner))
  );
  footer.querySelectorAll("[data-reactivate-owner]").forEach((btn) =>
    btn.addEventListener("click", () => reactivateOwner(btn.dataset.reactivateOwner))
  );
  footer.querySelectorAll("[data-delete-owner]").forEach((btn) =>
    btn.addEventListener("click", () => deleteOwner(btn.dataset.deleteOwner))
  );
  footer.querySelectorAll("[data-invite-detail]").forEach((btn) =>
    btn.addEventListener("click", () => inviteOwner(btn.dataset.inviteDetail, btn))
  );
  footer.querySelectorAll("[data-reset-password-detail]").forEach((btn) =>
    btn.addEventListener("click", () => requestPasswordReset(btn.dataset.resetPasswordDetail, btn))
  );
  body.querySelectorAll("[data-end-own]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      const ok = await confirmDialog({
        title: "Finalizar vínculo",
        body: "La unidad dejará de estar activa para este propietario. El historial se conserva.",
        confirmLabel: "Finalizar",
        danger: true
      });
      if (!ok) return;
      await api(`/api/ph/${currentPhId}/ownerships/${btn.dataset.endOwn}/end`, { method: "POST" });
      AppFeedback.success("La relación quedó en histórico.", { title: "Relación finalizada" });
      await showOwner(ownerId, opts);
      await loadOwners();
    })
  );

  const linkForm = body.querySelector("#form-link-owner-unit");
  if (linkForm) {
    const dateInput = linkForm.querySelector('[name="effectiveFrom"]');
    if (dateInput) dateInput.value = new Date().toISOString().slice(0, 10);
    const unitSelect = linkForm.querySelector("#drawer-link-unit-select");
    const shareInput = linkForm.querySelector("#drawer-link-share");
    const shareHint = linkForm.querySelector("#drawer-link-share-hint");
    const syncDrawerShare = async () => {
      const unitId = unitSelect?.value;
      if (!unitId || !shareInput) return;
      try {
        const detail = await api(`/api/ph/${currentPhId}/units/${unitId}/ownerships`);
        const used = Number(detail.activeShareTotalPercent || 0);
        const remaining = Math.max(0, Math.round(100 - used));
        const activeCount = (detail.owners || []).filter((x) => x.isActive).length;
        if (remaining <= 0) {
          const equal = Math.round(100 / (activeCount + 1));
          shareInput.value = String(equal);
          if (shareHint) {
            shareHint.hidden = false;
            shareHint.textContent = `La unidad ya está al 100%. Al vincular se redistribuirá (~${equal}% cada uno).`;
          }
        } else {
          shareInput.max = String(remaining);
          shareInput.value = String(remaining);
          if (shareHint) {
            shareHint.hidden = false;
            shareHint.textContent =
              used > 0
                ? `Ya hay ${Math.round(used)}% asignado. Quedan ${remaining}% para este propietario.`
                : "Primer titular: se sugiere 100%.";
          }
        }
      } catch {
        if (shareHint) {
          shareHint.hidden = false;
          shareHint.textContent = "No se pudo consultar la titularidad. Revisa el % manualmente.";
        }
      }
    };
    unitSelect?.addEventListener("change", () => void syncDrawerShare());
    linkForm.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const data = formData(linkForm);
      if (!data.unitId) {
        AppFeedback.warning("Selecciona una unidad.", { title: "Unidad requerida" });
        return;
      }
      const unit = linkableUnits.find((u) => String(u.id) === String(data.unitId));
      const ok = await confirmDialog({
        title: "Confirmar vinculación",
        body: `Propietario: ${o.displayName || o.email}\nUnidad: ${unit?.code || data.unitId}\nParticipación: ${data.sharePercent || 100}%\nFecha efectiva: ${data.effectiveFrom}`,
        confirmLabel: "Vincular"
      });
      if (!ok) return;
      try {
        await api(`/api/ph/${currentPhId}/ownerships`, {
          method: "POST",
          body: {
            ownerId,
            unitId: data.unitId,
            sharePercent: Number(data.sharePercent || 100),
            effectiveFromUtc: data.effectiveFrom
              ? new Date(`${data.effectiveFrom}T12:00:00`).toISOString()
              : undefined
          }
        });
        AppFeedback.success("La unidad quedó vinculada al propietario.", { title: "Vinculación" });
        await loadOwners({ soft: false });
        await loadUnits({ soft: false }).catch(() => {});
        await showOwner(ownerId, { manageUnits: true });
      } catch (err) {
        const msg = err?.message || String(err);
        if (/already linked|OWNERSHIP_DUPLICATE|ya (está|esta) vinculad/i.test(msg)) {
          AppFeedback.warning("Este propietario ya está vinculado a esa unidad.", {
            title: "Unidad duplicada"
          });
          return;
        }
        AppFeedback.fromError(err, msg);
      }
    });
  }

  requestAnimationFrame(() => $("#owner-sheet-title")?.focus?.({ preventScroll: true }));
  if (manageUnits) {
    const scrollTarget =
      activeLinks.length > 0
        ? body.querySelector("#owner-linked-units")
        : body.querySelector("#owner-link-section") || body.querySelector("#form-link-owner-unit");
    scrollTarget?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
}

async function deactivateOwner(ownerId) {
  const ok = await confirmAction(
    "DESACTIVAR PROPIETARIO",
    "El propietario dejará de ser elegible para nuevas asambleas. El historial se preserva.",
    "Desactivar"
  );
  if (!ok) return;
  await api(`/api/ph/${currentPhId}/owners/${ownerId}/deactivate`, { method: "POST", body: {} });
  AppFeedback.success("El propietario quedó inactivo.", { title: "Propietario desactivado" });
  await loadOwners();
  await showOwner(ownerId);
}

async function reactivateOwner(ownerId) {
  await api(`/api/ph/${currentPhId}/owners/${ownerId}/reactivate`, { method: "POST" });
  AppFeedback.success("Vuelve a asociar unidades si es necesario.", { title: "Propietario reactivado" });
  await loadOwners();
  await showOwner(ownerId);
}

async function deleteOwner(ownerId) {
  const evaluation = await api(`/api/ph/${currentPhId}/owners/${ownerId}/delete-evaluation`);
  if (!evaluation.canHardDelete) {
    const ok = await confirmAction(
      "No se puede eliminar este propietario",
      `${(evaluation.blockingReasons || []).join(" ") || evaluation.summary || ""} Puedes desactivarlo sin perder el historial.`,
      "Desactivar"
    );
    if (ok) await deactivateOwner(ownerId);
    return;
  }
  const ok = await confirmDialog({
    title: "Eliminar propietario",
    body: evaluation.summary || "Se eliminará este propietario sin historial de asambleas.",
    confirmLabel: "Eliminar",
    danger: true
  });
  if (!ok) return;
  try {
    const trigger = document.activeElement;
    const { runWithButton } = await import("./loading.js");
    await runWithButton(trigger?.tagName === "BUTTON" ? trigger : null, "Eliminando…", async () => {
      await api(`/api/ph/${currentPhId}/owners/${ownerId}`, { method: "DELETE" });
      notify.success("El propietario fue eliminado del listado.", { title: "Propietario eliminado" });
      closeOwnerSheet({ restore: true });
      await loadOwners();
    });
  } catch (err) {
    notify.fromError(err);
  }
}

async function inviteOwner(ownerId, triggerBtn) {
  const buttons = [
    triggerBtn,
    ...document.querySelectorAll(`[data-invite="${ownerId}"]`)
  ].filter(Boolean);
  buttons.forEach((b) => {
    b.disabled = true;
    if (b.dataset.invite != null || b.dataset.inviteDetail != null) {
      b.dataset.prevLabel = b.textContent;
      b.textContent = "Enviando invitación…";
    }
  });
  try {
    const result = await api(`/api/ph/${currentPhId}/owners/${ownerId}/invite`, { method: "POST" });
    if (!result.emailSent) {
      AppFeedback.error("Verifica la configuración de correo e inténtalo nuevamente.", {
        title: "No pudimos enviar la invitación"
      });
      return;
    }
    const loginHint = result.requiresLoginToAccept
      ? " Deberá iniciar sesión para aceptar."
      : "";
    AppFeedback.success(`La invitación fue enviada a ${result.emailMasked || "el correo registrado"}.${loginHint}`, {
      title: "Invitación enviada"
    });
    const status = $("#owner-action-status");
    if (status) {
      status.hidden = false;
      status.textContent = "Invitación enviada.";
    }
    await loadOwners();
    restoreOwnerListPosition();
    await showOwner(ownerId, { keepOpen: !!$("#dlg-owner")?.open });
  } catch (err) {
    const code = err.code || err.problem?.code || "";
    if (code === "COMMUNICATION_EMAIL_NOT_CONFIGURED" || code === "SMTP_NOT_CONFIGURED") {
      const phName = currentPh?.name || "este PH";
      AppFeedback.error(`Configura el correo electrónico para ${phName} antes de invitar propietarios.`, {
        title: "Correo no configurado",
        actionLabel: "Configurar correo",
        onAction: () => {
          location.href = `/communications.html?phId=${encodeURIComponent(currentPhId)}`;
        }
      });
      return;
    }
    if (code === "OWNER_EMAIL_REQUIRED" || code === "OWNER_EMAIL_INVALID") {
      AppFeedback.warning("Agrega un correo electrónico válido al propietario antes de invitar.", {
        title: "Correo requerido"
      });
      return;
    }
    if (code === "PUBLIC_BASE_URL_MISSING" || code === "PUBLIC_BASE_URL_REQUIRED") {
      AppFeedback.error(
        "Falta la URL pública de ASAMBLEAS. En local se usa https://localhost:7188; en producción configura ASAMBLEAS_PUBLIC_BASE_URL.",
        { title: "No se pudo armar el enlace del correo" }
      );
      return;
    }
    AppFeedback.error("Verifica la conexión e inténtalo nuevamente.", {
      title: "No pudimos enviar la invitación",
      actionLabel: "Intentar nuevamente",
      onAction: () => inviteOwner(ownerId)
    });
  } finally {
    buttons.forEach((b) => {
      b.disabled = false;
      if (b.dataset.prevLabel) {
        b.textContent = b.dataset.prevLabel;
        delete b.dataset.prevLabel;
      }
    });
  }
}

async function requestPasswordReset(ownerId, triggerBtn) {
  const buttons = [
    triggerBtn,
    ...document.querySelectorAll(`[data-reset-password="${ownerId}"]`),
    ...document.querySelectorAll(`[data-reset-password-detail="${ownerId}"]`)
  ].filter(Boolean);
  buttons.forEach((b) => {
    b.disabled = true;
    b.dataset.prevLabel = b.textContent;
    b.textContent = "Enviando…";
  });
  try {
    const result = await api(`/api/ph/${currentPhId}/owners/${ownerId}/password-reset`, { method: "POST" });
    AppFeedback.success(
      `Enviamos el enlace de restablecimiento a ${result.emailMasked || "el correo registrado"}. El propietario define su nueva contraseña (no se envía la clave).`,
      { title: "Restablecimiento enviado" }
    );
    await loadOwners();
    await showOwner(ownerId);
  } catch (err) {
    const code = err.code || err.problem?.code || "";
    if (code === "COMMUNICATION_EMAIL_NOT_CONFIGURED" || code === "SMTP_NOT_CONFIGURED") {
      const phName = currentPh?.name || "este PH";
      AppFeedback.error(`Configura el correo electrónico para ${phName} antes de enviar restablecimientos.`, {
        title: "Correo no configurado",
        actionLabel: "Configurar correo",
        onAction: () => {
          location.href = `/communications.html?phId=${encodeURIComponent(currentPhId)}`;
        }
      });
      return;
    }
    if (code === "OWNER_NOT_ACTIVE") {
      AppFeedback.warning(err.message || "El propietario necesita acceso activo. Envía una invitación primero.", {
        title: "Sin cuenta activa"
      });
      return;
    }
    if (code === "OWNER_EMAIL_REQUIRED" || code === "OWNER_EMAIL_INVALID") {
      AppFeedback.warning("Agrega un correo electrónico válido al propietario antes de continuar.", {
        title: "Correo requerido"
      });
      return;
    }
    if (code === "PUBLIC_BASE_URL_MISSING" || code === "PUBLIC_BASE_URL_REQUIRED") {
      AppFeedback.error(
        "Falta la URL pública de ASAMBLEAS. En local se usa https://localhost:7188; en producción configura ASAMBLEAS_PUBLIC_BASE_URL.",
        { title: "No se pudo armar el enlace del correo" }
      );
      return;
    }
    AppFeedback.fromError(err, "No pudimos enviar el restablecimiento. Inténtalo de nuevo.");
  } finally {
    buttons.forEach((b) => {
      b.disabled = false;
      if (b.dataset.prevLabel) {
        b.textContent = b.dataset.prevLabel;
        delete b.dataset.prevLabel;
      }
    });
  }
}

function phLifecycleLabel(status) {
  const map = {
    Draft: "Borrador",
    ReadyForAssembly: "Listo para asamblea",
    Active: "Activo",
    Inactive: "Archivado"
  };
  return map[status] || status || "—";
}

function inviteActionForAccess(status) {
  if (status === "Active") return null;
  if (status === "InvitationPending" || status === "InvitationExpired") return "Reenviar";
  if (status === "AccessSuspended") return null;
  return "Invitar";
}

function platformAccessLabel(status) {
  const map = {
    NotInvited: "Sin invitar",
    InvitationPending: "Invitación enviada",
    InvitationExpired: "Invitación expirada",
    Active: "Cuenta activa",
    AccessSuspended: "Acceso suspendido"
  };
  return map[status] || status || "Sin invitar";
}

function ownerLifecycleLabel(status) {
  const map = {
    Draft: "Borrador",
    Invited: "Invitado",
    Active: "Activo",
    Inactive: "Inactivo"
  };
  return map[status] || status || "—";
}

function maskEmail(email) {
  if (!email || !email.includes("@")) return "—";
  const [local, domain] = email.split("@");
  const visible = Math.min(3, local.length);
  return `${local.slice(0, visible)}******@${domain}`;
}

async function loadCoefficients({ soft = false } = {}) {
  if (!currentPhId) return;
  if (soft && isPhTabFresh("coefficients")) return;
  const path = `/api/ph/${currentPhId}/coefficients`;
  if (!soft) invalidateCachedGet(`GET:${path}`);
  const c = soft
    ? await cachedGet(path, { ttlMs: PH_TAB_TTL_MS, cacheKey: `GET:${path}` })
    : await api(path);
  markPhTabFresh("coefficients");
  const rollup = coefficientRollupCopy(c);
  const total = formatCoefficientAmount(c.totalPercent);
  const expected = formatCoefficientAmount(c.expectedPercent);
  const complete = rollup.tone === "ok";
  $("#coeff-panel").innerHTML = `
    <div class="coeff-board">
      <p class="coeff-board__total"><strong>${total}%</strong> <span>de ${expected}%</span></p>
      <p class="badge ${complete ? "bg-green-lt" : "bg-yellow-lt"}">${complete ? "Completos" : rollup.tone === "over" ? "Excede" : "Falta"}</p>
      <p class="coeff-board__msg">${escapeHtml(c.message || rollup.text)}</p>
      <p class="muted">${c.activeUnitCount} unidades activas. Total de coeficientes del PH, distinto del quórum.</p>
      <div class="cta-row">
        <button type="button" class="btn btn-primary" id="btn-coeff-units">Revisar unidades</button>
      </div>
    </div>`;
  $("#btn-coeff-units")?.addEventListener("click", () => {
    switchTab("units");
    focusPhPanelTitle("units");
  });
}

async function loadReadiness({ soft = false } = {}) {
  if (!currentPhId) return;
  if (soft && isPhTabFresh("readiness")) return;
  const path = `/api/ph/${currentPhId}/readiness`;
  if (!soft) invalidateCachedGet(`GET:${path}`);
  const r = soft
    ? await cachedGet(path, { ttlMs: PH_TAB_TTL_MS, cacheKey: `GET:${path}` })
    : await api(path);
  markPhTabFresh("readiness");
  const bannerClass = r.readyForAssembly ? "is-ready" : "is-blocked";
  const bannerText = r.readyForAssembly ? "Listo para asamblea" : "No listo para asamblea";
  const next = !r.generalInfoComplete
    ? { tab: "info", label: "Completar información" }
    : !r.unitsComplete
      ? { tab: "units", label: "Revisar unidades" }
      : !r.ownersComplete
        ? { tab: "owners", label: "Revisar propietarios" }
        : !r.coefficients?.isComplete
          ? { tab: "coefficients", label: "Revisar coeficientes" }
          : { tab: "assemblies", label: "Ir a asambleas" };
  const coeffPct = Math.round(Number(r.coefficients?.totalPercent || 0));
  const items = [
    {
      title: "Información general",
      ok: Boolean(r.generalInfoComplete),
      detail: r.generalInfoComplete
        ? "Nombre, dirección y contacto del PH están completos."
        : "Faltan datos del PH. Completa nombre, dirección o contacto.",
      tab: "info",
      action: r.generalInfoComplete ? "Revisar" : "Completar"
    },
    {
      title: "Unidades",
      ok: Boolean(r.unitsComplete),
      detail: r.unitsComplete
        ? `${r.unitCount} unidades registradas.`
        : "Aún no hay unidades suficientes para convocar.",
      tab: "units",
      action: "Revisar unidades"
    },
    {
      title: "Propietarios",
      ok: Boolean(r.ownersComplete),
      detail: r.ownersComplete
        ? `${r.ownerCount} propietarios vinculados.`
        : "Falta vincular propietarios a las unidades.",
      tab: "owners",
      action: "Revisar propietarios"
    },
    {
      title: "Coeficientes",
      ok: Boolean(r.coefficients?.isComplete),
      detail: `${coeffPct}% del total del PH. ${r.coefficients?.isComplete ? "El total cuadra." : "El total no cuadra con 100%."}`,
      tab: "coefficients",
      action: "Revisar coeficientes"
    },
    {
      title: "Usuarios invitados",
      ok: Number(r.invitedUserCount) > 0,
      detail: Number(r.invitedUserCount) > 0
        ? `${r.invitedUserCount} usuarios con invitación.`
        : "Nadie tiene invitación. Puedes invitar desde propietarios.",
      tab: "owners",
      action: "Ver propietarios"
    },
    {
      title: "Configuración de asamblea",
      ok: Boolean(r.assemblyConfigComplete),
      detail: r.assemblyConfigComplete
        ? "La configuración mínima de asamblea está lista."
        : "Falta la configuración mínima para convocar.",
      tab: "assemblies",
      action: "Ir a asambleas"
    }
  ];
  $("#readiness-panel").innerHTML = `
    <div class="readiness-banner ${bannerClass}" role="status">${bannerText}</div>
    <div class="readiness-cards">
      ${items.map((item) => `
        <article class="ph-ready-card ${item.ok ? "is-ready" : "is-attention"}">
          <div class="ph-ready-card__main">
            <p class="ph-ready-card__status">${item.ok ? "Listo" : "Pendiente"}</p>
            <h3>${escapeHtml(item.title)}</h3>
            <p>${escapeHtml(item.detail)}</p>
          </div>
          <button type="button" class="btn btn-secondary btn-sm" data-ready-tab="${escapeHtml(item.tab)}">${escapeHtml(item.action)}</button>
        </article>`).join("")}
    </div>
    ${(r.blockingIssues || []).map((i) => `<p class="lede">${escapeHtml(i)}</p>`).join("")}
    <div class="cta-row">
      <button type="button" class="btn btn-primary" id="btn-readiness-next">${escapeHtml(next.label)}</button>
    </div>`;
  $("#readiness-panel").querySelectorAll("[data-ready-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      switchTab(btn.dataset.readyTab);
      focusPhPanelTitle(btn.dataset.readyTab);
    });
  });
  $("#btn-readiness-next")?.addEventListener("click", () => {
    switchTab(next.tab);
    focusPhPanelTitle(next.tab);
  });
}

async function openRosterImport() {
  if (!currentPhId) {
    AppFeedback.warning("Seleccione un PH primero.", { title: "PH requerido" });
    return;
  }
    const { openPhRosterImportWizard } = await import("./ph-roster-import.js?v=polish9");
  openPhRosterImportWizard({
    phId: currentPhId,
    phName: currentPh?.name || "",
    onImported: async () => {
      invalidatePhTabData(currentPhId);
      await Promise.all([loadUnits(), loadOwners(), loadCoefficients(), loadReadiness()]);
    }
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}


async function handlePhUrl(urlLike) {
  const u = typeof urlLike === "string" ? new URL(urlLike, location.origin) : urlLike;
  const phId = u.searchParams.get("phId");
  const tab = (u.hash || "").replace(/^#/, "") || null;
  if (phId) {
    if (String(currentPhId) === String(phId) && currentPh && !$("#view-detail")?.hidden) {
      applyingRoute = true;
      try {
        switchTab(tab || "resumen");
      } finally {
        applyingRoute = false;
        stopTopProgress();
      }
      return;
    }
    await openPh(phId, tab || "resumen");
    return;
  }
  currentPhId = null;
  currentPh = null;
  $("#view-detail").hidden = true;
  $("#view-list").hidden = false;
  mountPhListShell();
  try {
    await loadList();
  } finally {
    stopTopProgress();
  }
}

export async function mount(ctx = {}) {
  window.__asambleasHandlePhUrl = handlePhUrl;
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
  try {
    unitsHub = null;
  } catch { /* ignore */ }
  currentPhId = null;
  currentPh = null;
  phFormBinder?.destroy?.();
  phFormBinder = null;
  createPhUntrap?.();
  createPhUnbindKeyboard?.();
  createPhUntrap = null;
  createPhUnbindKeyboard = null;
  document.querySelectorAll("body > dialog.app-sheet, body > #dlg-confirm-action, body > #dlg-ph-created").forEach((n) => n.remove());
  window.__asambleasHandlePhUrl = handlePhUrl;
}

export async function canLeave() {
  return true;
}

export async function dispose() {
  await unmount();
}

if (!window.__ASAM_SOFT_MOUNTING__ && !window.__ASAM_HYBRID__) {
  mount().catch((err) => AppFeedback.fromError(err));
}
