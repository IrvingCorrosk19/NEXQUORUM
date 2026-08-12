import { hasPermission, logout, me } from "./auth.js";
import { isOperator, isOwnerPortalUser } from "./roles.js";
import { initI18n, t } from "../i18n/i18n.js";
import {
  assemblyIdFromUrl,
  confirmDialog,
  escapeHtml,
  formatDateTime,
  qs,
  showToast
} from "./ui.js";
import { getDashboard, getReadiness } from "./room-state.js";
import { ensureAssemblyIdInUrl } from "./assembly-context.js";
import { api } from "./api.js";
import { mountIaShell, phHref } from "./ia-nav.js";
import { resolvePrimaryAction, statusLabelEs } from "./ia-actions.js";
import {
  renderReadinessPanel,
  renderNextAction,
  renderWorkspaceGroups
} from "./readiness-workflow.js";

let assemblyId = assemblyIdFromUrl();

function showError(message) {
  const el = qs("#page-alert");
  if (!el) return;
  el.hidden = !message;
  el.textContent = message || "";
}

async function runPrimaryAction(action, operator) {
  if (!action) return;
  if (action.needsPost === "start-checkin" && operator) {
    try {
      await api(`/api/assemblies/${assemblyId}/start-checkin`, { method: "POST" });
    } catch (error) {
      showToast(error.message, "warn");
      return;
    }
  }
  if (action.needsPost === "start" && operator) {
    const ok = await confirmDialog({
      title: "Iniciar asamblea",
      body: "¿Constituir formalmente la asamblea e ingresar a la sala?",
      confirmLabel: "Iniciar asamblea"
    });
    if (!ok) return;
    try {
      await api(`/api/assemblies/${assemblyId}/start`, { method: "POST" });
    } catch (error) {
      showToast(error.message, "warn");
      return;
    }
  }
  location.href = action.href;
}

async function loadReadinessData() {
  const readyResult = await getReadiness(assemblyId);
  if (readyResult.ok) return readyResult.data;
  return null;
}

function paintDashboard(user, assembly, readiness, operator) {
  const phId = assembly.propertyHorizontalId;
  const phName = assembly.propertyHorizontalName || "PH";
  const title = assembly.name || assembly.title || t("dashboard.title");
  const ctx = { assemblyId, phId };

  renderReadinessPanel(qs("#readiness-panel"), readiness, ctx);
  renderNextAction(qs("#primary-cta"), readiness, assembly, { assemblyId, operator }, (action) =>
    runPrimaryAction(action, operator)
  );
  renderWorkspaceGroups(qs("#secondary-links"), user, assemblyId);

  qs("#assembly-name").textContent = title;
  const badge = qs("#assembly-status-badge");
  badge.hidden = false;
  badge.textContent = statusLabelEs(assembly.status || "");
  badge.classList.toggle("is-live", ["InProgress", "Paused", "CheckIn"].includes(assembly.status));
  badge.classList.toggle("is-ready", assembly.status === "Scheduled");

  qs("#assembly-meta").innerHTML = `
    <span><strong>PH:</strong> ${escapeHtml(phName)}</span>
    <span><strong>Fecha:</strong> ${escapeHtml(formatDateTime(assembly.scheduledAtUtc))}</span>
    <span><strong>Modalidad:</strong> ${escapeHtml(assembly.modality || "—")}</span>`;

  mountIaShell(
    {
      level: "assembly",
      user,
      phId,
      phName,
      assemblyId,
      assemblyTitle: title,
      current: "asm-overview"
    },
    {
      breadcrumbs: [
        { label: "Propiedades", href: "/ph.html" },
        { label: phName, href: phId ? phHref(phId, "resumen") : "/ph.html" },
        { label: "Asambleas", href: phId ? phHref(phId, "assemblies") : "/calendar.html" },
        { label: title }
      ]
    }
  );
}

async function refreshDashboard(user, assembly, operator) {
  const readiness = await loadReadinessData();
  if (readiness) {
    paintDashboard(user, assembly, readiness, operator);
  }
}

async function init() {
  await initI18n();

  let user;
  try {
    user = await me();
  } catch {
    location.href = "/";
    return;
  }

  if (isOwnerPortalUser(user) && !assemblyId) {
    location.href = "/owner.html";
    return;
  }

  qs("#user-chip").textContent = user.displayName;
  const navTenant = qs("#nav-tenant");
  if (navTenant) navTenant.textContent = user.tenantCode || user.tenantName || "Gobernanza";

  qs("#btn-logout")?.addEventListener("click", async () => {
    await logout();
    location.href = "/";
  });

  if (!assemblyId) {
    location.replace(hasPermission(user, "ph:view") || isOperator(user) ? "/ph.html" : "/owner.html");
    return;
  }

  if (ensureAssemblyIdInUrl(assemblyId, { hard: true })) return;

  const operator = isOperator(user);
  let assembly = null;
  let readiness = null;

  const dash = await getDashboard(assemblyId);
  if (dash.ok && dash.data) {
    assembly = dash.data;
    readiness = dash.data.readiness || null;
    assembly = {
      ...assembly,
      title: assembly.name,
      propertyHorizontalId: assembly.propertyHorizontalId,
      propertyHorizontalName: assembly.propertyHorizontalName
    };
  } else {
    assembly = await api(`/api/assemblies/${assemblyId}`);
    if (dash.message) showToast(dash.message, "info");
  }

  if (!readiness) {
    readiness = await loadReadinessData();
  }

  paintDashboard(user, assembly, readiness, operator);

  const params = new URLSearchParams(location.search);
  if (params.get("refresh") === "1") {
    history.replaceState({}, "", `/dashboard.html?assemblyId=${encodeURIComponent(assemblyId)}`);
    await refreshDashboard(user, assembly, operator);
    showToast("Preparación actualizada", "success");
  }

  window.addEventListener("pageshow", (ev) => {
    if (ev.persisted) {
      refreshDashboard(user, assembly, operator);
    }
  });
}

init().catch((error) => {
  console.error(error);
  showError(error.message || t("networkError"));
});
