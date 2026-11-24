import { hasPermission, logout, me } from "./auth.js";
import { isOperator, isOwnerPortalUser } from "./roles.js";
import { initI18n, t } from "../i18n/i18n.js?v=labels-es1";
import {
  assemblyIdFromUrl,
  confirmDialog,
  escapeHtml,
  formatDateTime,
  qs,
  showToast
} from "./ui.js";
import { showPageError } from "./app-feedback.js";
import { resolveDestination } from "./return-context.js";
import { getDashboard, getReadiness } from "./room-state.js";
import { ensureAssemblyIdInUrl } from "./assembly-context.js";
import { api } from "./api.js";
import { mountIaShell, buildAssemblyBreadcrumbs } from "./ia-nav.js?v=gov1";
import { resolvePrimaryAction, statusLabelEs } from "./ia-actions.js";
import {
  renderReadinessCompact,
  renderNextAction,
  renderQuickLinks
} from "./readiness-workflow.js?v=open-desk1";
import { writeIaContext } from "./ia-context.js";
import { historicalOverviewUrl, isTerminalStatus, renderHistoricalBanner } from "./assembly-lifecycle.js";
import { startHybridShell, softNavigate } from "./hybrid-router.js?v=gov1";

let assemblyId = assemblyIdFromUrl();
let currentUser = null;
let currentAssembly = null;
let isOperatorSession = false;
let lastReadiness = null;

function showError(message) {
  showPageError(message, "error");
}

function clearPageAlert() {
  const page = qs("#page-alert");
  if (!page) return;
  page.hidden = true;
  page.textContent = "";
}

function preparationItemsHtml() {
  const checks = lastReadiness?.checks || lastReadiness?.Checks || [];
  const blockers = checks.filter((check) => {
    const severity = String(check.severity || check.Severity || "");
    const status = String(check.status || check.Status || "");
    return severity === "Blocking" && status !== "Ready";
  });
  if (!blockers.length) return "";
  const destCtx = { assemblyId, phId: currentAssembly?.propertyHorizontalId || "" };
  return `<ul>${blockers.map((check) => {
    const title = check.title || check.Title || "Requisito";
    const how = check.actionLabel || check.ActionLabel || "Resolver";
    const dest = check.destinationKey || check.DestinationKey;
    const canAct = Boolean(check.canAct ?? check.CanAct);
    const href = canAct && dest ? resolveDestination(dest, destCtx) : "";
    const action = href
      ? `<a href="${escapeHtml(href)}">${escapeHtml(how)}</a>`
      : escapeHtml(how);
    return `<li>${escapeHtml(title)}. ${action}.</li>`;
  }).join("")}</ul>`;
}

function showPrimaryCtaError(error) {
  clearPageAlert();
  const el = qs("#primary-cta-error");
  const message = error?.message || "No se pudo completar la acción.";
  const code = String(error?.code || error?.payload?.code || error?.payload?.extensions?.code || "");
  const phId = currentAssembly?.propertyHorizontalId || "";
  let extra = "";
  if (code === "COEFFICIENT_CONFIGURATION_INVALID" || /coeficientes/i.test(message)) {
    extra = phId
      ? ` <a href="/ph.html?phId=${encodeURIComponent(phId)}#units">Corregir coeficientes</a>`
      : "";
  }
  const pending = code === "PREPARATION_INCOMPLETE" || /requisitos obligatorios/i.test(message)
    ? preparationItemsHtml()
    : "";
  if (el) {
    el.hidden = false;
    el.tabIndex = -1;
    el.innerHTML = `<span>${escapeHtml(message)}</span>${extra}${pending}`;
    qs(".ia-primary-action__pending")?.setAttribute("hidden", "");
    el.focus();
  }
}

