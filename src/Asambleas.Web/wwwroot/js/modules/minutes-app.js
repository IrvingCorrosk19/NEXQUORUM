import { me } from "./auth.js";
import { initI18n, t } from "../i18n/i18n.js";
import { assemblyIdFromUrl, escapeHtml, formatDateTime, qs } from "./ui.js";
import { getMinutes } from "./room-state.js";
import { bootIaPage } from "./ia-page.js";

const assemblyId = assemblyIdFromUrl();

function showError(message) {
  const el = qs("#page-alert");
  if (!el) return;
  el.hidden = !message;
  el.textContent = message || "";
}

function pct(n) {
  return `${Number(n ?? 0).toFixed(2)}%`;
}

function renderMinutes(data) {
  const root = qs("#minutes-root");
  if (!data) {
    root.innerHTML = `<div class="empty-state">${escapeHtml(t("minutes.empty"))}</div>`;
    return;
  }

  const c = data.completeness || {};
  const attendance = data.attendance || [];
  const reps = data.representations || [];
  const agenda = data.agenda || [];
  const decisions = data.decisions || [];
  const motions = data.motions || [];
  const interventions = data.interventions || [];
  const q = data.quorum;

  root.innerHTML = `
    <header class="minutes-header">
      <p class="brand">ASAMBLEAS</p>
      <h2>${escapeHtml(data.title || t("minutes.title"))}</h2>
      <p class="muted">${escapeHtml(data.propertyHorizontalName || "")}</p>
      <p class="muted">${escapeHtml(formatDateTime(data.scheduledAtUtc))} · ${escapeHtml(data.modality || "")} · ${escapeHtml(data.status || "")}</p>
      <p class="muted">Doc: ${escapeHtml(data.documentId || "—")}${data.contentHash ? ` · SHA-256: ${escapeHtml(data.contentHash.slice(0, 16))}…` : ""}</p>
      <p><span class="badge ${c.status === "COMPLETE" ? "badge-success" : "badge-warn"}">${escapeHtml(c.status || "—")}</span></p>
    </header>

    <nav class="minutes-outline" aria-label="Secciones">
      <a href="#sec-attendance">Asistencia</a>
      <a href="#sec-quorum">Quórum</a>
      <a href="#sec-agenda">Agenda</a>
      <a href="#sec-motions">Mociones</a>
      <a href="#sec-decisions">Decisiones</a>
      <a href="#sec-closure">Cierre</a>
    </nav>

    <section id="sec-attendance" class="minutes-section">
      <h3>Asistencia y representación</h3>
      <p class="muted">${attendance.length} participantes acreditados/presentes</p>
      <ul>${attendance.map((p) => `<li><strong>${escapeHtml(p.displayName)}</strong> · ${escapeHtml(p.unitCode || "—")} · ${pct(p.effectiveCoefficientPercent ?? p.coefficientPercent)} · ${escapeHtml(p.attendanceStatus || "")}</li>`).join("") || "<li>—</li>"}</ul>
      ${
        reps.length
          ? `<h4>Representaciones efectivas</h4><ul>${reps
              .map(
                (r) =>
                  `<li>${escapeHtml(r.unitCode)} · ${pct(r.coefficientSnapshot)} · ${escapeHtml(r.representativeDisplayName)} (${escapeHtml(r.source)})</li>`
              )
              .join("")}</ul>`
          : ""
      }
    </section>

    <section id="sec-quorum" class="minutes-section">
      <h3>Quórum</h3>
      ${
        q
          ? `<p><strong>${pct(q.currentCoefficient)}</strong> / requerido ${pct(q.requiredCoefficient)} · ${q.quorumReached ? "Alcanzado" : "No alcanzado"}</p>`
          : `<p class="muted">Sin quórum registrado.</p>`
      }
    </section>

    <section id="sec-agenda" class="minutes-section">
      <h3>Agenda</h3>
      <ol>${agenda.map((a) => `<li>${escapeHtml(a.code || "")} ${escapeHtml(a.title || "")}${a.isActive ? " · ACTIVO" : ""}</li>`).join("") || "<li>—</li>"}</ol>
    </section>

    <section class="minutes-section">
      <h3>Intervenciones</h3>
      <ul>${interventions
        .filter((i) => i.status === "Completed" || i.status === "Granted")
        .map((i) => `<li>${escapeHtml(i.displayName)} · ${escapeHtml(i.status)}</li>`)
        .join("") || "<li class='muted'>Sin intervenciones registradas.</li>"}</ul>
    </section>

    <section id="sec-motions" class="minutes-section">
      <h3>Mociones y votaciones</h3>
      ${
        motions.length
          ? motions
              .map((m) => {
                const motion = m.motion || m;
                const results = m.results;
                const session = m.closedSession || m.session;
                return `<article class="minutes-block">
                  <h4>${escapeHtml(motion.code || "")} — ${escapeHtml(motion.title || "")}</h4>
                  <p>${escapeHtml(motion.body || "")}</p>
                  ${
                    results
                      ? `<p>A favor ${pct(results.inFavorCoefficient)} · En contra ${pct(results.againstCoefficient)} · Abst. ${pct(results.abstentionCoefficient)} · Votos ${results.votesCast ?? 0}</p>
                         <p class="muted">${escapeHtml(session?.appliedDecisionRule || results.appliedDecisionRule || "")} → ${escapeHtml(session?.decisionStatus || results.decisionStatus || motion.status || "")}</p>
                         ${session?.hidePartialResults ? "<p class='muted'>Votación secreta: no se publican votos individuales.</p>" : ""}`
                      : `<p class="muted">Sin resultado cerrado.</p>`
                  }
                </article>`;
              })
              .join("")
          : `<p class="muted">Sin mociones cerradas.</p>`
      }
    </section>

    <section id="sec-decisions" class="minutes-section">
      <h3>Registro de decisiones</h3>
      <ul>${decisions
        .map(
          (d) =>
            `<li><strong>${escapeHtml(d.decisionNumber)}</strong> · ${escapeHtml(d.motionCode)} · ${escapeHtml(d.decisionStatus)} · ${escapeHtml(d.explanation || "")}</li>`
        )
        .join("") || "<li class='muted'>Sin decisiones.</li>"}</ul>
    </section>

    <section id="sec-closure" class="minutes-section">
      <h3>Cierre</h3>
      <p>Acreditación: ${escapeHtml(formatDateTime(data.checkInStartedAtUtc) || "—")}</p>
      <p>Inicio: ${escapeHtml(formatDateTime(data.assemblyStartedAtUtc) || "—")}</p>
      <p>Cierre: ${escapeHtml(formatDateTime(data.completedAtUtc) || "—")}</p>
      <p class="muted">${escapeHtml(data.disclaimer || "")}</p>
      ${(c.notes || []).map((n) => `<p class="muted">• ${escapeHtml(n)}</p>`).join("")}
    </section>
  `;
}

async function init() {
  await initI18n();
  qs("#page-title").textContent = t("minutes.title");
  const linkDash = qs("#link-dashboard");
  if (linkDash) {
    linkDash.href = `/dashboard.html?assemblyId=${assemblyId}`;
    linkDash.textContent = t("back");
  }
  qs("#btn-print")?.addEventListener("click", () => window.print());
  const linkEv = qs("#link-evidence");
  if (linkEv) linkEv.href = `/evidence.html?assemblyId=${assemblyId}`;

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

  await bootIaPage({ current: "asm-minutes", pageLabel: "Acta" });

  const result = await getMinutes(assemblyId);
  if (!result.ok) {
    showError(result.message || t("minutes.unavailable"));
    qs("#minutes-root").innerHTML = `<div class="empty-state">${escapeHtml(t("minutes.empty"))}</div>`;
    return;
  }

  renderMinutes(result.data);
}

init().catch((error) => {
  console.error(error);
  showError(error.message || t("networkError"));
});
