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
import { mountIaShell, buildAssemblyBreadcrumbs } from "./ia-nav.js?v=flow6";
import { resolvePrimaryAction, statusLabelEs } from "./ia-actions.js?v=flow2";
import {
  renderReadinessCompact,
  renderNextAction,
  renderQuickLinks
} from "./readiness-workflow.js?v=flow3";
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
  return `<ul class="prep-notice__list">${blockers.map((check) => {
    const title = check.title || check.Title || "Requisito";
    const how = check.actionLabel || check.ActionLabel || "Resolver";
    const dest = check.destinationKey || check.DestinationKey;
    const canAct = Boolean(check.canAct ?? check.CanAct);
    const href = canAct && dest ? resolveDestination(dest, destCtx) : "";
    const action = href
      ? `<a href="${escapeHtml(href)}">${escapeHtml(title)}: ${escapeHtml(how)}</a>`
      : `<span>${escapeHtml(title)}: ${escapeHtml(how)}</span>`;
    return `<li>${action}</li>`;
  }).join("")}</ul>`;
}

function readCoeff(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function formatPct(value) {
  return `${Number(value).toLocaleString("es-PA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`;
}

function quorumFigures(assembly) {
  const present = readCoeff(
    assembly?.presentCoefficient ?? assembly?.PresentCoefficient ?? assembly?.currentCoefficient ?? assembly?.quorumCurrent
  );
  const required = readCoeff(assembly?.requiredQuorumPercent ?? assembly?.RequiredQuorumPercent);
  return { present, required };
}

function showPrimaryCtaError(error) {
  clearPageAlert();
  let el = qs("#primary-cta-error");
  const message = error?.message || "No se pudo completar la acción.";
  const code = String(error?.code || error?.payload?.code || error?.payload?.extensions?.code || "");
  const phId = currentAssembly?.propertyHorizontalId || "";
  const pending = code === "PREPARATION_INCOMPLETE" || /requisitos obligatorios/i.test(message);
  const brief = pending ? "Faltan requisitos para iniciar." : message;
  let links = pending ? preparationItemsHtml() : "";
  if (code === "COEFFICIENT_CONFIGURATION_INVALID" || /coeficientes/i.test(message)) {
    links += phId
      ? `<ul class="prep-notice__list"><li><a href="/ph.html?phId=${encodeURIComponent(phId)}#units">Corregir coeficientes</a></li></ul>`
      : "";
  }
  if (el && el.tagName !== "DIV") {
    const div = document.createElement("div");
    div.id = "primary-cta-error";
    el.replaceWith(div);
    el = div;
  }
  if (el) {
    el.hidden = false;
    el.className = "prep-notice field-error";
    el.tabIndex = -1;
    el.innerHTML = `<p class="prep-notice__lead">${escapeHtml(brief)}</p>${links}`;
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
    const figures = quorumFigures(currentAssembly);
    if (figures.present == null || figures.required == null) {
      showPrimaryCtaError({ message: "Consultando quórum…" });
      return;
    }
    const present = figures.present;
    const required = figures.required;
    if (required > 0 && present < required) {
      await confirmDialog({
        title: "No se puede constituir",
        body: `El quórum presente es ${formatPct(present)} y el mínimo es ${formatPct(required)}. Abrir la mesa no constituye la asamblea. No hay una excepción de quórum configurada.`,
        confirmLabel: "Entendido"
      });
      return;
    }
    const ok = await confirmDialog({
      title: "Iniciar asamblea",
      body: `El quórum presente es ${formatPct(present)} y el mínimo es ${formatPct(required)}. ¿Constituir formalmente la asamblea?`,
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
  if (!assembly) return { value: "Consultando quórum…", hint: "" };
  if (assembly.status === "Completed") {
    return { value: formatClosedQuorum(assembly), hint: "Quórum registrado al cierre" };
  }
  const figures = quorumFigures(assembly);
  if (figures.present == null || figures.required == null) {
    return { value: "Consultando quórum…", hint: figures.required == null ? "" : `Mínimo ${formatPct(figures.required)}` };
  }
  const hint = figures.present === 0
    ? `Nadie presente cuenta. Mínimo ${formatPct(figures.required)}`
    : `Mínimo ${formatPct(figures.required)}`;
  return { value: formatPct(figures.present), hint };
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
  const accreditedCount = c.ownerAccredited ?? c.OwnerAccredited;
  const deskPresent = c.deskPresent ?? c.DeskPresent;
  const motionsValue = c.motions ?? c.Motions;
  const figure = (value) => (value == null ? "—" : String(value));
  qs("#assembly-stat-strip").innerHTML = `
    <div class="ia-stat"><div class="ia-stat__value">${prepTotal ? `${prepDone}/${prepTotal}` : "—"}</div><div class="ia-stat__label">Preparación</div></div>
    <div class="ia-stat"><div class="ia-stat__value">${figure(ownerCount)}</div><div class="ia-stat__label">Propietarios convocados</div></div>
    <div class="ia-stat"><div class="ia-stat__value">${figure(accreditedCount)}</div><div class="ia-stat__label">Propietarios acreditados</div></div>
    <div class="ia-stat"><div class="ia-stat__value">${figure(deskCount)}</div><div class="ia-stat__label">Personal de mesa inscrito</div>${deskPresent == null ? "" : `<div class="ia-stat__hint">Mesa presente: ${deskPresent}</div>`}</div>
    <div class="ia-stat ia-stat--quorum"><div class="ia-stat__value">${escapeHtml(quorumStat.value)}</div><div class="ia-stat__label">Quórum</div>${quorumStat.hint ? `<div class="ia-stat__hint">${escapeHtml(quorumStat.hint)}</div>` : ""}</div>
    <div class="ia-stat"><div class="ia-stat__value">${figure(motionsValue)}</div><div class="ia-stat__label">Votaciones</div></div>
    <p class="ia-stat-help">La mesa inscrita no aporta coeficiente. Solo los propietarios acreditados cuentan para el quórum.</p>`;

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

  if (assembly && (readCoeff(assembly.presentCoefficient ?? assembly.PresentCoefficient) == null
    || readCoeff(assembly.requiredQuorumPercent ?? assembly.RequiredQuorumPercent) == null)) {
    try {
      const q = await api(`/api/assemblies/${assemblyId}/quorum`);
      const present = q?.currentCoefficient ?? q?.CurrentCoefficient;
      const required = q?.requiredCoefficient ?? q?.RequiredCoefficient;
      assembly = {
        ...assembly,
        presentCoefficient: readCoeff(assembly.presentCoefficient ?? assembly.PresentCoefficient) ?? present,
        requiredQuorumPercent: readCoeff(assembly.requiredQuorumPercent ?? assembly.RequiredQuorumPercent) ?? required
      };
    } catch {
      /* El aviso queda en «Consultando quórum…» hasta que llegue una cifra real. */
    }
  }

  try {
    const rows = await api(`/api/assemblies/${assemblyId}/convocations`);
    const list = Array.isArray(rows) ? rows : [];
    const current = [...list].sort((a, b) => (b.version || 0) - (a.version || 0))[0];
    if (current?.status) assembly = { ...assembly, convocationStatus: current.status };
  } catch {
    /* El resumen sigue disponible si la convocatoria no se puede consultar. */
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
            const present = q.currentCoefficient ?? q.CurrentCoefficient;
            const required = q.requiredCoefficient ?? q.RequiredCoefficient;
            currentAssembly = {
              ...currentAssembly,
              currentCoefficient: present ?? currentAssembly.currentCoefficient,
              presentCoefficient: present ?? currentAssembly.presentCoefficient,
              requiredQuorumPercent: required ?? currentAssembly.requiredQuorumPercent
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