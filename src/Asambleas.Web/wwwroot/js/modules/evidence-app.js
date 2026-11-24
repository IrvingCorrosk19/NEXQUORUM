import { me } from "./auth.js";
import { initI18n, t } from "../i18n/i18n.js?v=labels-es1";
import { assemblyIdFromUrl, escapeHtml, formatDateTime, qs } from "./ui.js";
import { showPageError } from "./app-feedback.js";
import { getEvidence } from "./room-state.js";
import { bootIaPage } from "./ia-page.js?v=tabs2";
import { assemblyLabel, documentaryLabel, motionFactLabel, quorumTimelineText } from "./assembly-labels.js";

const assemblyId = assemblyIdFromUrl();

function showError(message) {
  showPageError(message);
}

function pct(n) {
  return `${Number(n ?? 0).toFixed(2)}%`;
}

function timelineLabel(event) {
  const meta = String(event?.metadataJson || "");
  if (event?.eventType === "MINUTES_SEALED") return "Acta sellada";
  if (event?.eventType === "ASSEMBLY_COMPLETED" && /sealed/i.test(meta) && /true/i.test(meta)) return "Acta sellada";
  return assemblyLabel(event?.eventType);
}

function documentState(c, assemblyStatus, isSealed) {
  return documentaryLabel({
    assemblyStatus,
    isSealed,
    minutesSealed: c?.minutesSealed === true,
    completenessStatus: c?.status
  });
}

function evidenceBadgeClass(tone) {
  if (tone === "success") return "bg-success";
  if (tone === "warning") return "bg-warning text-dark";
  if (tone === "error") return "bg-danger";
  return "bg-blue-lt";
}

function renderEvidence(data) {
  const root = qs("#evidence-root");
  if (!data) {
    root.innerHTML = `<div class="empty-state">${escapeHtml(t("evidence.empty"))}</div>`;
    return;
  }

  const c = data.completeness || {};
  const timeline = data.timeline || [];
  const state = documentState(c, data.status, data.isSealed === true);
  const motionRows = (data.voting || []).map((entry) => {
    const motion = entry.motion || entry;
    const fact = motionFactLabel(motion, entry.closedSession || entry.session);
    return `<li>${escapeHtml(motion.code || "")} — ${escapeHtml(motion.title || "")}. ${escapeHtml(fact.group)}: ${escapeHtml(fact.sentence)}</li>`;
  }).join("");

  const table = (heads, rows) => `
    <div class="table-responsive"><table class="table table-sm card-table">
      <thead><tr>${heads.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead>
      <tbody>${rows || `<tr><td colspan="${heads.length}">Sin registros</td></tr>`}</tbody>
    </table></div>`;
  root.innerHTML = `
    <div class="card-body">
      <h2 class="card-title">${escapeHtml(data.title || t("evidence.title"))}</h2>
      <p class="text-secondary">${escapeHtml(data.propertyHorizontalName || "")} · ${escapeHtml(assemblyLabel(data.status))}</p>
      <p><span class="badge ${evidenceBadgeClass(state.tone)}">${escapeHtml(state.label)}</span>
         <a class="btn btn-secondary ms-2" href="/minutes.html?assemblyId=${assemblyId}">Acta</a></p>
      <p class="text-secondary">${escapeHtml(state.detail)}</p>
      ${(c.notes || []).map((n) => `<p class="text-secondary">• ${escapeHtml(n)}</p>`).join("")}
      <details class="mt-3" open><summary>Asistencia</summary>
        ${table(["Nombre", "Unidad", "Coeficiente", "Estado"], (data.attendance || []).map((p) => `<tr><td>${escapeHtml(p.displayName)}</td><td>${escapeHtml(p.unitCode || "—")}</td><td>Unidad ${pct(p.coefficientPercent)}<br><span class="text-secondary">Efectivo ${pct(p.effectiveCoefficientPercent)}</span></td><td>${escapeHtml(assemblyLabel(p.attendanceStatus))}</td></tr>`).join(""))}
      </details>
      <details class="mt-2"><summary>Representaciones</summary>
        ${table(["Unidad", "Coeficiente", "Representante", "Origen"], (data.representations || []).map((r) => `<tr><td>${escapeHtml(r.unitCode)}</td><td>${pct(r.coefficientSnapshot)}</td><td>${escapeHtml(r.representativeDisplayName)}</td><td>${escapeHtml(assemblyLabel(r.source))}${r.isActive ? "" : " (inactiva)"}</td></tr>`).join(""))}
      </details>
      <details class="mt-2"><summary>Quórum</summary>
        ${table(["Fecha", "Presente", "Requerido", "Estado"], (data.quorumSnapshots || []).slice(0, 20).map((s) => `<tr><td>${escapeHtml(formatDateTime(s.timestampUtc))}</td><td>${pct(s.presentCoefficient)}</td><td>${pct(s.requiredCoefficient)}</td><td>${escapeHtml(quorumTimelineText(s.status, s.reason) || "—")}</td></tr>`).join(""))}
      </details>

      <details class="mt-2" open><summary>Mociones y votaciones</summary>
        <ul class="list-unstyled">${motionRows || "<li class='text-secondary'>Sin mociones registradas.</li>"}</ul>
      </details>
      <details class="mt-2"><summary>Documentos y decisiones</summary>
        <ul class="list-unstyled">${(data.decisions || []).map((d) => `<li><strong>${escapeHtml(d.decisionNumber)}</strong> ${escapeHtml(d.motionTitle)} → ${escapeHtml(d.explanation || assemblyLabel(d.decisionStatus))}</li>`).join("") || "<li class='text-secondary'>Sin decisiones.</li>"}</ul>
      </details>
      <details class="mt-2"><summary>Línea de tiempo</summary>
        <ol>${timeline.slice().reverse().slice(0, 80).map((e) => `<li><strong>${escapeHtml(timelineLabel(e))}</strong> <span class="text-secondary">${escapeHtml(formatDateTime(e.occurredAtUtc))}</span></li>`).join("") || "<li>—</li>"}</ol>
      </details>
    </div>
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
