import { me } from "./auth.js";
import { initI18n, t } from "../i18n/i18n.js";
import { assemblyIdFromUrl, escapeHtml, formatDateTime, qs } from "./ui.js";
import { showPageError } from "./app-feedback.js";
import { getEvidence } from "./room-state.js";
import { bootIaPage } from "./ia-page.js";

const assemblyId = assemblyIdFromUrl();

function showError(message) {
  showPageError(message);
}

function pct(n) {
  return `${Number(n ?? 0).toFixed(2)}%`;
}

function renderEvidence(data) {
  const root = qs("#evidence-root");
  if (!data) {
    root.innerHTML = `<div class="empty-state">${escapeHtml(t("evidence.empty"))}</div>`;
    return;
  }

  const c = data.completeness || {};
  const timeline = data.timeline || [];

  root.innerHTML = `
    <header>
      <h2 style="margin-top:0">${escapeHtml(data.title || t("evidence.title"))}</h2>
      <p class="muted">${escapeHtml(data.propertyHorizontalName || "")} · ${escapeHtml(data.status || "")}</p>
      <p><span class="badge ${c.status === "COMPLETE" ? "badge-success" : "badge-warn"}">${escapeHtml(c.status || "—")}</span>
         <a class="btn btn-secondary" style="margin-left:0.5rem" href="/minutes.html?assemblyId=${assemblyId}">Acta</a></p>
      ${(c.notes || []).map((n) => `<p class="muted">• ${escapeHtml(n)}</p>`).join("")}
    </header>

    <section class="minutes-section">
      <h3>Asistencia</h3>
      <ul>${(data.attendance || []).map((p) => `<li>${escapeHtml(p.displayName)} · ${escapeHtml(p.unitCode || "—")} · ${pct(p.effectiveCoefficientPercent ?? p.coefficientPercent)} · acred. ${p.isAccredited ? "sí" : "no"}</li>`).join("") || "<li>—</li>"}</ul>
    </section>

    <section class="minutes-section">
      <h3>Representaciones</h3>
      <ul>${(data.representations || []).map((r) => `<li>${escapeHtml(r.unitCode)} · ${pct(r.coefficientSnapshot)} · ${escapeHtml(r.representativeDisplayName)} · ${escapeHtml(r.source)}${r.isActive ? "" : " (inactiva)"}</li>`).join("") || "<li class='muted'>Sin representaciones materializadas.</li>"}</ul>
    </section>

    <section class="minutes-section">
      <h3>Quórum (snapshots)</h3>
      <ul>${(data.quorumSnapshots || []).slice(0, 20).map((s) => `<li>${escapeHtml(formatDateTime(s.timestampUtc))} · ${pct(s.presentCoefficient)} / ${pct(s.requiredCoefficient)} · ${escapeHtml(s.status || "")}${s.reason ? ` · ${escapeHtml(s.reason)}` : ""}</li>`).join("") || "<li>—</li>"}</ul>
    </section>

    <section class="minutes-section">
      <h3>Decisiones</h3>
      <ul>${(data.decisions || []).map((d) => `<li><strong>${escapeHtml(d.decisionNumber)}</strong> ${escapeHtml(d.motionTitle)} → ${escapeHtml(d.decisionStatus)}</li>`).join("") || "<li class='muted'>Sin decisiones.</li>"}</ul>
    </section>

    <section class="minutes-section">
      <h3>Timeline operativo</h3>
      <ol class="agenda-list">${timeline
        .slice()
        .reverse()
        .slice(0, 80)
        .map(
          (e) =>
            `<li><strong>${escapeHtml(e.eventType)}</strong>
             <div class="muted">${escapeHtml(formatDateTime(e.occurredAtUtc))}</div></li>`
        )
        .join("") || "<li>—</li>"}</ol>
    </section>
  `;
}

async function init() {
  await initI18n();
  qs("#page-title").textContent = t("evidence.title");
  const linkDash = qs("#link-dashboard");
  if (linkDash) {
    linkDash.href = `/dashboard.html?assemblyId=${assemblyId}`;
    linkDash.textContent = t("back");
  }

  if (!assemblyId) {
    showError(t("dashboard.missingId"));
    return;
  }

  try {
    await me();
  } catch {
    location.href = "/";
    return;
  }

  await bootIaPage({ current: "asm-evidence", pageLabel: "Evidencias" });

  const result = await getEvidence(assemblyId);
  if (!result.ok) {
    showError(result.message || t("evidence.unavailable"));
    qs("#evidence-root").innerHTML = `<div class="empty-state">${escapeHtml(t("evidence.empty"))}</div>`;
    return;
  }

  renderEvidence(result.data);
}

init().catch((error) => {
  console.error(error);
  showError(error.message || t("networkError"));
});
