import { api } from "./api.js";
import { me } from "./auth.js";
import { initI18n, statusLabel, t } from "../i18n/i18n.js";
import {
  assemblyIdFromUrl,
  confirmDialog,
  escapeHtml,
  formatDateTime,
  qs,
  showToast
} from "./ui.js";
import {
  getDashboard,
  getReadiness,
  primaryCtaForStatus
} from "./room-state.js";
import { isOperator } from "./roles.js";

const assemblyId = assemblyIdFromUrl();

function showError(message) {
  const el = qs("#page-alert");
  if (!el) return;
  el.hidden = !message;
  el.textContent = message || "";
}

/** Presentation-only Spanish for known English API blocker strings. */
function formatBlockerDisplay(blocker) {
  const text = String(blocker ?? "");
  if (text.startsWith("Meeting: LiveKit")) {
    return "La sala de reunión (audio/video) no está lista. Verifique la configuración de la reunión.";
  }
  return text;
}

function readinessItemsFromDto(readiness) {
  if (!readiness) return [];
  if (Array.isArray(readiness.items) && readiness.items.length) return readiness.items;
  if (Array.isArray(readiness.checks) && readiness.checks.length) return readiness.checks;

  // Backend AssemblyReadinessDto shape (boolean flags + blockers).
  return [
    { label: t("dashboard.readyParticipants"), ready: Boolean(readiness.participantsReady) },
    { label: t("dashboard.readyCoefficients"), ready: Boolean(readiness.coefficientsReady) },
    { label: t("dashboard.readyAgenda"), ready: Boolean(readiness.agendaReady) },
    { label: t("dashboard.readyMeeting"), ready: Boolean(readiness.meetingReady) },
    { label: t("dashboard.readyVoting"), ready: Boolean(readiness.votingRulesReady) }
  ];
}

function renderReadiness(panel, readiness) {
  if (!readiness) {
    panel.innerHTML = `<div class="empty-state">${escapeHtml(t("dashboard.emptyReadiness"))}</div>`;
    return;
  }

  const items = readinessItemsFromDto(readiness);
  const allReady = Boolean(
    readiness.readyToStart ??
      readiness.ready ??
      readiness.isReady ??
      items.every((i) => Boolean(i.ready ?? (i.status === "READY" || i.status === "Ready")))
  );

  const blockers = Array.isArray(readiness.blockers) ? readiness.blockers : [];

  panel.innerHTML = `
    <div class="readiness" role="list">
      ${items
        .map((item) => {
          const ready = Boolean(item.ready ?? (item.status === "READY" || item.status === "Ready"));
          const label = item.label || item.name || item.code || "—";
          const statusText = ready ? "READY" : item.status || "PENDING";
          return `
            <div class="readiness-item" role="listitem" data-ready="${ready}">
              <span>${escapeHtml(label)}</span>
              <span class="badge ${ready ? "badge-success" : "badge-warn"}">${escapeHtml(statusText)}</span>
            </div>`;
        })
        .join("")}
    </div>
    ${
      blockers.length
        ? `<ul class="blocker-list" aria-label="${escapeHtml(t("dashboard.blockers"))}">${blockers
            .map((b) => `<li>${escapeHtml(formatBlockerDisplay(b))}</li>`)
            .join("")}</ul>`
        : ""
    }
    <div class="readiness-summary ${allReady ? "ready" : "blocked"}" role="status">
      ${escapeHtml(allReady ? t("dashboard.readyToStart") : t("dashboard.blocked"))}
    </div>
  `;
}

async function handlePrimaryCta(key, operator) {
  if (key === "prepare" || key === "startCheckin") {
    if (key === "startCheckin" && operator) {
      try {
        await api(`/api/assemblies/${assemblyId}/start-checkin`, { method: "POST" });
      } catch (error) {
        showToast(error.message, "warn");
      }
    }
    location.href = `/checkin.html?assemblyId=${assemblyId}`;
    return;
  }

  if (key === "start") {
    if (operator) {
      const ok = await confirmDialog({
        title: t("assembly.startAssembly"),
        body: t("assembly.confirmStart"),
        confirmLabel: t("confirm")
      });
      if (!ok) return;
      try {
        await api(`/api/assemblies/${assemblyId}/start`, { method: "POST" });
      } catch (error) {
        showToast(error.message, "warn");
      }
    }
    location.href = `/lobby.html?assemblyId=${assemblyId}`;
    return;
  }

  if (key === "continue") {
    location.href = `/lobby.html?assemblyId=${assemblyId}`;
    return;
  }

  if (key === "results") {
    location.href = `/minutes.html?assemblyId=${assemblyId}`;
  }
}

