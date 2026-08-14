import { api, ensureAntiforgery } from "./api.js";
import { me, logout, hasPermission } from "./auth.js";
import { mountIaShell, phHref } from "./ia-nav.js";
import { assemblyListBucket, statusLabelEs } from "./ia-actions.js";
import { formatDateTime, confirmDialog, notify } from "./ui.js";
import { AppFeedback } from "./app-feedback.js";
import { bindStickyForm } from "./ux-forms.js";
import { runWithButton } from "./loading.js";

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

const SYSTEM_FIELDS = [
  ["UnitCode", "Unidad"],
  ["Tower", "Torre"],
  ["Floor", "Piso"],
  ["CoefficientPercent", "Coeficiente"],
  ["FirstName", "Nombre"],
  ["LastName", "Apellido"],
  ["Identification", "Identificación"],
  ["Email", "Email"],
  ["Phone", "Teléfono"]
];

let user = null;
let currentPhId = null;
let currentPh = null;
let importSession = null;
let suggestedMappings = [];
let editingOwnerId = null;
let myMemberships = [];
let phAssemblies = [];
let asmFilter = "upcoming";
let phFormBinder = null;

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

function clearAlert() {
  if (alertEl) alertEl.hidden = true;
}

function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

async function init() {
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

  $("#user-chip").textContent = user.displayName || user.email;
  $("#nav-tenant").textContent = user.tenantCode || "Gobernanza";
  $("#btn-logout").addEventListener("click", async () => {
    await logout();
    location.href = "/";
  });

  wireUi();
  await refreshSwitcher();
  await loadList();

  const urlPh = new URLSearchParams(location.search).get("phId");
  if (urlPh) {
    const desiredHash = (location.hash || "").replace("#", "");
    await openPh(urlPh, desiredHash || null);
  } else {
    mountPhListShell();
  }
}

function mountPhListShell() {
  mountIaShell(
    { level: "global", user, current: "ph-list" },
    { breadcrumbs: [{ label: "Propiedades" }] }
  );
}

function applyHashTab() {
  const hash = (location.hash || "").replace("#", "");
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
  if (map[hash]) switchTab(map[hash]);
  else if (currentPh && !isOnboardingMode(currentPh)) switchTab("resumen");
}

/** Wizard only for empty Draft PHs. Operational chrome otherwise. */
function isOnboardingMode(ph) {
  if (!ph) return false;
  if (ph.status === "Active" || ph.status === "ReadyForAssembly" || ph.status === "Inactive") {
    return false;
  }
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
  if (wizard) wizard.hidden = !onboarding;
  if (progress) {
    progress.hidden = !onboarding;
    const step = Math.min(Math.max(Number(ph.onboardingStep) || 1, 1), 7);
    progress.textContent = `Paso ${step} de 7`;
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
      ? "Configura tu propiedad horizontal para comenzar a organizar propietarios y asambleas."
      : "Tu usuario puede ver propiedades, pero no crearlas. Usa una cuenta con permiso «Administrar PH» (Administrador PH o Presidente).";
  }
}

function openCreatePhDialog() {
  if (!canCreatePh()) {
    AppFeedback.error("Inicia sesión con Administrador PH o Presidente de asamblea.", {
      title: "Sin permiso"
    });
    return;
  }
  clearAlert();
  $("#dlg-create-ph")?.showModal();
}

function wireUi() {
  applyCreatePhGate();
  $("#btn-create-ph").addEventListener("click", openCreatePhDialog);
  $("#btn-create-first")?.addEventListener("click", openCreatePhDialog);
  $("#btn-cancel-create").addEventListener("click", () => $("#dlg-create-ph").close());
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
      document.querySelectorAll("#asm-filters button").forEach((b) => {
        b.setAttribute("aria-pressed", String(b === btn));
      });
      renderAssembliesList();
    });
  });

  window.addEventListener("hashchange", () => {
    if (currentPhId) applyHashTab();
  });

  $("#btn-new-unit").addEventListener("click", () => {
    $("#unit-form-wrap").hidden = false;
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
  $("#unit-search").addEventListener("input", () => loadUnits());
  $("#form-transfer")?.addEventListener("submit", onTransferOwnership);
  $("#btn-cancel-transfer")?.addEventListener("click", () => {
    const dlg = $("#transfer-dialog");
    if (dlg) dlg.hidden = true;
  });

  $("#btn-new-owner").addEventListener("click", () => startOwnerCreate());
  $("#btn-empty-add-owner")?.addEventListener("click", () => startOwnerCreate());
  $("#btn-cancel-owner")?.addEventListener("click", () => {
    editingOwnerId = null;
    $("#form-owner").reset();
    $("#owner-form-wrap").hidden = true;
  });
  $("#btn-goto-import")?.addEventListener("click", () => switchTab("import"));
  $("#btn-empty-import")?.addEventListener("click", () => switchTab("import"));
  $("#form-owner").addEventListener("submit", onSaveOwner);
  $("#owner-unit-select")?.addEventListener("change", () => syncOwnerShareForSelectedUnit());
  $("#owner-search")?.addEventListener("input", () => loadOwners());
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
    el.addEventListener("click", closeOwnerDrawer);
  });
  $("#btn-export-owners")?.addEventListener("click", exportOwners);
  $("#btn-validate-owners")?.addEventListener("click", validateOwnersBulk);
  $("#btn-bulk-invite")?.addEventListener("click", bulkInvite);
  $("#owners-check-all")?.addEventListener("change", (e) => {
    document.querySelectorAll("#owners-table tbody input[type=checkbox]").forEach((cb) => {
      cb.checked = e.target.checked;
    });
  });

  $("#btn-analyze").addEventListener("click", analyzeImport);
  $("#btn-validate-import").addEventListener("click", validateImport);
  $("#btn-commit-import").addEventListener("click", commitImport);
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

