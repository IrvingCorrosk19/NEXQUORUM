import { api } from "./api.js";
import { me } from "./auth.js";
import { initI18n, t } from "../i18n/i18n.js";
import { assemblyIdFromUrl, escapeHtml, qs, showToast } from "./ui.js";
import { getParticipants, hydrateRoomState } from "./room-state.js";
import { isOperator } from "./roles.js";
import { renderQuorum } from "./quorum.js";
import { createAssemblyConnection } from "./signalr-client.js";

const assemblyId = assemblyIdFromUrl();
let participants = [];
let user = null;
let pendingPreview = null;
let recent = [];
let quorum = null;

function showError(message) {
  const el = qs("#page-alert");
  if (!el) return;
  el.hidden = !message;
  el.textContent = message || "";
}

function announce(message) {
  const el = qs("#sr-announcer");
  if (el) el.textContent = message;
}

function normalizeList(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.items)) return data.items;
  if (Array.isArray(data.participants)) return data.participants;
  return [];
}

function isPresent(p) {
  return Boolean(p.isAccredited) || ["Present", "CheckedIn"].includes(p.attendanceStatus);
}

function updateLive() {
  const accredited = participants.filter((p) => p.isAccredited).length;
  const present = participants.filter((p) => isPresent(p)).length;
  qs("#live-counts").textContent = `${present} / ${accredited}`;

  const root = qs("#live-quorum");
  if (quorum) {
    renderQuorum(root, quorum, { compact: true });
    const missing = Number(quorum.missingCoefficient ?? 0);
    qs("#live-quorum-meta").textContent = quorum.quorumReached
      ? t("quorum.reached")
      : `Falta ${missing.toFixed(2)}%`;
  }

  const recentRoot = qs("#recent-root");
  if (!recent.length) {
    recentRoot.textContent = "Sin acreditaciones aún";
  } else {
    recentRoot.innerHTML = recent
      .slice(0, 6)
      .map(
        (r) =>
          `<div>${escapeHtml(r.name)} <span class="muted">${escapeHtml(r.unit || "")}</span> · ${Number(r.coeff).toFixed(2)}%</div>`
      )
      .join("");
  }
}

function renderCards(filter = "") {
  const root = qs("#cards-root");
  const q = filter.trim().toLowerCase();
  const list = participants.filter((p) => {
    if (!q) return true;
    const hay = `${p.displayName || ""} ${p.unitCode || ""} ${p.identification || ""}`.toLowerCase();
    return hay.includes(q);
  });

  if (!list.length) {
    root.innerHTML = `<div class="empty-state">${escapeHtml(participants.length ? t("checkin.empty") : t("checkin.noApi"))}</div>`;
    return;
  }

  root.innerHTML = list
    .map((p) => {
      const present = isPresent(p);
      const coeff =
        p.effectiveCoefficientPercent != null && p.isAccredited
          ? `${Number(p.effectiveCoefficientPercent).toFixed(3)}%`
          : p.coefficientPercent != null
            ? `${Number(p.coefficientPercent).toFixed(3)}%`
            : "—";
      const reps =
        p.representationCount > 0
          ? `<div><dt>Representaciones</dt><dd>${escapeHtml(String(p.representationCount))}</dd></div>`
          : "";
      return `
      <article class="accreditation-card" data-user-id="${escapeHtml(p.userId || "")}">
        <div class="owner-label">${escapeHtml(t("checkin.owner"))}</div>
        <h2 class="owner-name">${escapeHtml(p.displayName || "—")}</h2>
        <dl class="accreditation-grid">
          <div>
            <dt>${escapeHtml(t("checkin.unit"))}</dt>
            <dd>${escapeHtml(p.unitCode || "—")}</dd>
          </div>
          <div>
            <dt>${escapeHtml(t("checkin.coefficient"))}</dt>
            <dd>${escapeHtml(coeff)}</dd>
          </div>
          ${reps}
          <div>
            <dt>${escapeHtml(t("checkin.status"))}</dt>
            <dd><span class="badge ${present ? "badge-success" : "badge-live"}">${escapeHtml(
              present ? t("checkin.accredited") : t("checkin.eligible")
            )}</span></dd>
          </div>
        </dl>
        ${
          present
            ? ""
            : `<button type="button" class="btn btn-primary" data-review="${escapeHtml(p.userId || "")}">
                ${escapeHtml(isOperator(user) ? "Revisar" : t("checkin.checkIn"))}
              </button>`
        }
      </article>`;
    })
    .join("");

  root.querySelectorAll("[data-review]").forEach((btn) => {
    btn.addEventListener("click", () => openReview(btn.getAttribute("data-review")));
  });
}

