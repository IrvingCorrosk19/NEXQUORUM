import { api } from "./api.js";
import { me, hasPermission } from "./auth.js";
import { initI18n, t } from "../i18n/i18n.js";
import { assemblyIdFromUrl, escapeHtml, qs, showToast } from "./ui.js";
import { getParticipants, hydrateRoomState } from "./room-state.js";
import { isOperator } from "./roles.js";
import { renderQuorum } from "./quorum.js";
import { createAssemblyConnection } from "./signalr-client.js";
import { ensureAssemblyIdOrRedirect } from "./assembly-context.js";

let assemblyId = assemblyIdFromUrl();
let participants = [];
let user = null;
let pendingPreview = null;
let recent = [];
let quorum = null;
let assembly = null;
let assemblyStatus = null;

const OPEN_STATUSES = new Set(["CheckIn", "InProgress", "Paused"]);

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

function deskIsOpen() {
  return OPEN_STATUSES.has(String(assemblyStatus || ""));
}

function canOpenDesk() {
  return (
    isOperator(user) &&
    hasPermission(user, "assembly:start") &&
    String(assemblyStatus || "") === "Scheduled"
  );
}

function errorMessage(error) {
  const code = error?.payload?.code || error?.payload?.extensions?.code;
  if (code === "ASSEMBLY_NOT_OPEN_FOR_CHECKIN") {
    return t("checkin.deskClosed", { status: assemblyStatus || "—" });
  }
  return error?.message || t("networkError");
}

function updateDeskBanner() {
  const banner = qs("#desk-banner");
  const text = qs("#desk-banner-text");
  const btn = qs("#btn-open-desk");
  if (!banner || !text || !btn) return;

  banner.hidden = false;
  banner.classList.toggle("is-open", deskIsOpen());
  if (deskIsOpen()) {
    text.textContent = t("checkin.deskOpen");
    btn.hidden = true;
  } else {
    text.textContent = t("checkin.deskClosed", { status: assemblyStatus || "—" });
    btn.hidden = !canOpenDesk();
    btn.textContent = t("checkin.openDesk");
  }
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
  } else {
    root.textContent = "—";
    qs("#live-quorum-meta").textContent = deskIsOpen() ? "" : t("checkin.assemblyStatus") + ": " + (assemblyStatus || "—");
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

function formatCoeff(value) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return `${Number(value).toFixed(3)}%`;
}

function renderCards(filter = "") {
  const root = qs("#cards-root");
  const q = filter.trim().toLowerCase();
  const list = participants.filter((p) => {
    if (!q) return true;
    const hay = `${p.displayName || ""} ${p.unitCode || ""} ${p.roleCode || ""} ${p.identification || ""}`.toLowerCase();
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
          ? formatCoeff(p.effectiveCoefficientPercent)
          : formatCoeff(p.coefficientPercent);
      const reps =
        p.representationCount > 0
          ? `<div><dt>Representaciones</dt><dd>${escapeHtml(String(p.representationCount))}</dd></div>`
          : "";
      return `
      <article class="accreditation-card" data-user-id="${escapeHtml(p.userId || "")}">
        <p class="owner-label">${escapeHtml(t("checkin.owner"))}</p>
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
          <div>
            <dt>${escapeHtml(t("checkin.role"))}</dt>
            <dd>${escapeHtml(p.roleCode || "—")}</dd>
          </div>
          ${reps}
          <div>
            <dt>${escapeHtml(t("checkin.status"))}</dt>
            <dd><span class="badge ${present ? "badge-success" : "badge-live"}">${escapeHtml(
              present ? t("checkin.accredited") : t("checkin.eligible")
            )}</span></dd>
          </div>
        </dl>
        <div class="card-actions">
          <button type="button" class="btn btn-secondary" data-view="${escapeHtml(p.userId || "")}">
            ${escapeHtml(t("checkin.viewDetails"))}
          </button>
          ${
            present
              ? ""
              : `<button type="button" class="btn btn-primary" data-review="${escapeHtml(p.userId || "")}">
                  ${escapeHtml(isOperator(user) ? t("checkin.review") : t("checkin.checkIn"))}
                </button>`
          }
        </div>
      </article>`;
    })
    .join("");

  root.querySelectorAll("[data-view]").forEach((btn) => {
    btn.addEventListener("click", () => openOwnerModal(btn.getAttribute("data-view"), { accreditMode: false }));
  });
  root.querySelectorAll("[data-review]").forEach((btn) => {
    btn.addEventListener("click", () => openOwnerModal(btn.getAttribute("data-review"), { accreditMode: true }));
  });
}

