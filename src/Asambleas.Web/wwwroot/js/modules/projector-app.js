import { me } from "./auth.js";
import { initI18n, t } from "../i18n/i18n.js";
import { assemblyIdFromUrl, escapeHtml, formatDuration, qs, showToast } from "./ui.js";
import { hydrateRoomState } from "./room-state.js";
import { renderQuorum } from "./quorum.js";
import { renderAgenda } from "./agenda.js";
import { createAssemblyConnection } from "./signalr-client.js";

const assemblyId = assemblyIdFromUrl();
const state = {
  assembly: null,
  quorum: null,
  agenda: null,
  motion: null,
  session: null,
  tally: null,
  votingOpenedAt: null
};

let timerId = null;

function showError(message) {
  const el = qs("#page-alert");
  if (!el) return;
  el.hidden = !message;
  el.textContent = message || "";
}

function renderAll() {
  qs("#assembly-title").textContent = state.assembly
    ? `${state.assembly.propertyHorizontalName || ""} — ${state.assembly.title || ""}`
    : t("projector.noData");

  renderQuorum(qs("#quorum-panel"), state.quorum);

  renderAgenda(qs("#agenda-panel"), state.agenda, { compact: true });

  const motion = qs("#motion-panel");
  if (!state.motion) {
    motion.innerHTML = `<div class="empty-state">${escapeHtml(t("assembly.noMotion"))}</div>`;
  } else {
    motion.innerHTML = `
      <p><strong>${escapeHtml(state.motion.code)}</strong> — ${escapeHtml(state.motion.title)}</p>
      <p>${escapeHtml(state.motion.body || "")}</p>
      <span class="badge badge-live">${escapeHtml(state.motion.status)}</span>
    `;
  }

  const voting = qs("#voting-panel");
  if (!state.session) {
    voting.innerHTML = `<div class="empty-state">${escapeHtml(t("assembly.noVoting"))}</div>`;
  } else if (state.session.status === "Closed" && state.tally) {
    const d = state.tally.decisionStatus || "—";
    voting.innerHTML = `
      <p class="badge badge-success">${escapeHtml(t("voting.officialResult"))}</p>
      <p><strong>${escapeHtml(t("voting.result"))}: ${escapeHtml(d)}</strong></p>
      <p>${escapeHtml(t("voting.inFavor"))}: ${Number(state.tally.inFavorCoefficient).toFixed(2)}%</p>
      <p>${escapeHtml(t("voting.against"))}: ${Number(state.tally.againstCoefficient).toFixed(2)}%</p>
      <p>${escapeHtml(t("voting.abstention"))}: ${Number(state.tally.abstentionCoefficient).toFixed(2)}%</p>
    `;
  } else {
    voting.innerHTML = `
      <p class="badge badge-live">${escapeHtml(state.session.status)}</p>
      ${
        state.tally && !state.session.hidePartialResults
          ? `<p>${escapeHtml(t("voting.votesReceived"))}: ${state.tally.votesCast ?? "—"}</p>`
          : `<p class="muted">${escapeHtml(t("voting.partialHidden"))}</p>`
      }
    `;
  }

  tickTimer();
}

function tickTimer() {
  const panel = qs("#timer-panel");
  if (!state.votingOpenedAt || state.session?.status !== "Open") {
    panel.textContent = "—";
    return;
  }
  panel.textContent = formatDuration(Date.now() - new Date(state.votingOpenedAt).getTime());
}

function applyHydration(room) {
  state.assembly = room.assembly;
  state.quorum = room.quorum;
  state.agenda = room.agenda;
  state.motion = room.motion;
  state.session = room.session;
  state.tally = room.tally;
  state.votingOpenedAt = room.votingOpenedAtUtc || room.session?.openedAtUtc || null;
  renderAll();
}

async function init() {
  await initI18n();
  qs("#agenda-heading").textContent = t("projector.agenda");
  qs("#motion-heading").textContent = t("projector.motion");
  qs("#voting-heading").textContent = t("projector.voting");
  qs("#timer-heading").textContent = t("projector.timer");

  if (!assemblyId) {
    showError(t("dashboard.missingId"));
    return;
  }

  try {
    await me();
  } catch {
    // Projector may be public-safe display; still require session for API today.
    location.href = "/";
    return;
  }

  try {
    const room = await hydrateRoomState(assemblyId);
    if (room._fallbackMessage) showToast(room._fallbackMessage, "info");
    applyHydration(room);
  } catch (error) {
    showError(error.message);
  }

  const hub = createAssemblyConnection({
    onConnectionState: () => {},
    onReconnected: async () => {
      const room = await hydrateRoomState(assemblyId);
      applyHydration(room);
    },
    quorumUpdated: (q) => {
      state.quorum = q;
      renderQuorum(qs("#quorum-panel"), q);
    },
    agendaUpdated: (a) => {
      state.agenda = a;
      renderAgenda(qs("#agenda-panel"), a, { compact: true });
    },
    motionUpdated: (m) => {
      state.motion = m;
      renderAll();
    },
    votingOpened: (s) => {
      state.session = s;
      state.tally = null;
      state.votingOpenedAt = s.openedAtUtc || new Date().toISOString();
      renderAll();
    },
    voteTallyUpdated: (tally) => {
      state.tally = tally;
      renderAll();
    },
    votingClosed: (result) => {
      state.session = { id: result.votingSessionId, status: "Closed", motionId: result.motionId };
      state.tally = result.tally;
      renderAll();
    },
    assemblyStatusChanged: (summary) => {
      state.assembly = { ...state.assembly, ...summary };
      renderAll();
    }
  });

  await hub.start(assemblyId);
  timerId = window.setInterval(tickTimer, 1000);
}

init().catch((error) => {
  console.error(error);
  showError(error.message || t("networkError"));
});