async function openReview(targetUserId) {
  showError("");
  try {
    const preview = await api(
      `/api/assemblies/${assemblyId}/attendance/participants/${targetUserId}/preview`
    );
    pendingPreview = preview;
    const body = qs("#review-body");
    const conflicts = preview.conflicts || [];
    const owned = (preview.owned || [])
      .map((u) => `<dd>${escapeHtml(u.unitCode)} · ${Number(u.coefficientPercent).toFixed(3)}%</dd>`)
      .join("") || "<dd>—</dd>";
    const represented = (preview.represented || [])
      .map((u) => `<dd>${escapeHtml(u.unitCode)} · ${Number(u.coefficientPercent).toFixed(3)}%${
        u.conflictWithDisplayName ? ` · conflicto` : ""
      }</dd>`)
      .join("") || "<dd>—</dd>";

    body.innerHTML = `
      <p><strong>${escapeHtml(preview.displayName)}</strong></p>
      <dl>
        <dt>Propiedad</dt>
        ${owned}
        <dt>Representación</dt>
        ${represented}
        <dt>Total efectivo</dt>
        <dd><strong>${Number(preview.effectiveCoefficientPercent).toFixed(3)}%</strong></dd>
        <dt>Estado</dt>
        <dd>${preview.isAccredited ? "Acreditada" : preview.canAccredit ? "Habilitada" : "Con conflictos"}</dd>
      </dl>
      ${
        conflicts.length
          ? `<div class="conflict-box" role="alert"><strong>Conflicto de representación</strong><ul>${conflicts
              .map((c) => `<li>${escapeHtml(c.message)}</li>`)
              .join("")}</ul></div>`
          : ""
      }
    `;

    const confirm = qs("#btn-review-confirm");
    confirm.disabled = !preview.canAccredit || conflicts.length > 0;
    qs("#review-panel").hidden = false;
    confirm.focus();
  } catch (error) {
    showError(error.message);
  }
}

function closeReview() {
  qs("#review-panel").hidden = true;
  pendingPreview = null;
}

async function confirmAccredit() {
  if (!pendingPreview) return;
  const btn = qs("#btn-review-confirm");
  btn.disabled = true;
  try {
    const targetId = pendingPreview.userId;
    const operator = isOperator(user);
    const isSelf = String(user?.userId || "") === String(targetId);

    let result;
    if (operator && !isSelf) {
      result = await api(`/api/assemblies/${assemblyId}/attendance/participants/${targetId}/accredit`, {
        method: "POST",
        body: { presenceType: "InPerson", method: "OperatorCheckIn" }
      });
    } else {
      result = await api(`/api/assemblies/${assemblyId}/attendance/check-in`, {
        method: "POST",
        body: { unitId: null, presenceType: isSelf ? "Virtual" : "InPerson" }
      });
    }

    recent.unshift({
      name: pendingPreview.displayName,
      unit: (result.representations || pendingPreview.owned || [])[0]?.unitCode || "",
      coeff: result.effectiveCoefficientPercent ?? pendingPreview.effectiveCoefficientPercent
    });

    announce(`Acreditación completada: ${pendingPreview.displayName}`);
    showToast(
      `✓ ${pendingPreview.displayName} · ${Number(result.effectiveCoefficientPercent ?? 0).toFixed(3)}%`,
      "success"
    );

    if (result.currentQuorumCoefficient != null) {
      quorum = {
        currentCoefficient: result.currentQuorumCoefficient,
        requiredCoefficient: result.requiredQuorumCoefficient,
        quorumReached: result.quorumReached,
        missingCoefficient: Math.max(
          0,
          Number(result.requiredQuorumCoefficient || 0) - Number(result.currentQuorumCoefficient || 0)
        )
      };
    }

    closeReview();
    await reloadParticipants();
    await reloadQuorum();
    qs("#participant-filter")?.focus();
  } catch (error) {
    showError(error.message);
    announce(error.message);
    btn.disabled = false;
  }
}