function unitListHtml(units, emptyLabel) {
  if (!units?.length) {
    return `<p class="muted">${escapeHtml(emptyLabel)}</p>`;
  }
  return `<ul class="unit-list">${units
    .map((u) => {
      const conflict = u.conflictWithDisplayName
        ? `<div class="unit-meta">conflicto · ${escapeHtml(u.conflictWithDisplayName)}</div>`
        : `<div class="unit-meta">${escapeHtml(formatCoeff(u.coefficientPercent))}</div>`;
      return `<li><span class="unit-code">${escapeHtml(u.unitCode || "—")}</span>${conflict}</li>`;
    })
    .join("")}</ul>`;
}

function renderOwnerModalBody(preview, participant) {
  const conflicts = preview.conflicts || [];
  const statusLabel = preview.isAccredited
    ? t("checkin.accredited")
    : preview.canAccredit
      ? t("checkin.eligible")
      : t("checkin.conflictTitle");

  return `
    <div class="owner-metrics">
      <div class="owner-metric">
        <div class="label">${escapeHtml(t("checkin.effectiveTotal"))}</div>
        <div class="value">${escapeHtml(formatCoeff(preview.effectiveCoefficientPercent))}</div>
      </div>
      <div class="owner-metric">
        <div class="label">${escapeHtml(t("checkin.status"))}</div>
        <div class="value" style="font-size:1.05rem">${escapeHtml(statusLabel)}</div>
      </div>
    </div>
    <div class="owner-section">
      <h3>${escapeHtml(t("checkin.role"))} / ${escapeHtml(t("checkin.presence"))}</h3>
      <p style="margin:0">${escapeHtml(participant?.roleCode || "—")} · ${escapeHtml(
        preview.attendanceStatus || participant?.attendanceStatus || "—"
      )}${participant?.presenceType ? ` · ${escapeHtml(participant.presenceType)}` : ""}</p>
    </div>
    <div class="owner-section">
      <h3>${escapeHtml(t("checkin.ownedUnits"))}</h3>
      ${unitListHtml(preview.owned, t("checkin.noUnits"))}
    </div>
    <div class="owner-section">
      <h3>${escapeHtml(t("checkin.representedUnits"))}</h3>
      ${unitListHtml(preview.represented, t("checkin.noUnits"))}
    </div>
    ${
      conflicts.length
        ? `<div class="conflict-box" role="alert"><strong>${escapeHtml(t("checkin.conflictTitle"))}</strong><ul>${conflicts
            .map((c) => `<li>${escapeHtml(c.message)}</li>`)
            .join("")}</ul></div>`
        : ""
    }
  `;
}

async function openOwnerModal(targetUserId, { accreditMode }) {
  showError("");
  const dialog = qs("#owner-dialog");
  const accreditBtn = qs("#btn-dialog-accredit");
  try {
    const preview = await api(
      `/api/assemblies/${assemblyId}/attendance/participants/${targetUserId}/preview`
    );
    pendingPreview = preview;
    const participant = participants.find((p) => String(p.userId) === String(targetUserId));

    qs("#owner-dialog-kicker").textContent = t("checkin.owner");
    qs("#owner-dialog-title").textContent = preview.displayName || "—";
    qs("#owner-dialog-subtitle").textContent = [
      participant?.unitCode,
      assembly?.propertyHorizontalName,
      assembly?.title
    ]
      .filter(Boolean)
      .join(" · ");
    qs("#owner-dialog-body").innerHTML = renderOwnerModalBody(preview, participant);

    const canAccredit =
      accreditMode &&
      !preview.isAccredited &&
      preview.canAccredit &&
      !(preview.conflicts || []).length;

    accreditBtn.hidden = !accreditMode;
    accreditBtn.disabled = !canAccredit && !preview.isAccredited;
    accreditBtn.textContent = preview.isAccredited
      ? t("checkin.alreadyAccredited")
      : t("checkin.confirmAccredit");

    if (typeof dialog.showModal === "function") {
      dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }
    (canAccredit ? accreditBtn : qs("#btn-dialog-close")).focus();
  } catch (error) {
    showError(errorMessage(error));
  }
}

function closeOwnerModal() {
  const dialog = qs("#owner-dialog");
  if (dialog?.open) dialog.close();
  else dialog?.removeAttribute("open");
  pendingPreview = null;
}