async function runPrimaryAction(action, operator) {
  if (!action) return;
  if (action.needsPost === "start-checkin" && operator) {
    const btn = qs("[data-open-desk]");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Abriendo mesa…";
    }
    try {
      const updated = await api(`/api/assemblies/${assemblyId}/start-checkin`, { method: "POST" });
      currentAssembly = {
        ...(currentAssembly || {}),
        ...(updated || {}),
        status: updated?.status || "CheckIn"
      };
      await refreshDashboard(currentUser, currentAssembly, operator);
      showToast("Mesa abierta. Los convocados ya pueden entrar.", "success");
      return;
    } catch (error) {
      showPrimaryCtaError(error);
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Abrir mesa";
      }
      return;
    }
  }
  if (action.needsPost === "start" && operator) {
    const presentKnown = currentAssembly?.currentCoefficient != null || currentAssembly?.quorumCurrent != null;
    const present = Number(currentAssembly?.currentCoefficient ?? currentAssembly?.quorumCurrent ?? 0);
    const required = Number(currentAssembly?.requiredQuorumPercent ?? 0);
    if (presentKnown && Number.isFinite(required) && required > 0 && (!Number.isFinite(present) || present < required)) {
      await confirmDialog({
        title: "No se puede constituir",
        body: `El quórum presente es ${Number.isFinite(present) ? present.toFixed(2) : "0.00"}% y el mínimo es ${required.toFixed(2)}%. Abrir la mesa no constituye la asamblea. No hay una excepción de quórum configurada.`,
        confirmLabel: "Entendido"
      });
      return;
    }
    const ok = await confirmDialog({
      title: "Iniciar asamblea",
      body: `El quórum presente es ${Number.isFinite(present) ? present.toFixed(2) : "0.00"}% y el mínimo es ${required.toFixed(2)}%. ¿Constituir formalmente la asamblea?`,
      confirmLabel: "Iniciar asamblea"
    });
    if (!ok) return;
    try {
      await api(`/api/assemblies/${assemblyId}/start`, { method: "POST" });
    } catch (error) {
      showPrimaryCtaError(error);
      return;
    }
  }
  if (action.href) {
    const href = action.href;
    if (/\/(dashboard|ph|agenda|checkin|voting-studio|owner)\.html/i.test(href)) {
      softNavigate(href).catch(() => {
        location.href = href;
      });
    } else {
      location.href = href;
    }
  }
}

async function loadReadinessData() {
  const readyResult = await getReadiness(assemblyId);
  if (readyResult.ok) return readyResult.data;
  return null;
}

function describeQuorumStat(assembly) {
  if (!assembly) return { value: "Cargando", hint: "Consultando el quórum" };
  if (assembly.status === "Completed") {
    return { value: formatClosedQuorum(assembly), hint: "Quórum registrado al cierre" };
  }
  const raw = assembly.currentCoefficient ?? assembly.quorumCurrent ?? assembly.quorum?.currentCoefficient;
  if (raw == null || raw === "") {
    return { value: "No disponible", hint: "Se calcula cuando hay presencia registrada" };
  }
  const n = Number(raw);
  if (!Number.isFinite(n)) return { value: "No disponible", hint: "El cálculo de quórum no es válido" };
  if (n === 0) return { value: "0%", hint: "Cero: nadie presente cuenta para el quórum" };
  return { value: `${n.toLocaleString("es-PA", { maximumFractionDigits: 2 })}%`, hint: "Coeficiente presente" };
}

function formatClosedQuorum(assembly) {
  const opening = assembly.quorumOpening ?? assembly.QuorumOpening;
  const maximum = assembly.quorumMaximum ?? assembly.QuorumMaximum;
  const closing = assembly.quorumClosing ?? assembly.QuorumClosing;
  const numbers = [opening, maximum, closing].map((value) => Number(value));
  if (numbers.some((value) => !Number.isFinite(value))) return "No disponible";
  const pct = (value) => `${value.toFixed(2)}%`;
  return `${pct(numbers[0])} Apertura · ${pct(numbers[1])} Máximo · ${pct(numbers[2])} Cierre`;
}