async function loadList() {
  clearAlert();
  const list = await api("/api/ph");
  const root = $("#ph-list");
  const empty = $("#ph-empty");
  if (!list.length) {
    empty.hidden = false;
    root.innerHTML = "";
    return;
  }
  empty.hidden = true;
  root.innerHTML = list
    .map(
      (p) => `
      <article class="ph-card" data-id="${p.id}">
        <h3>${escapeHtml(p.name)}</h3>
        <div class="meta">
          <span>${p.unitCount} unidades · ${p.ownerCount} propietarios</span>
          <span class="badge">${escapeHtml(phLifecycleLabel(p.status))}</span>
        </div>
        <div class="cta-row">
          <button type="button" class="btn btn-primary" data-view="${p.id}">Ver</button>
          <button type="button" class="btn btn-secondary" data-edit="${p.id}">Editar</button>
          <button type="button" class="btn btn-secondary" data-more="${p.id}" aria-haspopup="true">•••</button>
        </div>
        <div class="ph-more-menu" id="more-${p.id}" hidden>
          ${
            p.status === "Inactive"
              ? `<button type="button" data-reactivate="${p.id}">Reactivar</button>`
              : `<button type="button" data-archive="${p.id}">Archivar</button>`
          }
          ${
            canAdministerPh(p.id)
              ? `<button type="button" data-delete="${p.id}">Eliminar…</button>`
              : ""
          }
        </div>
      </article>`
    )
    .join("");
  root.querySelectorAll("[data-view], [data-edit]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      openPh(btn.dataset.view || btn.dataset.edit).then(() => {
        if (btn.dataset.edit) switchTab("info");
      });
    });
  });
  root.querySelectorAll("[data-more]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const menu = $(`#more-${btn.dataset.more}`);
      menu.hidden = !menu.hidden;
    });
  });
  root.querySelectorAll("[data-archive]").forEach((btn) =>
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      currentPhId = btn.dataset.archive;
      await onArchivePh();
      await loadList();
    })
  );
  root.querySelectorAll("[data-reactivate]").forEach((btn) =>
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      currentPhId = btn.dataset.reactivate;
      await onReactivatePh();
      await loadList();
    })
  );
  root.querySelectorAll("[data-delete]").forEach((btn) =>
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      currentPhId = btn.dataset.delete;
      await onDeletePh();
      await loadList();
    })
  );
}