async function ensureDeskOpen() {
  if (deskIsOpen()) return true;
  if (!canOpenDesk()) {
    throw Object.assign(new Error(t("checkin.deskClosed", { status: assemblyStatus || "—" })), {
      payload: { code: "ASSEMBLY_NOT_OPEN_FOR_CHECKIN" }
    });
  }
  qs("#btn-open-desk").disabled = true;
  qs("#btn-open-desk").textContent = t("checkin.deskOpening");
  try {
    const updated = await api(`/api/assemblies/${assemblyId}/start-checkin`, { method: "POST" });
    assemblyStatus = updated?.status || "CheckIn";
    if (assembly) assembly.status = assemblyStatus;
    updateDeskBanner();
    announce(t("checkin.deskOpen"));
    showToast(t("checkin.deskOpen"), "success");
    return true;
  } finally {
    qs("#btn-open-desk").disabled = false;
    qs("#btn-open-desk").textContent = t("checkin.openDesk");
  }
}

async function confirmAccredit() {
  if (!pendingPreview) return;
  const btn = qs("#btn-dialog-accredit");
  btn.disabled = true;
  try {
    await ensureDeskOpen();

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
      `✓ ${pendingPreview.displayName} · ${formatCoeff(result.effectiveCoefficientPercent ?? 0)}`,
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

    closeOwnerModal();
    await reloadParticipants();
    await reloadQuorum();
    qs("#participant-filter")?.focus();
  } catch (error) {
    showError(errorMessage(error));
    announce(errorMessage(error));
    btn.disabled = false;
  }
}

async function selfCheckIn() {
  try {
    const meId = user?.userId;
    if (meId) {
      await openOwnerModal(meId, { accreditMode: true });
      return;
    }
    await ensureDeskOpen();
    await api(`/api/assemblies/${assemblyId}/attendance/check-in`, {
      method: "POST",
      body: { unitId: null, presenceType: "Virtual" }
    });
    showToast(t("checkin.success"), "success");
    await reloadParticipants();
    await reloadQuorum();
  } catch (error) {
    showError(errorMessage(error));
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
    quorum =
      (await api(`/api/assemblies/${assemblyId}/quorum`)) ||
      (await api(`/api/assemblies/${assemblyId}/quorum/latest`));
    updateLive();
  } catch {
    try {
      quorum = await api(`/api/assemblies/${assemblyId}/quorum/latest`);
      updateLive();
    } catch {
      // ignore until first accreditation
    }
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
  qs("#btn-dialog-close").textContent = t("checkin.close");
  qs("#btn-dialog-accredit").textContent = t("checkin.confirmAccredit");
  qs("#btn-open-desk").textContent = t("checkin.openDesk");

  const filter = qs("#participant-filter");
  filter.placeholder = t("checkin.searchPlaceholder");
  qs("label[for='participant-filter']").textContent = t("checkin.searchLabel");

  if (!assemblyId) {
    assemblyId = await ensureAssemblyIdOrRedirect();
    if (!assemblyId) {
      showError(t("dashboard.missingId"));
      return;
    }
    return;
  }

  try {
    user = await me();
  } catch {
    location.href = "/";
    return;
  }

  try {
    assembly = await api(`/api/assemblies/${assemblyId}`);
    assemblyStatus = assembly.status;
    qs("#assembly-label").textContent = `${assembly.propertyHorizontalName || ""} · ${assembly.title || ""}`;
  } catch {
    // ignore
  }

  updateDeskBanner();
  await reloadParticipants();
  await reloadQuorum();

  filter.addEventListener("input", () => renderCards(filter.value));
  qs("#btn-self-checkin").addEventListener("click", selfCheckIn);
  qs("#btn-dialog-close").addEventListener("click", closeOwnerModal);
  qs("#btn-dialog-accredit").addEventListener("click", confirmAccredit);
  qs("#btn-open-desk").addEventListener("click", async () => {
    try {
      await ensureDeskOpen();
    } catch (error) {
      showError(errorMessage(error));
    }
  });
  qs("#owner-dialog").addEventListener("close", () => {
    pendingPreview = null;
  });
  qs("#owner-dialog").addEventListener("click", (e) => {
    if (e.target === qs("#owner-dialog")) closeOwnerModal();
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
        },
        assemblyUpdated: (a) => {
          if (a?.status) {
            assemblyStatus = a.status;
            updateDeskBanner();
          }
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