function renderPrimaryCta(status, operator) {
  const key = primaryCtaForStatus(status);
  const labels = {
    prepare: t("dashboard.ctaPrepare"),
    startCheckin: t("dashboard.ctaStartCheckin"),
    start: t("dashboard.ctaStart"),
    continue: t("dashboard.ctaContinue"),
    results: t("dashboard.ctaResults")
  };

  const primary = qs("#primary-cta");
  primary.innerHTML = `<button type="button" class="btn btn-primary" data-cta="${key}">${escapeHtml(labels[key])}</button>`;
  primary.querySelector("button")?.addEventListener("click", () => handlePrimaryCta(key, operator));
}

async function init() {
  await initI18n();

  if (!assemblyId) {
    showError(t("dashboard.missingId"));
    return;
  }

  let user;
  try {
    user = await me();
  } catch {
    location.href = "/";
    return;
  }

  qs("#user-chip").textContent = user.displayName;
  const tenantLabel = user.tenantCode || user.tenantName || "Gobernanza";
  const navTenant = qs("#nav-tenant");
  if (navTenant) navTenant.textContent = tenantLabel;

  const q = `assemblyId=${encodeURIComponent(assemblyId)}`;
  const navMap = {
    "#nav-comms": `/communications.html?${q}`,
    "#nav-convocation": `/convocation.html?${q}`,
    "#nav-checkin": `/checkin.html?${q}`,
    "#nav-lobby": `/lobby.html?${q}`,
    "#nav-assembly": `/assembly.html?${q}`,
    "#nav-evidence": `/evidence.html?${q}`,
    "#nav-minutes": `/minutes.html?${q}`
  };
  Object.entries(navMap).forEach(([sel, href]) => {
    const el = qs(sel);
    if (el) el.setAttribute("href", href);
  });
  const dashLink = document.querySelector('.app-nav a[href="/dashboard.html"]');
  if (dashLink) dashLink.href = `/dashboard.html?${q}`;

  qs("#btn-logout")?.addEventListener("click", async () => {
    const { logout } = await import("./auth.js");
    await logout();
    location.href = "/";
  });

  const operator = isOperator(user);
  let assembly = null;
  let readiness = null;

  const dash = await getDashboard(assemblyId);
  if (dash.ok && dash.data) {
    assembly = dash.data.assembly || dash.data;
    readiness = dash.data.readiness || null;
  } else {
    assembly = await api(`/api/assemblies/${assemblyId}`);
    if (dash.message) showToast(dash.message, "info");
  }

  if (!readiness) {
    const readyResult = await getReadiness(assemblyId);
    if (readyResult.ok) readiness = readyResult.data;
  }

  qs("#assembly-name").textContent =
    assembly.name || assembly.title || t("dashboard.title");
  qs("#assembly-meta").innerHTML = `
    <span><strong>${escapeHtml(t("dashboard.ph"))}:</strong> ${escapeHtml(assembly.propertyHorizontalName || "—")}</span>
    <span><strong>${escapeHtml(t("dashboard.date"))}:</strong> ${escapeHtml(formatDateTime(assembly.scheduledAtUtc))}</span>
    <span><strong>${escapeHtml(t("dashboard.mode"))}:</strong> ${escapeHtml(assembly.modality || "—")}</span>
    <span><strong>${escapeHtml(t("dashboard.status"))}:</strong> ${escapeHtml(statusLabel(assembly.status))}</span>
  `;

  qs("#readiness-heading").textContent = t("dashboard.readiness");
  renderReadiness(qs("#readiness-panel"), readiness);
  // Prefer server CTA when present; fall back to status mapping.
  const ctaFromServer = String(assembly.primaryCta || "")
    .replace("StartCheckIn", "startCheckin")
    .replace("StartAssembly", "start")
    .replace("ContinueAssembly", "continue")
    .replace("ViewResults", "results")
    .replace("Prepare", "prepare");
  if (["prepare", "startCheckin", "start", "continue", "results"].includes(ctaFromServer)) {
    const labels = {
      prepare: t("dashboard.ctaPrepare"),
      startCheckin: t("dashboard.ctaStartCheckin"),
      start: t("dashboard.ctaStart"),
      continue: t("dashboard.ctaContinue"),
      results: t("dashboard.ctaResults")
    };
    const primary = qs("#primary-cta");
    primary.innerHTML = `<button type="button" class="btn btn-primary" data-cta="${ctaFromServer}">${escapeHtml(labels[ctaFromServer])}</button>`;
    primary.querySelector("button")?.addEventListener("click", () =>
      handlePrimaryCta(ctaFromServer, operator)
    );
  } else {
    renderPrimaryCta(assembly.status, operator);
  }

  qs("#secondary-links").innerHTML = `
    <a class="btn btn-secondary" href="/calendar.html">Calendario</a>
    <a class="btn btn-secondary" href="/communications.html?assemblyId=${assemblyId}">Comunicaciones</a>
    <a class="btn btn-secondary" href="/convocation.html?assemblyId=${assemblyId}">Convocatoria</a>
    <a class="btn btn-secondary" href="/checkin.html?assemblyId=${assemblyId}">${escapeHtml(t("dashboard.linkCheckin"))}</a>
    <a class="btn btn-secondary" href="/lobby.html?assemblyId=${assemblyId}">${escapeHtml(t("dashboard.linkLobby"))}</a>
    <a class="btn btn-secondary" href="/minutes.html?assemblyId=${assemblyId}">${escapeHtml(t("dashboard.linkMinutes"))}</a>
    <a class="btn btn-secondary" href="/evidence.html?assemblyId=${assemblyId}">${escapeHtml(t("dashboard.linkEvidence"))}</a>
    <a class="btn btn-secondary" href="/expediente.html?assemblyId=${assemblyId}">Expediente</a>
    ${operator ? `<a class="btn btn-ghost" href="/projector.html?assemblyId=${assemblyId}" target="_blank" rel="noopener">${escapeHtml(t("dashboard.linkProjector"))}</a>` : ""}
  `;

  try {
    const next = await api("/api/calendar/next");
    const card = qs("#next-assembly-card");
    if (card) {
      const n = next?.next;
      if (!n) {
        card.innerHTML = `<p class="muted">No tienes Asambleas programadas próximamente.</p><a class="btn btn-ghost" href="/calendar.html">Abrir calendario</a>`;
      } else {
        const live = n.calendarStatus === "LIVE";
        card.innerHTML = `
          <p class="muted" style="margin:0">${live ? "● EN VIVO" : escapeHtml(n.countdownLabel || "")}</p>
          <strong>${escapeHtml(n.title)}</strong>
          <div class="muted">${escapeHtml(n.propertyHorizontalName)} · ${escapeHtml(n.modality)} · ${escapeHtml(formatDateTime(n.scheduledAtUtc))}</div>
          <div class="cta-row" style="margin-top:0.75rem">
            ${n.canJoin ? `<a class="btn btn-primary" href="/lobby.html?assemblyId=${n.assemblyId}">${live ? "Entrar ahora" : "Entrar"}</a>` : ""}
            <a class="btn btn-secondary" href="/dashboard.html?assemblyId=${n.assemblyId}">Ver</a>
            <a class="btn btn-ghost" href="/calendar.html">Calendario</a>
          </div>`;
      }
    }
  } catch {
    const card = qs("#next-assembly-card");
    if (card) card.innerHTML = `<a class="btn btn-ghost" href="/calendar.html">Abrir calendario</a>`;
  }
}

init().catch((error) => {
  console.error(error);
  showError(error.message || t("networkError"));
});