async function onCreatePh(ev) {
  ev.preventDefault();
  ev.stopPropagation();
  if (!canCreatePh()) {
    AppFeedback.error("No tienes permiso para crear un PH. Se requiere «Administrar PH».", {
      title: "Creación bloqueada"
    });
    return;
  }

  const form = ev.target;
  const submitBtn = form.querySelector('button[type="submit"]');
  const data = formData(form);

    const inlineErr = $("#create-ph-error");
    if (inlineErr) {
      inlineErr.hidden = true;
      inlineErr.textContent = "";
    }

  try {
    const created = await runWithButton(submitBtn, "Creando…", async () =>
      api("/api/ph", {
        method: "POST",
        body: {
          name: data.name,
          legalName: data.legalName || null,
          code: data.code,
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
      })
    );

    $("#dlg-create-ph").close();
    form.reset();
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
  }
}

async function openPh(id, preferredTab = null) {
  clearAlert();
  currentPhId = id;
  const ph = await api(`/api/ph/${id}`);
  currentPh = ph;
  $("#view-list").hidden = true;
  $("#view-detail").hidden = false;
  $("#ph-title").textContent = ph.name;
  const statusBadge = escapeHtml(phLifecycleLabel(ph.status));
  const prepHint =
    ph.status === "ReadyForAssembly"
      ? `<span class="badge badge-live">Preparación · Lista para convocar</span>`
      : "";
  $("#ph-meta").innerHTML = `<span>${escapeHtml(ph.code)}</span><span class="badge">${statusBadge}</span>${prepHint}`;

  applyPhMode(ph);

  // Detail DTO may omit aggregate counts — enrich from list summary when needed.
  let unitCount = ph.unitCount;
  let ownerCount = ph.ownerCount;
  let activeUserCount = ph.activeUserCount;
  let coefficientTotalPercent = ph.coefficientTotalPercent;
  let coefficientsComplete = ph.coefficientsComplete;
  if (unitCount == null || ownerCount == null) {
    try {
      const list = await api("/api/ph");
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

  $("#ph-stat-strip").innerHTML = `
    <div class="ia-stat"><div class="ia-stat__value">${unitCount ?? 0}</div><div class="ia-stat__label">Unidades</div></div>
    <div class="ia-stat"><div class="ia-stat__value">${ownerCount ?? 0}</div><div class="ia-stat__label">Propietarios</div></div>
    <div class="ia-stat"><div class="ia-stat__value">${activeUserCount ?? 0}</div><div class="ia-stat__label">Usuarios activos</div></div>
    <div class="ia-stat"><div class="ia-stat__value">${coefficientsComplete ? "100%" : `${Number(coefficientTotalPercent ?? 0).toFixed(0)}%`}</div><div class="ia-stat__label">Coeficientes</div></div>
  `;

  const nextHost = $("#ph-next-assembly");
  if (ph.nextAssemblyAtUtc || ph.nextAssemblyTitle) {
    nextHost.hidden = false;
    const when = ph.nextAssemblyAtUtc ? formatDateTime(ph.nextAssemblyAtUtc) : "—";
    nextHost.innerHTML = `
      <p class="section-title" style="margin:0 0 0.35rem">Próxima asamblea</p>
      <strong>${escapeHtml(ph.nextAssemblyTitle || "Asamblea")}</strong>
      <p class="muted" style="margin:0.35rem 0 0.75rem">${escapeHtml(when)}</p>
      <a class="btn btn-primary" id="btn-view-next-assembly" href="/calendar.html?phId=${encodeURIComponent(id)}">Ver asamblea</a>
    `;
  } else {
    nextHost.hidden = true;
    nextHost.innerHTML = "";
  }

  const newAsm = $("#btn-new-assembly");
  if (newAsm) {
    newAsm.href = `/calendar.html?phId=${encodeURIComponent(id)}`;
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
  const initialTab = preferredTab || (isOnboardingMode(ph) ? "info" : "resumen");
  const allowed = new Set(["resumen", "info", "assemblies", "units", "owners", "coefficients", "import", "readiness"]);
  switchTab(allowed.has(initialTab) ? initialTab : isOnboardingMode(ph) ? "info" : "resumen");
  await Promise.all([loadUnits(), loadOwners(), loadCoefficients(), loadReadiness(), loadAssemblies()]);
  await renderAttentionAndPrep(ph);
  setupPhFormBinder();
  await refreshPhDeleteAvailability();
  // Link next assembly to concrete event when available
  const nextBtn = $("#btn-view-next-assembly");
  const upcoming = phAssemblies.find((e) => assemblyListBucket(e.status) === "upcoming" || assemblyListBucket(e.status) === "live");
  if (nextBtn && upcoming) {
    nextBtn.href = `/dashboard.html?assemblyId=${encodeURIComponent(upcoming.assemblyId)}`;
    nextBtn.textContent = "Ver asamblea";
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
  if (tab === "coefficients") loadCoefficients();
  if (tab === "readiness") loadReadiness();
  if (tab === "assemblies") loadAssemblies();
  if (tab === "resumen") renderAttentionAndPrep(currentPh);

  const currentMap = {
    resumen: "ph-overview",
    info: "ph-config",
    assemblies: "ph-assemblies",
    units: "ph-units",
    owners: "ph-owners",
    coefficients: "ph-config",
    import: "ph-config",
    readiness: "ph-overview"
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
  if (location.hash.replace("#", "") !== desiredHash) {
    history.replaceState({}, "", `${location.pathname}${location.search}#${desiredHash}`);
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
    import: "Importar",
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
      <p class="section-title" style="margin:0 0 0.5rem">Atención</p>
      <ul style="margin:0 0 0.75rem;padding-left:1.1rem">${issues.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>
      <button type="button" class="btn btn-secondary" id="btn-review-pending">Revisar pendientes</button>`;
    $("#btn-review-pending")?.addEventListener("click", () => switchTab("owners"));
  } else {
    attention.hidden = true;
    attention.innerHTML = "";
  }

  prep.hidden = false;
  prep.innerHTML = `
    <p class="section-title" style="margin:0 0 0.5rem">Preparación del PH</p>
    <ul style="margin:0;padding-left:1.1rem;line-height:1.7">
      <li>${(ph.unitCount ?? 0) > 0 ? "✓" : "○"} Unidades</li>
      <li>${(ph.ownerCount ?? 0) > 0 ? "✓" : "○"} Propietarios</li>
      <li>${ph.coefficientsComplete ? "✓" : "⚠"} Coeficientes</li>
      <li>${ph.status === "Active" || ph.status === "ReadyForAssembly" ? "✓" : "○"} Activación</li>
    </ul>`;
}

async function loadAssemblies() {
  if (!currentPhId) return;
  const host = $("#ph-assemblies-list");
  if (!host) return;
  host.innerHTML = `<div class="skeleton" style="height:4rem"></div>`;
  try {
    const from = new Date();
    from.setMonth(from.getMonth() - 6);
    const to = new Date();
    to.setMonth(to.getMonth() + 12);
    const data = await api(
      `/api/calendar/events?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}&propertyHorizontalId=${encodeURIComponent(currentPhId)}`
    );
    phAssemblies = Array.isArray(data?.events) ? data.events : Array.isArray(data) ? data : [];
    renderAssembliesList();
  } catch (err) {
    host.innerHTML = `<div class="empty-state">${escapeHtml(err.message || "No se pudieron cargar las asambleas.")}</div>`;
  }
}

function renderAssembliesList() {
  const host = $("#ph-assemblies-list");
  if (!host) return;

  const rows =
    asmFilter === "all"
      ? phAssemblies
      : phAssemblies.filter((e) => assemblyListBucket(e.status) === asmFilter);

  if (!rows.length) {
    host.innerHTML = `
      <div class="ia-empty-state">
        <p>No hay asambleas en este filtro.</p>
        <a class="btn btn-primary" href="/calendar.html?phId=${encodeURIComponent(currentPhId)}">+ Nueva asamblea</a>
      </div>`;
    return;
  }

  const sorted = [...rows].sort(
    (a, b) => new Date(a.scheduledAtUtc).getTime() - new Date(b.scheduledAtUtc).getTime()
  );
  const now = Date.now();

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
    const primaryLabel =
      bucket === "done"
        ? "Ver resultados"
        : bucket === "live"
          ? "Entrar a sala"
          : "Ver asamblea";
    const primaryHref =
      bucket === "live"
        ? `/lobby.html?assemblyId=${id}`
        : bucket === "done"
          ? `/minutes.html?assemblyId=${id}`
          : `/dashboard.html?assemblyId=${id}`;
    const secondary =
      bucket === "done"
        ? `<a class="btn btn-ghost btn-sm" href="/minutes.html?assemblyId=${id}">Acta</a>`
        : bucket === "upcoming"
          ? `<a class="btn btn-ghost btn-sm" href="/convocation.html?assemblyId=${id}">Convocatoria</a>`
          : "";
    const moreMenu =
      bucket === "done" || bucket === "cancelled"
        ? `
      <details class="ia-row-menu">
        <summary class="btn btn-ghost btn-sm" aria-label="Más acciones">•••</summary>
        <div class="ia-row-menu__panel" role="menu">
          <a role="menuitem" href="/dashboard.html?assemblyId=${id}&mode=historical">Ver resumen</a>
          <a role="menuitem" href="/minutes.html?assemblyId=${id}">Acta</a>
          <a role="menuitem" href="/expediente.html?assemblyId=${id}">Expediente</a>
        </div>
      </details>`
        : `
      <details class="ia-row-menu">
        <summary class="btn btn-ghost btn-sm" aria-label="Más acciones">•••</summary>
        <div class="ia-row-menu__panel" role="menu">
          <a role="menuitem" href="/dashboard.html?assemblyId=${id}">Ver resumen</a>
          <a role="menuitem" href="/calendar.html?assemblyId=${id}">Reprogramar</a>
          <a role="menuitem" href="/convocation.html?assemblyId=${id}">Convocatoria</a>
          <a role="menuitem" href="/minutes.html?assemblyId=${id}">Acta</a>
        </div>
      </details>`;

    return `
      <div class="ia-asm-row">
        <div>
          <strong>${escapeHtml(e.title)}</strong>
          <p class="ia-asm-row__meta">${escapeHtml(when)} · ${escapeHtml(e.modality || "—")}${compact ? "" : ` · Convocados ${e.participantCount ?? 0}`}</p>
        </div>
        <div><span class="ia-badge-status${bucket === "live" ? " is-live" : bucket === "upcoming" ? " is-ready" : ""}">${escapeHtml(statusLabelEs(e.status))}</span></div>
        <div class="ia-asm-row__actions">
          <a class="btn btn-${compact ? "secondary" : "primary"} btn-sm" href="${primaryHref}">${primaryLabel}</a>
          ${secondary}
          ${moreMenu}
        </div>
      </div>`;
  };

  if (asmFilter === "upcoming" || asmFilter === "all") {
    const upcoming = sorted.filter(
      (e) =>
        (assemblyListBucket(e.status) === "upcoming" || assemblyListBucket(e.status) === "live") &&
        new Date(e.scheduledAtUtc).getTime() >= now - 86_400_000
    );
    const past = sorted.filter((e) => assemblyListBucket(e.status) === "done");
    const hero = upcoming[0];
    const restUpcoming = upcoming.slice(1);

    let html = "";
    if (hero) {
      const d = new Date(hero.scheduledAtUtc);
      const whenLong = Number.isNaN(d.getTime()) ? "—" : formatDateTime(hero.scheduledAtUtc);
      const id = encodeURIComponent(hero.assemblyId);
      html += `
        <div class="ia-asm-summary__section">
          <p class="ia-asm-summary__section-title">Próxima asamblea</p>
          <div class="ia-asm-summary__hero">
            <div class="ia-asm-summary__hero-head">
              <div>
                <strong style="font-size:1.05rem">${escapeHtml(hero.title)}</strong>
                <p class="ia-asm-row__meta">${escapeHtml(whenLong)} · ${escapeHtml(hero.modality || "—")}</p>
              </div>
              <span class="ia-badge-status is-ready">${escapeHtml(statusLabelEs(hero.status))}</span>
            </div>
            <div class="ia-asm-row__actions" style="justify-content:flex-start">
              <a class="btn btn-primary" href="/dashboard.html?assemblyId=${id}">Continuar preparación</a>
              <a class="btn btn-secondary" href="/dashboard.html?assemblyId=${id}">Ver asamblea</a>
              <details class="ia-row-menu">
                <summary class="btn btn-ghost btn-sm" aria-label="Más acciones">•••</summary>
                <div class="ia-row-menu__panel" role="menu">
                  <a role="menuitem" href="/calendar.html?assemblyId=${id}">Reprogramar</a>
                  <a role="menuitem" href="/convocation.html?assemblyId=${id}">Convocatoria</a>
                  <a role="menuitem" href="/voting-studio.html?assemblyId=${id}">Votaciones</a>
                </div>
              </details>
            </div>
          </div>
        </div>`;
    }

    if (restUpcoming.length) {
      html += `<div class="ia-asm-summary__section"><p class="ia-asm-summary__section-title">Próximas</p>${restUpcoming.map((e) => fmtRow(e, { compact: true })).join("")}</div>`;
    }

    if (past.length && asmFilter === "all") {
      html += `<div class="ia-asm-summary__section"><p class="ia-asm-summary__section-title">Anteriores</p>${past
        .slice()
        .reverse()
        .map((e) => fmtRow(e, { compact: true }))
        .join("")}</div>`;
    }

    if (!html) {
      html = sorted.map((e) => fmtRow(e)).join("");
    }

    host.innerHTML = html;
    return;
  }

  host.innerHTML = sorted
    .slice()
    .reverse()
    .map((e) => fmtRow(e, { compact: asmFilter === "done" }))
    .join("");
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

async function loadUnits() {
  if (!currentPhId) return;
  const search = $("#unit-search").value.trim();
  const q = search ? `?search=${encodeURIComponent(search)}` : "";
  const units = await api(`/api/ph/${currentPhId}/units${q}`);
  const tbody = $("#units-table tbody");
  tbody.innerHTML = units
    .map(
      (u) => `<tr data-unit-id="${u.id}" style="cursor:pointer">
      <td>${escapeHtml(u.code)}</td>
      <td>${escapeHtml(u.tower || "—")}</td>
      <td>${u.floor ?? "—"}</td>
      <td>${Number(u.coefficientPercent).toFixed(4)}%</td>
      <td>${u.isActive ? "Activa" : "Inactiva"}</td>
      <td><button type="button" class="btn btn-ghost" data-open-unit="${u.id}">Ver</button></td>
    </tr>`
    )
    .join("");
  tbody.querySelectorAll("[data-open-unit]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      showUnit(btn.dataset.openUnit);
    });
  });
  tbody.querySelectorAll("tr[data-unit-id]").forEach((tr) => {
    tr.addEventListener("click", () => showUnit(tr.dataset.unitId));
  });

  const select = $("#owner-unit-select");
  const current = select.value;
  select.innerHTML =
    `<option value="">— asociar después —</option>` +
    units.map((u) => `<option value="${u.id}">${escapeHtml(u.code)}</option>`).join("");
  select.value = current;

  const towerSelect = $("#filter-tower");
  if (towerSelect) {
    const towers = [...new Set(units.map((u) => u.tower).filter(Boolean))].sort();
    const prev = towerSelect.value;
    towerSelect.innerHTML = `<option value="">Torre</option>` + towers.map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join("");
    towerSelect.value = prev;
  }
}

async function showUnit(unitId) {
  const detail = await api(`/api/ph/${currentPhId}/units/${unitId}/ownerships`);
  const el = $("#unit-detail");
  el.hidden = false;
  const total = Number(detail.activeShareTotalPercent || 0);
  const statusLabel = detail.ownershipComplete
    ? `✓ Titularidad completa (${total.toFixed(2)}%)`
    : total > 100.0001
      ? `⚠ Titularidad ${total.toFixed(2)}% — excede 100%`
      : `⚠ Titularidad ${total.toFixed(2)}% — falta ${Number(detail.missingSharePercent || 0).toFixed(2)}%`;
  const active = (detail.owners || []).filter((o) => o.isActive);
  const history = (detail.owners || []).filter((o) => !o.isActive);
  el.innerHTML = `
    <h3>Unidad ${escapeHtml(detail.unitCode)}</h3>
    <p class="muted">Torre ${escapeHtml(detail.tower || "—")} · Piso ${detail.floor ?? "—"} · Coeficiente ${Number(detail.coefficientPercent).toFixed(4)}% · ${detail.isActive ? "Activa" : "Inactiva"}</p>
    <p><strong>${statusLabel}</strong></p>
    <h4>Propietarios activos</h4>
    <ul>${active.length
      ? active
          .map(
            (o) => `<li class="unit-owner-row">
              <strong>${escapeHtml(o.ownerDisplayName)}</strong>
              <label class="unit-share-edit">Participación %
                <input type="number" min="0.0001" max="100" step="0.0001" value="${Number(o.sharePercent).toFixed(4)}" data-share-input="${o.ownershipId}" />
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
            (o) => `<li class="muted">${escapeHtml(o.ownerDisplayName)} · ${Number(o.sharePercent).toFixed(2)}% · ${formatDate(o.effectiveFromUtc)} → ${formatDate(o.effectiveToUtc)}</li>`
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

async function loadOwners() {
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
  const owners = await api(`/api/ph/${currentPhId}/owners${q}`);
  const empty = $("#owners-empty");
  const tableWrap = $("#owners-table")?.closest(".table-wrap");
  if (!owners.length && !search && !tower && !status && !hasEmail && !accessStatus && !invited) {
    empty.hidden = false;
    if (tableWrap) tableWrap.hidden = true;
  } else {
    empty.hidden = true;
    if (tableWrap) tableWrap.hidden = false;
  }
  const tbody = $("#owners-table tbody");
  const hasFilters = !!(search || tower || status || hasEmail || accessStatus || invited);
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
      return `<tr>
      <td><input type="checkbox" value="${o.id}" aria-label="Seleccionar ${escapeHtml(o.displayName)}" /></td>
      <td>
        <strong>${escapeHtml(o.displayName)}</strong>
        <div class="muted" style="font-size:0.85rem">${escapeHtml(email || "sin correo")}</div>
      </td>
      <td>${escapeHtml((o.unitCodes || []).join(", ") || "—")}</td>
      <td>${Number(o.coefficientPercent).toFixed(2)}%</td>
      <td><span class="badge badge-access">${escapeHtml(platformAccessLabel(access))}</span></td>
      <td class="owners-actions">
        <div class="ux-row-actions">
          <button type="button" class="btn btn-secondary" data-owner="${o.id}">Ver</button>
          <div class="ux-menu">
            <button type="button" class="btn btn-ghost" data-more-owner="${o.id}" aria-haspopup="true" aria-label="Más acciones">⋮</button>
            <div class="ux-menu__panel" id="owner-more-${o.id}" hidden>
              <button type="button" data-edit-owner="${o.id}">Editar</button>
              <button type="button" data-owner="${o.id}">Ver detalle</button>
              ${
                action
                  ? `<button type="button" data-invite="${o.id}">${escapeHtml(action)}</button>`
                  : ""
              }
              ${
                inactive
                  ? `<button type="button" data-reactivate-owner-row="${o.id}">Reactivar</button>`
                  : `<button type="button" data-deactivate-owner-row="${o.id}">Desactivar</button>`
              }
              <button type="button" class="is-danger" data-delete-owner-row="${o.id}">Eliminar…</button>
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
    AppFeedback.fromError(err, "No pudimos enviar las invitaciones.");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = prev || "Enviar invitaciones";
    }
  }
}

function startOwnerCreate() {
  editingOwnerId = null;
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
  $("#btn-save-owner").textContent = "Guardar propietario";
  const title = $("#owner-form-title");
  if (title) title.textContent = "Nuevo propietario";
  $("#owner-form-wrap").hidden = false;
  form.firstName.focus();
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
    const remaining = Math.max(0, Number((100 - used).toFixed(4)));
    const activeCount = (detail.owners || []).filter((o) => o.isActive).length;

    if (remaining <= 0) {
      const equal = Number((100 / (activeCount + 1)).toFixed(4));
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
          ? `Copropiedad: ya hay ${used.toFixed(2)}% asignado. Quedan ${remaining.toFixed(2)}% para este propietario.`
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

async function startOwnerEdit(ownerId) {
  // Close detail drawer first — it is modal and otherwise intercepts form clicks.
  closeOwnerDrawer();
  const o = await api(`/api/ph/${currentPhId}/owners/${ownerId}`);
  editingOwnerId = ownerId;
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
  form.unitId.value = "";
  $("#btn-save-owner").textContent = "Guardar cambios";
  const title = $("#owner-form-title");
  if (title) title.textContent = "Editar propietario";
  $("#owner-form-wrap").hidden = false;
  form.firstName?.focus();
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
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(data.email).trim())) {
    AppFeedback.field.error(emailInput, "Ingresa un correo electrónico válido.");
    return;
  }
  try {
    await runWithButton(btn, editingOwnerId ? "Guardando…" : "Creando…", async () => {
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
      editingOwnerId = null;
      ev.target.reset();
      $("#owner-form-wrap").hidden = true;
      await loadOwners();
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
    AppFeedback.fromError(err, msg);
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
  add("Torre", "filter-tower");
  add("Estado", "filter-status");
  add("Correo", "filter-email");
  add("Acceso", "filter-access");
  add("Invitación", "filter-invited");
  host.hidden = chips.length === 0;
  host.innerHTML = chips.join("");
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
  const drawer = $("#owner-drawer");
  if (!drawer) return;
  drawer.hidden = true;
  drawer.setAttribute("aria-hidden", "true");
}

function openOwnerDrawer() {
  const drawer = $("#owner-drawer");
  if (!drawer) return;
  drawer.hidden = false;
  drawer.setAttribute("aria-hidden", "false");
}

async function showOwner(ownerId) {
  const o = await api(`/api/ph/${currentPhId}/owners/${ownerId}`);
  const inactive = o.status === "Inactive";
  const access = o.platformAccessStatus || "NotInvited";
  const canInvite = access !== "Active";
  const inviteLabel = inviteActionForAccess(access) || "Enviar invitación";
  const expires = o.invitationExpiresAtUtc
    ? new Date(o.invitationExpiresAtUtc).toLocaleString("es-PA", { dateStyle: "medium", timeStyle: "short" })
    : "—";

  $("#owner-drawer-title").textContent = o.displayName || "Propietario";
  $("#owner-drawer-sub").textContent = ownerLifecycleLabel(o.status);
  $("#owner-drawer-body").innerHTML = `
    <h3>Información</h3>
    <div class="row"><span>Identificación</span><span>${escapeHtml([o.identificationType, o.identification].filter(Boolean).join(" ") || "—")}</span></div>
    <div class="row"><span>Email</span><span>${escapeHtml(maskEmail(o.email))}</span></div>
    <div class="row"><span>Teléfono</span><span>${escapeHtml(o.phone || "—")}</span></div>
    <h3>Unidades</h3>
    <ul style="margin:0;padding-left:1.1rem">${(o.units || [])
      .map(
        (u) =>
          `<li>${escapeHtml(u.unitCode)} · ${Number(u.unitCoefficientPercent).toFixed(2)}% · participación ${Number(u.sharePercent).toFixed(0)}%
          ${u.isActive ? `<button type="button" class="btn btn-ghost" data-end-own="${u.ownershipId}">Finalizar</button>` : " · histórico"}</li>`
      )
      .join("") || "<li>Sin unidades</li>"}</ul>
    <h3>Acceso</h3>
    <div class="row"><span>Estado</span><span class="badge badge-access">${escapeHtml(platformAccessLabel(access))}</span></div>
    <div class="row"><span>Invitación expira</span><span>${escapeHtml(expires)}</span></div>
  `;
  $("#owner-drawer-footer").innerHTML = `
    <button type="button" class="btn btn-primary" data-edit-owner="${o.id}">Editar</button>
    <div class="cta-row">
      ${canInvite ? `<button type="button" class="btn btn-secondary" data-invite-detail="${o.id}">${escapeHtml(inviteLabel)}</button>` : ""}
      ${
        inactive
          ? `<button type="button" class="btn btn-secondary" data-reactivate-owner="${o.id}">Reactivar</button>`
          : `<button type="button" class="btn btn-secondary" data-deactivate-owner="${o.id}">Desactivar</button>`
      }
      <button type="button" class="btn btn-danger" data-delete-owner="${o.id}">Eliminar…</button>
    </div>`;

  const body = $("#owner-drawer-body");
  const footer = $("#owner-drawer-footer");
  footer.querySelectorAll("[data-edit-owner]").forEach((btn) =>
    btn.addEventListener("click", () => {
      closeOwnerDrawer();
      startOwnerEdit(btn.dataset.editOwner);
    })
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
  body.querySelectorAll("[data-end-own]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      await api(`/api/ph/${currentPhId}/ownerships/${btn.dataset.endOwn}/end`, { method: "POST" });
      AppFeedback.success("La relación quedó en histórico.", { title: "Relación finalizada" });
      await showOwner(ownerId);
      await loadOwners();
    })
  );
  openOwnerDrawer();
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
      closeOwnerDrawer();
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
    await loadOwners();
    await showOwner(ownerId);
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

async function loadCoefficients() {
  if (!currentPhId) return;
  const c = await api(`/api/ph/${currentPhId}/coefficients`);
  $("#coeff-panel").innerHTML = `
    <p><strong>${Number(c.totalPercent).toFixed(4)}%</strong> / ${Number(c.expectedPercent).toFixed(4)}%</p>
    <p>${c.isComplete ? "✓ Coeficientes completos" : `⚠ Delta: ${Number(c.deltaPercent).toFixed(4)}%`}</p>
    <p>${escapeHtml(c.message)}</p>
    <p>${c.activeUnitCount} unidades activas</p>`;
}

async function loadReadiness() {
  if (!currentPhId) return;
  const r = await api(`/api/ph/${currentPhId}/readiness`);
  const bannerClass = r.readyForAssembly ? "is-ready" : "is-blocked";
  const bannerText = r.readyForAssembly ? "READY FOR ASSEMBLY" : "NO LISTO PARA ASAMBLEA";
  $("#readiness-panel").innerHTML = `
    <div class="readiness-banner ${bannerClass}" role="status">${bannerText}</div>
    <div class="row"><span>Información general</span><span>${r.generalInfoComplete ? "✓" : "○"}</span></div>
    <div class="row"><span>Unidades</span><span>${r.unitsComplete ? "✓" : "○"} ${r.unitCount}</span></div>
    <div class="row"><span>Propietarios</span><span>${r.ownersComplete ? "✓" : "○"} ${r.ownerCount}</span></div>
    <div class="row"><span>Coeficientes</span><span>${r.coefficients?.isComplete ? "✓" : "○"} ${Number(r.coefficients?.totalPercent || 0).toFixed(4)}%</span></div>
    <div class="row"><span>Usuarios invitados</span><span>${r.invitedUserCount}</span></div>
    <div class="row"><span>Configuración asamblea</span><span>${r.assemblyConfigComplete ? "✓" : "○"}</span></div>
    ${(r.blockingIssues || []).map((i) => `<p class="lede">${escapeHtml(i)}</p>`).join("")}`;
}

async function analyzeImport() {
  const file = $("#import-file").files?.[0];
  if (!file) {
    AppFeedback.warning("Selecciona un archivo CSV o XLSX.", { title: "Archivo requerido" });
    return;
  }
  await ensureAntiforgery();
  const fd = new FormData();
  fd.append("file", file);
  const token = await ensureAntiforgery();
  const response = await fetch(`/api/ph/${currentPhId}/import/analyze`, {
    method: "POST",
    credentials: "same-origin",
    headers: { RequestVerificationToken: token },
    body: fd
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.detail || "Error al analizar");
  }
  importSession = payload.sessionId;
  suggestedMappings = payload.suggestedMappings || [];
  const map = $("#import-map");
  map.hidden = false;
  map.innerHTML = SYSTEM_FIELDS.map(([field, label]) => {
    const suggested = suggestedMappings.find((m) => m.systemField === field)?.sourceColumn || "";
    const options = (payload.detectedColumns || [])
      .map((c) => `<option value="${escapeHtml(c)}" ${c === suggested ? "selected" : ""}>${escapeHtml(c)}</option>`)
      .join("");
    return `<div class="map-row"><span>${label}</span><select data-field="${field}"><option value="">—</option>${options}</select></div>`;
  }).join("");
  $("#import-actions").hidden = false;
  $("#import-preview").innerHTML = `<p>${payload.rowCount} filas detectadas. Mapea columnas y valida.</p>`;
}

function collectMappings() {
  return SYSTEM_FIELDS.map(([field]) => ({
    systemField: field,
    sourceColumn: $(`#import-map select[data-field="${field}"]`)?.value || null
  }));
}

async function validateImport() {
  const preview = await api(`/api/ph/${currentPhId}/import/validate`, {
    method: "POST",
    body: { sessionId: importSession, mappings: collectMappings() }
  });
  renderImportPreview(preview);
}

async function commitImport() {
  const result = await api(`/api/ph/${currentPhId}/import/commit`, {
    method: "POST",
    body: { sessionId: importSession, mappings: collectMappings() }
  });
  AppFeedback.success(
    `Unidades ${result.unitsCreated}, propietarios ${result.ownersCreated}, titularidades ${result.ownershipsCreated}.`,
    { title: "Importación completada" }
  );
  await Promise.all([loadUnits(), loadOwners(), loadCoefficients(), loadReadiness()]);
}

function renderImportPreview(preview) {
  const errLink = $("#btn-import-errors");
  errLink.hidden = preview.errorRows === 0;
  errLink.href = `/api/ph/${currentPhId}/import/${preview.sessionId}/errors`;
  $("#import-preview").innerHTML = `
    <p><strong>${preview.totalRows}</strong> filas · ${preview.validRows} válidas · ${preview.warningRows} advertencias · ${preview.errorRows} errores</p>
    <ul>${(preview.issues || [])
      .slice(0, 30)
      .map(
        (i) =>
          `<li>[${escapeHtml(i.severity)}] Fila ${i.rowNumber} · ${escapeHtml(i.field)}: ${escapeHtml(i.problem)}</li>`
      )
      .join("")}</ul>`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

init().catch((err) => AppFeedback.fromError(err));
