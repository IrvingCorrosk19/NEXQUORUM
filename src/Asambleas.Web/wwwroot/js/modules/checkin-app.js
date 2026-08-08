import { api } from "./api.js";
import { me } from "./auth.js";
import { initI18n, t } from "../i18n/i18n.js";
import { assemblyIdFromUrl, escapeHtml, qs, showToast } from "./ui.js";
import { getParticipants, hydrateRoomState } from "./room-state.js";
import { isOperator } from "./roles.js";

const assemblyId = assemblyIdFromUrl();
let participants = [];
let user = null;

function showError(message) {
  const el = qs("#page-alert");
  if (!el) return;
  el.hidden = !message;
  el.textContent = message || "";
}

function normalizeList(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.items)) return data.items;
  if (Array.isArray(data.participants)) return data.participants;
  return [];
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
      const present = ["Present", "CheckedIn", "Accredited"].includes(p.attendanceStatus);
      const coeff =
        p.coefficientPercent != null
          ? `${Number(p.coefficientPercent).toFixed(3)}%`
          : p.coefficient != null
            ? `${Number(p.coefficient).toFixed(3)}%`
            : "—";
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
          <div>
            <dt>${escapeHtml(t("checkin.status"))}</dt>
            <dd><span class="badge ${present ? "badge-success" : "badge-live"}">${escapeHtml(present ? t("checkin.accredited") : t("checkin.eligible"))}</span></dd>
          </div>
        </dl>
        ${
          present
            ? ""
            : `<button type="button" class="btn btn-primary" data-accredit="${escapeHtml(p.userId || "")}" data-unit="${escapeHtml(p.unitId || "")}">
                ${escapeHtml(isOperator(user) ? t("checkin.accredit") : t("checkin.checkIn"))}
              </button>`
        }
      </article>`;
    })
    .join("");

  root.querySelectorAll("[data-accredit]").forEach((btn) => {
    btn.addEventListener("click", () => accredit(btn));
  });
}

async function accredit(btn) {
  const unitId = btn.getAttribute("data-unit") || null;
  btn.disabled = true;
  try {
    await api(`/api/assemblies/${assemblyId}/attendance/check-in`, {
      method: "POST",
      body: { unitId: unitId && unitId !== "null" && unitId !== "" ? unitId : null, presenceType: "InPerson" }
    });
    showToast(t("checkin.success"), "success");
    await reloadParticipants();
  } catch (error) {
    showError(error.message);
    btn.disabled = false;
  }
}

async function selfCheckIn() {
  try {
    await api(`/api/assemblies/${assemblyId}/attendance/check-in`, {
      method: "POST",
      body: { unitId: null, presenceType: "Virtual" }
    });
    showToast(t("checkin.success"), "success");
    await reloadParticipants();
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
  filter.addEventListener("input", () => renderCards(filter.value));
  qs("#btn-self-checkin").addEventListener("click", selfCheckIn);
}

init().catch((error) => {
  console.error(error);
  showError(error.message || t("networkError"));
});