function paintDashboard(user, assembly, readiness, operator, counts = null) {
  currentUser = user;
  currentAssembly = assembly;
  isOperatorSession = operator;
  const phId = assembly.propertyHorizontalId;
  const phName = assembly.propertyHorizontalName || "PH";
  const title = assembly.name || assembly.title || t("dashboard.title");
  const ctx = { assemblyId, phId };

  const bannerHost = qs("#historical-banner") || qs("#page-alert");
  if (bannerHost && isTerminalStatus(assembly.status)) {
    bannerHost.hidden = false;
    bannerHost.classList.toggle("ia-historical-banner--cancelled", assembly.status === "Cancelled");
    bannerHost.setAttribute("data-testid", "historical-banner");
    bannerHost.innerHTML = renderHistoricalBanner(assembly.status, {
      cancelReason: assembly.cancelReason ? escapeHtml(assembly.cancelReason) : ""
    });
    document.body.dataset.assemblyMode = "historical";
  } else if (bannerHost) {
    bannerHost.hidden = true;
    bannerHost.classList.remove("ia-historical-banner--cancelled");
    bannerHost.innerHTML = "";
  }

  renderReadinessCompact(qs("#readiness-panel"), readiness, ctx);
  renderNextAction(qs("#primary-cta"), readiness, assembly, { assemblyId, operator }, (action) =>
    runPrimaryAction(action, operator)
  );
  renderQuickLinks(qs("#secondary-links"), user, assemblyId, assembly);

  const hero = qs("#assembly-ops-hero") || qs(".page-hero.page-hero--compact");
  if (hero) {
    hero.dataset.status = assembly.status || "";
    let phLine = hero.querySelector(".dashboard-hero-ph");
    if (!phLine) {
      phLine = document.createElement("p");
      phLine.className = "dashboard-hero-ph command-eyebrow";
      hero.insertBefore(phLine, hero.firstChild);
    }
    phLine.innerHTML = `PH activo · <a href="/ph.html?phId=${encodeURIComponent(phId || "")}#assemblies">${escapeHtml(phName)}</a>`;
  }

  qs("#assembly-name").textContent = title;
  const badge = qs("#assembly-status-badge");
  badge.hidden = false;
  badge.textContent = statusLabelEs(assembly.status || "");
  badge.classList.toggle("is-live", ["InProgress", "Paused", "CheckIn"].includes(assembly.status));
  badge.classList.toggle("is-ready", assembly.status === "Scheduled");

  qs("#assembly-meta").innerHTML = `
    <span>${escapeHtml(formatDateTime(assembly.scheduledAtUtc))}</span>
    <span>${escapeHtml(assembly.modality || "—")}</span>
    <span>${escapeHtml(statusLabelEs(assembly.status || ""))}</span>`;

  lastReadiness = readiness;
  const c = counts || assembly.counts || {};
  const prepDone = readiness?.completedChecks ?? 0;
  const prepTotal = readiness?.totalChecks ?? 0;
  const quorumStat = describeQuorumStat(assembly);
  const ownerCount = c.ownerParticipants ?? c.OwnerParticipants;
  const deskCount = c.deskStaff ?? c.DeskStaff;
  const participantsValue = ownerCount ?? c.participants ?? c.Participants;
  const deskHint = `Personal de mesa: ${Number(deskCount) || 0}. No cuenta como convocado.`;
  const motionsValue = c.motions ?? c.Motions;
  qs("#assembly-stat-strip").innerHTML = `
    <div class="ia-stat"><div class="ia-stat__value">${prepTotal ? `${prepDone}/${prepTotal}` : "No disponible"}</div><div class="ia-stat__label">Preparación</div><div class="ia-stat__hint">${prepTotal ? "Requisitos completados" : "La preparación no llegó en este resumen"}</div></div>
    <div class="ia-stat"><div class="ia-stat__value">${participantsValue == null ? "No disponible" : String(participantsValue)}</div><div class="ia-stat__label">Propietarios convocados</div><div class="ia-stat__hint">${participantsValue == null ? "Sin conteo en este resumen" : participantsValue === 0 ? `Cero propietarios convocados. ${deskHint}` : deskHint}</div></div>
    <div class="ia-stat ia-stat--quorum"><div class="ia-stat__value">${escapeHtml(quorumStat.value)}</div><div class="ia-stat__label">Quórum</div><div class="ia-stat__hint">${escapeHtml(quorumStat.hint)}</div></div>
    <div class="ia-stat"><div class="ia-stat__value">${motionsValue == null ? "No disponible" : String(motionsValue)}</div><div class="ia-stat__label">Votaciones</div><div class="ia-stat__hint">${motionsValue === 0 ? "Ninguna votación creada" : "Votaciones de la asamblea"}</div></div>`;

  writeIaContext({ phId, phName, assemblyId, assemblyTitle: title, assemblyStatus: assembly.status || "" });

  mountIaShell(
    {
      level: "assembly",
      user,
      phId,
      phName,
      assemblyId,
      assemblyTitle: title,
      assemblyStatus: assembly.status || "",
      current: location.hash === "#readiness" ? "asm-readiness" : "asm-overview"
    },
    {
      breadcrumbs: buildAssemblyBreadcrumbs({ phId, phName, assemblyId, assemblyTitle: title })
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
  isOperatorSession = operator;
  currentUser = user;
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

  paintDashboard(user, assembly, readiness, operator, dash.ok ? dash.data?.counts : null);

  try {
    const { ensureJoinSummonPresence } = await import("./join-summon-presence.js");
    await ensureJoinSummonPresence({
      user,
      handlers: {
        assemblyStatusChanged: async (asm) => {
          if (!asm) return;
          const nextStatus = asm.status || asm.Status;
          currentAssembly = {
            ...(currentAssembly || assembly || {}),
            ...asm,
            status: nextStatus || currentAssembly?.status
          };
          await refreshDashboard(user, currentAssembly, operator);
        },
        participantUpdated: async () => {
          await refreshDashboard(user, currentAssembly || assembly, operator);
        },
        quorumUpdated: async (payload) => {
          const q = payload?.quorum || payload;
          if (q && currentAssembly) {
            currentAssembly = {
              ...currentAssembly,
              currentCoefficient: q.currentCoefficient ?? q.CurrentCoefficient ?? currentAssembly.currentCoefficient
            };
          }
          await refreshDashboard(user, currentAssembly || assembly, operator);
        }
      }
    });
  } catch (err) {
    console.warn("Dashboard SignalR unavailable", err);
  }

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
  const { stopJoinSummonPresence } = await import("./join-summon-presence.js");
  await stopJoinSummonPresence();
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