async function selfCheckIn() {
  try {
    const meId = user?.userId;
    if (meId) {
      await openReview(meId);
      return;
    }
    await api(`/api/assemblies/${assemblyId}/attendance/check-in`, {
      method: "POST",
      body: { unitId: null, presenceType: "Virtual" }
    });
    showToast(t("checkin.success"), "success");
    await reloadParticipants();
    await reloadQuorum();
  } catch (error) {
    showError(error.message);
  }
}

async function reloadParticipants() {
  const result = await getParticipants(assemblyId);
  if (result.ok) {
    participants = normalizeList(result.data);
  } else {
    const room = await hydrateRoomState(assemblyId);
    participants = room.participants || [];
    if (!participants.length && result.message) {
      showToast(result.message, "info");
    }
  }
  renderCards(qs("#participant-filter")?.value || "");
  updateLive();
}

async function reloadQuorum() {
  try {
    quorum = await api(`/api/assemblies/${assemblyId}/quorum`);
    updateLive();
  } catch {
    // ignore
  }
}

async function init() {
  await initI18n();
  qs("#page-title").textContent = t("checkin.title");
  qs("#btn-self-checkin").textContent = t("checkin.selfCheckIn");
  qs("#link-lobby").textContent = t("dashboard.linkLobby");
  qs("#link-lobby").href = `/lobby.html?assemblyId=${assemblyId}`;
  qs("#link-dashboard").href = `/dashboard.html?assemblyId=${assemblyId}`;
  qs("#link-dashboard").textContent = t("back");

  const filter = qs("#participant-filter");
  filter.placeholder = t("checkin.searchPlaceholder");
  qs("label[for='participant-filter']").textContent = t("checkin.searchLabel");

  if (!assemblyId) {
    showError(t("dashboard.missingId"));
    return;
  }

  try {
    user = await me();
  } catch {
    location.href = "/";
    return;
  }

  try {
    const assembly = await api(`/api/assemblies/${assemblyId}`);
    qs("#assembly-label").textContent = `${assembly.propertyHorizontalName || ""} · ${assembly.title || ""}`;
  } catch {
    // ignore
  }

  await reloadParticipants();
  await reloadQuorum();

  filter.addEventListener("input", () => renderCards(filter.value));
  qs("#btn-self-checkin").addEventListener("click", selfCheckIn);
  qs("#btn-review-cancel").addEventListener("click", closeReview);
  qs("#btn-review-confirm").addEventListener("click", confirmAccredit);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !qs("#review-panel").hidden) closeReview();
  });

  try {
    if (window.signalR) {
      const hub = createAssemblyConnection({
        quorumUpdated: (q) => {
          quorum = q;
          updateLive();
          if (q?.quorumReached) announce(t("quorum.reached"));
        },
        participantUpdated: async () => {
          await reloadParticipants();
        }
      });
      await hub.start(assemblyId);
    }
  } catch {
    // SignalR optional for check-in page
  }
}

init().catch((error) => {
  console.error(error);
  showError(error.message || t("networkError"));
});
