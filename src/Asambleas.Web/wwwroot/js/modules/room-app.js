import { api } from "./api.js";
import { hasPermission, logout, me } from "./auth.js";
import { createAssemblyConnection } from "./signalr-client.js";
import { renderQuorum } from "./quorum.js";
import { castVote, closeVoting, getMyVoteStatus, openVoting, renderVotePanel } from "./voting.js";
import {
  completeFloor,
  getQueue,
  grantFloor,
  rejectFloor,
  renderSpeakerQueue,
  requestFloor,
  skipFloor
} from "./speakers.js";
import { renderAgenda, setActiveAgendaItem } from "./agenda.js";
import {
  connectLiveKit,
  disconnectLiveKit,
  fetchJoinToken,
  fetchRoomInfo,
  getLiveKitParticipantCounts,
  getMediaConnectionState,
  highlightOfficialSpeaker,
  listIncidents,
  loadDevicePrefs,
  renderAvBlocked,
  setIncidentHandler,
  setLocalCameraEnabled,
  setLocalMicrophoneEnabled,
  setMediaViewMode,
  unlockRemoteAudio
} from "./meeting.js";
import { initI18n, statusLabel, t } from "../i18n/i18n.js";
import {
  assemblyIdFromUrl,
  confirmDialog,
  escapeHtml,
  formatDuration,
  qs,
  setConnectionLostVisible,
  showToast
} from "./ui.js";
import { hydrateRoomState, resumeAssembly } from "./room-state.js";
import { isOperator, resolveViewerRole } from "./roles.js";

const assemblyId = assemblyIdFromUrl();

const els = {
  room: qs(".room"),
  phName: qs("#ph-name"),
  assemblyTitle: qs("#assembly-title"),
  quorum: qs("#quorum-chip"),
  connection: qs("#connection-state"),
  speakerName: qs("#speaker-name"),
  speakerMeta: qs("#speaker-meta"),
  statusLine: qs("#status-line"),
  participants: qs("#participant-strip"),
  participantCount: qs("#participant-count"),
  agenda: qs("#agenda-panel"),
  motion: qs("#motion-panel"),
  vote: qs("#vote-panel"),
  speakers: qs("#speaker-panel"),
  video: qs("#video-mount"),
  alert: qs("#room-alert"),
  liveChip: qs("#live-chip"),
  liveLabel: qs("#live-label"),
  duration: qs("#duration-label"),
  viewMode: qs("#view-mode"),
  userChip: qs("#user-chip")
};

const state = {
  user: null,
  viewerRole: "Owner",
  assembly: null,
  agenda: null,
  queue: null,
  quorum: null,
  motion: null,
  session: null,
  tally: null,
  myVote: null,
  participants: new Map(),
  startedAtUtc: null,
  hub: null,
  intentionalDisconnect: false
};

let durationTimer = null;
let mediaControlsWired = false;

function showError(message) {
  if (!els.alert) return;
  els.alert.hidden = !message;
  els.alert.textContent = message || "";
}

function setConnectionState(status) {
  const label =
    {
      connected: t("connection.online"),
      reconnecting: t("connection.reconnecting"),
      disconnected: t("connection.disconnected")
    }[status] || status;

  els.connection.innerHTML = `
    <span class="status-dot ${status === "connected" ? "online" : status === "reconnecting" ? "degraded" : "offline"}" aria-hidden="true"></span>
    <span>${escapeHtml(label)}</span>
  `;

  // Fullscreen reconnect UX while recovering or after unexpected drop.
  setConnectionLostVisible(
    !state.intentionalDisconnect && (status === "reconnecting" || status === "disconnected")
  );
}

function applyRoleChrome() {
  const operator = state.viewerRole === "Operator";
  els.room?.setAttribute("data-role", operator ? "operator" : "owner");
  els.viewMode.textContent = operator ? t("assembly.operatorView") : t("assembly.ownerView");
  document.querySelectorAll(".operator-only").forEach((el) => {
    el.hidden = !operator;
  });
  document.querySelectorAll(".owner-only").forEach((el) => {
    el.hidden = operator;
  });
}

function syncParticipantsFromList(list) {
  state.participants.clear();
  for (const p of list || []) {
    const key = p.userId || p.id;
    if (key) state.participants.set(key, p);
  }
}

function renderHybridCockpit(items) {
  const el = qs("#hybrid-cockpit");
  if (!el) return;
  if (state.viewerRole !== "Operator") {
    el.hidden = true;
    return;
  }
  let inPerson = 0;
  let virtual = 0;
  let represented = 0;
  for (const p of items) {
    const pt = (p.presenceType || "").toLowerCase();
    if (pt === "inperson") inPerson += 1;
    else if (pt === "virtual" || pt === "hybrid") virtual += 1;
    represented += Number(p.representationCount || 0);
  }
  el.hidden = false;
  el.innerHTML = `
    <strong>${escapeHtml(t("assembly.hybridPresent"))}</strong>
    <span>${escapeHtml(t("assembly.hybridInPerson"))}: ${inPerson}</span>
    <span>${escapeHtml(t("assembly.hybridVirtual"))}: ${virtual}</span>
    <span>${escapeHtml(t("assembly.hybridRepresented"))}: ${represented}</span>
    <span>${escapeHtml(t("assembly.hybridLogical"))}: ${items.length}</span>`;
}

function renderMediaCockpit() {
  const el = qs("#media-cockpit");
  if (!el) return;
  if (state.viewerRole !== "Operator") {
    el.hidden = true;
    return;
  }
  const media = getLiveKitParticipantCounts();
  const attendance = state.participants.size;
  const problems = listIncidents().length;
  el.hidden = false;
  el.innerHTML = `
    <strong>${escapeHtml(t("media.liveKitLabel") || "LiveKit media")}</strong>
    <span>${escapeHtml(t("media.connected"))}: ${media.connected}</span>
    <span>${escapeHtml(t("assembly.hybridPresent") || "Attendance")}: ${attendance}</span>
    <span>${escapeHtml(t("media.problems"))}: ${problems}</span>
    <span>${escapeHtml(t("media.activeMics"))}: ${media.mics}</span>
    <span>${escapeHtml(t("media.cameras"))}: ${media.cameras}</span>`;
}

function renderIncidentStrip() {
  const el = qs("#incident-strip");
  if (!el) return;
  const items = listIncidents();
  if (!items.length) {
    el.hidden = true;
    el.innerHTML = "";
    return;
  }
  el.hidden = false;
  el.innerHTML = items
    .map((i) => `<div class="incident incident-${escapeHtml(i.severity)}">${escapeHtml(i.message)}</div>`)
    .join("");
}

function annotateMediaRoleBadges(items) {
  if (!els.video) return;
  for (const p of items) {
    const identity = String(p.userId || "").replace(/-/g, "").toLowerCase();
    if (!identity) continue;
    const tile = els.video.querySelector(`[data-identity="${CSS.escape(identity)}"]`);
    if (!tile) continue;
    const role = String(p.roleCode || "").toLowerCase();
    if (role.includes("president")) {
      tile.dataset.role = "president";
      tile.querySelector(".media-tile-label")?.setAttribute("data-role-label", "· Presidente");
    } else if (role.includes("secretary")) {
      tile.dataset.role = "secretary";
      tile.querySelector(".media-tile-label")?.setAttribute("data-role-label", "· Secretario");
    }
  }
}

function renderParticipants() {
  if (!els.participants) return;
  const items = [...state.participants.values()];
  const count = items.length;

  if (els.participantCount) {
    els.participantCount.hidden = state.viewerRole !== "Operator";
    els.participantCount.textContent = `${t("assembly.participants")}: ${count}`;
  }

  renderHybridCockpit(items);
  renderMediaCockpit();
  annotateMediaRoleBadges(items);

  if (!items.length) {
    els.participants.innerHTML = emptyState(
      t("assembly.noParticipants"),
      t("assembly.noParticipantsWhy"),
      t("assembly.noParticipantsNext")
    );
    return;
  }

  els.participants.innerHTML = items
    .map((p) => {
      const initials = (p.displayName || "?")
        .split(/\s+/)
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase() || "")
        .join("");
      return `
      <article class="participant" aria-label="${escapeHtml(p.displayName)}">
        <span class="avatar" aria-hidden="true">${escapeHtml(initials)}</span>
        <div class="participant-meta">
          <strong>${escapeHtml(p.displayName)}</strong>
          <span>${escapeHtml(p.unitCode || "—")} · ${escapeHtml(p.attendanceStatus || "")} · ${escapeHtml(p.presenceType || "—")}</span>
        </div>
      </article>`;
    })
    .join("");
}

function setVisible(el, visible) {
  if (!el) return;
  el.hidden = !visible;
}

function syncLiveMode() {
  if (!els.room) return;
  const status = state.assembly?.status;
  const mode =
    status === "InProgress" ? "live" : status === "Paused" ? "paused" : status === "Completed" ? "closed" : "prep";
  els.room.setAttribute("data-mode", mode);
  document.body.dataset.assemblyMode = mode;

  if (status === "Paused") {
    els.speakerName.textContent = t("assembly.recessTitle");
    els.speakerMeta.textContent = t("assembly.recessBody");
  }
}

function syncOperatorActions() {
  const status = state.assembly?.status;
  const user = state.user;
  const canManage = hasPermission(user, "assembly:manage");
  const canStart = hasPermission(user, "assembly:start");
  const canClose = hasPermission(user, "assembly:close");

  // Permission-gated (not only viewerRole) — secretary without manage won't see 403 buttons.
  setVisible(
    qs("#btn-start"),
    canStart && (status === "CheckIn" || status === "Scheduled")
  );
  setVisible(qs("#btn-pause"), canManage && status === "InProgress");
  setVisible(qs("#btn-resume"), canManage && status === "Paused");
  setVisible(
    qs("#btn-end"),
    canClose && (status === "InProgress" || status === "Paused")
  );

  document.querySelectorAll(".control-cluster.operator-only").forEach((cluster) => {
    const any = [...cluster.querySelectorAll("button")].some((b) => !b.hidden);
    cluster.hidden = !any;
  });
}

function syncContextPriority() {
  if (!els.room) return;
  const votingOpen = state.session?.status === "Open";
  const hasMotion = Boolean(state.motion);
  const speakerActive = Boolean(state.queue?.currentSpeakerRequestId);

  let priority = "default";
  if (votingOpen) priority = "voting";
  else if (speakerActive) priority = "speaker";
  else if (hasMotion) priority = "motion";

  els.room.setAttribute("data-voting", votingOpen ? "open" : "idle");
  els.room.setAttribute("data-priority", priority);

  const agendaSection = els.agenda?.closest("section");
  const motionSection = els.motion?.closest("section");
  const voteSection = els.vote?.closest("section");
  const speakerSection = els.speakers?.closest("section");

  [agendaSection, motionSection, voteSection, speakerSection].forEach((s) => {
    s?.classList.remove("is-primary", "is-collapsed", "is-emphasis", "is-compact");
  });

  if (votingOpen) {
    voteSection?.classList.add("is-primary", "is-emphasis");
    motionSection?.classList.add("is-emphasis");
    agendaSection?.classList.add("is-collapsed");
  } else if (hasMotion) {
    motionSection?.classList.add("is-primary", "is-emphasis");
    voteSection?.classList.add("is-collapsed");
  } else {
    agendaSection?.classList.add("is-primary");
    voteSection?.classList.add("is-collapsed");
    if (!hasMotion) motionSection?.classList.add("is-compact", "is-collapsed");
  }

  if (speakerActive) {
    speakerSection?.classList.add("is-emphasis");
  }
}

function syncFloorBanner() {
  const banner = qs("#floor-banner");
  if (!banner) return;
  if (state.viewerRole === "Operator") {
    banner.hidden = true;
    return;
  }
  const current = state.queue?.queue?.find((s) => s.id === state.queue.currentSpeakerRequestId);
  const isMine =
    Boolean(current) &&
    (current.userId === state.user?.userId || current.displayName === state.user?.displayName);
  const myRequest = state.queue?.queue?.find(
    (s) =>
      s.status === "Requested" &&
      (s.userId === state.user?.userId || s.displayName === state.user?.displayName)
  );

  if (isMine) {
    banner.hidden = false;
    banner.innerHTML = `<strong>${escapeHtml(t("assembly.youHaveFloor"))}</strong>`;
    banner.classList.add("is-active");
  } else if (myRequest) {
    banner.hidden = false;
    const pos = myRequest.queueOrder ?? "—";
    banner.innerHTML = `<strong>${escapeHtml(t("assembly.requestSent"))}</strong>
      <span>${escapeHtml(t("assembly.queuePosition", { n: pos }))}</span>`;
    banner.classList.remove("is-active");
  } else {
    banner.hidden = true;
    banner.classList.remove("is-active");
  }
}

function renderQuorumDetails() {
  const details = qs("#quorum-details");
  if (!details || !state.quorum) return;
  const q = state.quorum;
  details.innerHTML = `
    <dl class="quorum-details-list">
      <div><dt>${escapeHtml(t("quorum.presentUnits"))}</dt><dd>${q.presentUnits ?? "—"}</dd></div>
      <div><dt>${escapeHtml(t("quorum.coefficient"))}</dt><dd class="metric-number">${Number(q.currentCoefficient ?? 0).toFixed(2)}%</dd></div>
      <div><dt>${escapeHtml(t("quorum.required"))}</dt><dd class="metric-number">${Number(q.requiredCoefficient ?? 0).toFixed(2)}%</dd></div>
      <div><dt>${escapeHtml(t("quorum.lastUpdate"))}</dt><dd>${escapeHtml(
        q.capturedAtUtc || q.updatedAtUtc
          ? new Intl.DateTimeFormat(undefined, { timeStyle: "medium" }).format(
              new Date(q.capturedAtUtc || q.updatedAtUtc)
            )
          : "—"
      )}</dd></div>
    </dl>`;
}

function wireQuorumDetails() {
  const chip = els.quorum;
  const details = qs("#quorum-details");
  if (!chip || !details || chip.dataset.wired) return;
  chip.dataset.wired = "1";
  chip.tabIndex = 0;
  chip.setAttribute("aria-expanded", "false");
  const toggle = () => {
    const open = details.hidden;
    details.hidden = !open;
    chip.setAttribute("aria-expanded", String(open));
    if (open) renderQuorumDetails();
  };
  chip.addEventListener("click", (e) => {
    if (e.target.closest("button,a")) return;
    toggle();
  });
  chip.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggle();
    }
    if (e.key === "Escape") {
      details.hidden = true;
      chip.setAttribute("aria-expanded", "false");
    }
  });
  document.addEventListener("click", (e) => {
    if (!chip.contains(e.target)) {
      details.hidden = true;
      chip.setAttribute("aria-expanded", "false");
    }
  });
}

function emptyState(what, why = "", next = "") {
  return `
    <div class="empty-state panel-compact-empty" role="status">
      <p class="empty-state-what">${escapeHtml(what)}</p>
      ${why ? `<p class="empty-state-why">${escapeHtml(why)}</p>` : ""}
      ${next ? `<p class="empty-state-next muted">${escapeHtml(next)}</p>` : ""}
    </div>`;
}

function renderMotion() {
  if (!els.motion) return;
  const operator = state.viewerRole === "Operator";
  const canPresent =
    operator &&
    hasPermission(state.user, "motion:create") &&
    (state.assembly?.status === "InProgress" || state.assembly?.status === "Paused") &&
    state.session?.status !== "Open";

  const body = state.motion?.body || "";
  const long = body.length > 280;
  const presentControls = canPresent
    ? `<div class="cta-row" style="margin-top:0.75rem">
         <button type="button" class="btn btn-primary" data-action="present-motion">${escapeHtml(
           t("assembly.presentMotion") || "Presentar moción"
         )}</button>
       </div>`
    : "";

  if (!state.motion) {
    els.motion.innerHTML =
      emptyState(
        t("assembly.noMotion"),
        t("assembly.noMotionWhy"),
        canPresent ? t("assembly.noMotionNextPresent") || t("assembly.noMotionNext") : t("assembly.noMotionNext")
      ) + presentControls;
    wirePresentMotion();
    return;
  }

  els.motion.innerHTML = `
    <article class="motion-card" aria-label="${escapeHtml(t("assembly.motion"))}">
      <p class="badge badge-live">${escapeHtml(state.motion.code || t("assembly.motion"))}</p>
      <p><strong>${escapeHtml(state.motion.title)}</strong></p>
      <div class="motion-body ${long ? "is-clamped" : ""}" id="motion-body-text">${escapeHtml(body)}</div>
      ${
        long
          ? `<button type="button" class="btn btn-ghost" data-action="expand-motion">${escapeHtml(t("assembly.showMore"))}</button>`
          : ""
      }
      <p class="muted">${escapeHtml(t("assembly.motionStatus"))}: ${escapeHtml(state.motion.status || "")}</p>
      ${
        state.motion.status === "Draft" || canPresent
          ? presentControls
          : ""
      }
    </article>
  `;
  els.motion.querySelector("[data-action='expand-motion']")?.addEventListener("click", (event) => {
    const text = els.motion.querySelector("#motion-body-text");
    text?.classList.toggle("is-clamped");
    const expanded = !text?.classList.contains("is-clamped");
    event.currentTarget.textContent = expanded ? t("assembly.showLess") : t("assembly.showMore");
  });
  wirePresentMotion();
}

function wirePresentMotion() {
  els.motion?.querySelector("[data-action='present-motion']")?.addEventListener("click", presentMotionFlow);
}

async function presentMotionFlow() {
  try {
    const motions = await api(`/api/assemblies/${assemblyId}/motions`);
    const list = Array.isArray(motions) ? motions : motions?.items || [];
    const draft =
      list.find((m) => m.status === "Draft") ||
      list.find((m) => m.status === "Presented") ||
      list[0];
    if (!draft) {
      showError(t("assembly.noMotionAvailable") || "No hay mociones disponibles.");
      return;
    }
    const ok = await confirmDialog({
      title: t("assembly.presentMotion") || "Presentar moción",
      body: `${draft.code || ""}\n${draft.title || ""}\n\n${(draft.body || "").slice(0, 280)}`,
      confirmLabel: t("confirm")
    });
    if (!ok) return;
    state.motion = await api(`/api/assemblies/${assemblyId}/motions/present`, {
      method: "POST",
      body: { motionId: draft.id }
    });
    showToast(t("assembly.motionPresented") || "Moción presentada", "success");
    refreshPanels();
  } catch (error) {
    showError(error.message);
  }
}

function syncOperationalPriority() {
  syncContextPriority();
  syncLiveMode();
  syncOperatorActions();
  syncFloorBanner();
}

function updateLiveHeader() {
  const live = state.assembly?.status === "InProgress";
  els.liveChip.hidden = !live;
  els.liveLabel.textContent = t("assembly.live");
  if (els.statusLine) {
    els.statusLine.textContent = state.assembly
      ? `${t("assembly.statusLabel")}: ${statusLabel(state.assembly.status)}`
      : "";
  }
}

function tickDuration() {
  if (!state.startedAtUtc || state.assembly?.status !== "InProgress") {
    els.duration.textContent = "00:00:00";
    return;
  }
  els.duration.textContent = formatDuration(Date.now() - new Date(state.startedAtUtc).getTime());
}

function refreshPanels() {
  const operator = state.viewerRole === "Operator";
  renderQuorum(els.quorum, state.quorum, { compact: true });
  renderAgenda(els.agenda, state.agenda, {
    canManage: operator && hasPermission(state.user, "agenda:manage"),
    compact: !operator,
    onActivate: async (id) => {
      state.agenda = await setActiveAgendaItem(assemblyId, id);
      refreshPanels();
    }
  });

  if (operator) {
    renderSpeakerQueue(els.speakers, state.queue, {
      canModerate: hasPermission(state.user, "meeting:moderate"),
      onGrant: async (id) => {
        await grantFloor(assemblyId, id);
        state.queue = await getQueue(assemblyId);
        refreshPanels();
      },
      onComplete: async (id) => {
        await completeFloor(assemblyId, id);
        state.queue = await getQueue(assemblyId);
        refreshPanels();
      },
      onReject: async (id) => {
        try {
          await rejectFloor(assemblyId, id);
          state.queue = await getQueue(assemblyId);
          refreshPanels();
        } catch (error) {
          showError(error.message || t("apiUnavailable", { status: error.status || 404 }));
        }
      },
      onSkip: async (id) => {
        try {
          await skipFloor(assemblyId, id);
          state.queue = await getQueue(assemblyId);
          refreshPanels();
        } catch (error) {
          showError(error.message || t("apiUnavailable", { status: error.status || 404 }));
        }
      }
    });
  }

  renderMotion();
  renderVotePanel(els.vote, {
    session: state.session,
    tally: state.tally,
    myVote: state.myVote,
    canCast: hasPermission(state.user, "vote:cast"),
    canOpen:
      operator &&
      hasPermission(state.user, "vote:open") &&
      state.motion?.status === "Presented" &&
      state.session?.status !== "Open",
    canClose: operator && hasPermission(state.user, "vote:close"),
    operatorView: operator,
    eligibleVoters: state.quorum?.eligibleUnits ?? (state.participants.size || null),
    onCast: async (choice) => {
      const receipt = await castVote(assemblyId, state.session.id, choice);
      state.myVote = {
        evidenceId: receipt.evidenceId,
        castAtUtc: receipt.castAtUtc
      };
      showError("");
      return receipt;
    },
    onVerify: async () => {
      if (!state.session?.id) {
        await rehydrate();
        return null;
      }
      try {
        const status = await getMyVoteStatus(assemblyId, state.session.id);
        if (status?.evidenceId || status?.EvidenceId) {
          state.myVote = {
            evidenceId: status.evidenceId || status.EvidenceId,
            castAtUtc: status.castAtUtc || status.CastAtUtc
          };
          return status;
        }
      } catch {
        /* fall through */
      }
      await rehydrate();
      return state.myVote;
    },
    onOpen: async () => {
      if (!state.motion) {
        showError(t("assembly.noMotion"));
        return;
      }
      const ok = await confirmDialog({
        title: t("assembly.openVoting"),
        body: t("assembly.confirmOpenVoting"),
        confirmLabel: t("confirm")
      });
      if (!ok) return;
      state.session = await openVoting(assemblyId, state.motion.id, true);
      state.tally = null;
      state.myVote = null;
      refreshPanels();
    },
    onClose: async () => {
      const ok = await confirmDialog({
        title: t("assembly.closeVoting"),
        body: t("assembly.confirmCloseVoting"),
        confirmLabel: t("confirm"),
        danger: true
      });
      if (!ok) return;
      const result = await closeVoting(assemblyId, state.session.id);
      state.session = { ...state.session, status: "Closed" };
      state.tally = result.tally;
      refreshPanels();
    }
  });

  const current = state.queue?.queue?.find((s) => s.id === state.queue.currentSpeakerRequestId);
  els.speakerName.textContent = current?.displayName || t("assembly.waitingRoom");
  if (current) {
    els.speakerMeta.textContent = t("assembly.speaking");
  } else if (state.assembly) {
    els.speakerMeta.textContent = "";
  } else {
    els.speakerMeta.textContent = t("assembly.preparing");
  }

  updateLiveHeader();
  renderParticipants();
  syncOperationalPriority();
}

function applyRoomState(room) {
  state.assembly = room.assembly || state.assembly;
  state.quorum = room.quorum;
  state.agenda = room.agenda;
  state.motion = room.motion;
  state.session = room.session;
  state.tally = room.tally;
  state.queue = room.queue;
  state.myVote = room.myVote;
  state.startedAtUtc = room.startedAtUtc || state.startedAtUtc;
  if (room.viewerRole) {
    state.viewerRole = room.viewerRole;
  } else {
    state.viewerRole = resolveViewerRole(state.user, room);
  }
  syncParticipantsFromList(room.participants);
  if (state.assembly) {
    els.phName.textContent = state.assembly.propertyHorizontalName || "—";
    els.assemblyTitle.textContent = state.assembly.title || "";
  }
  applyRoleChrome();
  refreshPanels();
  wireQuorumDetails();
}

async function rehydrate() {
  const room = await hydrateRoomState(assemblyId, {
    userId: state.user?.userId || state.user?.id
  });
  applyRoomState(room);
  if (room._fallbackMessage) {
    showToast(room._fallbackMessage, "info");
  }
}

function syncOfficialSpeakerHighlight() {
  const currentId = state.queue?.currentSpeakerRequestId;
  const current = state.queue?.queue?.find((s) => s.id === currentId);
  const identity = current?.userId ? String(current.userId).replace(/-/g, "") : null;
  highlightOfficialSpeaker(els.video, identity);
  return { current, identity };
}

async function syncPublishForFloor() {
  // Governance floor ≠ LiveKit publish gate. Do not mute/reconnect others when
  // the president grants the floor — only highlight + optionally unmute the holder.
  const { current, identity } = syncOfficialSpeakerHighlight();
  const mine = current && state.user && current.userId === state.user.userId;
  if (identity) {
    setMediaViewMode("focus");
  } else {
    setMediaViewMode("grid");
  }
  if (mine) {
    try {
      await setLocalMicrophoneEnabled(true);
      const micBtn = qs("#btn-mic");
      if (micBtn) {
        micBtn.setAttribute("aria-pressed", "true");
        micBtn.setAttribute("aria-label", t("lobby.muteMic"));
      }
      showToast(t("media.floorMicEnabled"), "success");
    } catch (error) {
      showToast(error.message || t("media.publishFailed"), "error");
      renderIncidentStrip();
    }
  }
  renderMediaCockpit();
  renderIncidentStrip();
  updateMediaConnectionBanner();
}

function updateMediaConnectionBanner() {
  const el = qs("#media-connection-state");
  if (!el) return;
  const st = getMediaConnectionState();
  if (st === "connected" || st === "idle") {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  const labels = {
    connecting: t("media.connecting"),
    reconnecting: t("media.reconnecting"),
    disconnected: t("media.disconnectedGovernanceOk"),
    "governance-only": t("media.governanceOnly")
  };
  el.textContent = labels[st] || st;
}

async function bootstrapMeeting() {
  setIncidentHandler(() => {
    renderIncidentStrip();
    renderMediaCockpit();
    updateMediaConnectionBanner();
  });

  const prefs = loadDevicePrefs();
  const micBtn = qs("#btn-mic");
  const camBtn = qs("#btn-cam");
  if (!mediaControlsWired) {
    mediaControlsWired = true;
    if (micBtn) {
      micBtn.addEventListener("click", async () => {
        const next = micBtn.getAttribute("aria-pressed") !== "true";
        micBtn.setAttribute("aria-pressed", String(next));
        micBtn.setAttribute("aria-label", next ? t("lobby.muteMic") : t("lobby.unmuteMic"));
        const result = await setLocalMicrophoneEnabled(next);
        if (!result.ok) showToast(t("media.publishFailed"), "warn");
        await unlockRemoteAudio();
      });
    }
    if (camBtn) {
      camBtn.addEventListener("click", async () => {
        const next = camBtn.getAttribute("aria-pressed") !== "true";
        camBtn.setAttribute("aria-pressed", String(next));
        camBtn.setAttribute("aria-label", next ? t("lobby.turnCameraOff") : t("lobby.turnCameraOn"));
        const result = await setLocalCameraEnabled(next);
        if (!result.ok) showToast(t("media.publishFailed"), "warn");
        await unlockRemoteAudio();
      });
    }
    qs("#btn-view-grid")?.addEventListener("click", () => {
      setMediaViewMode("grid");
      qs("#btn-view-grid")?.setAttribute("aria-pressed", "true");
      qs("#btn-view-focus")?.setAttribute("aria-pressed", "false");
    });
    qs("#btn-view-focus")?.addEventListener("click", () => {
      setMediaViewMode("focus");
      qs("#btn-view-grid")?.setAttribute("aria-pressed", "false");
      qs("#btn-view-focus")?.setAttribute("aria-pressed", "true");
    });
    qs("#btn-media-fullscreen")?.addEventListener("click", async () => {
      const stage = qs(".video-stage");
      if (!stage) return;
      try {
        if (!document.fullscreenElement) await stage.requestFullscreen();
        else await document.exitFullscreen();
      } catch {
        showToast(t("media.fullscreenUnavailable") || "Fullscreen unavailable", "warn");
      }
    });
    qs("#btn-leave-media")?.addEventListener("click", async () => {
      await disconnectLiveKit();
      if (els.video) {
        els.video.innerHTML = `<div class="empty-state" role="status"><p>${escapeHtml(t("media.leftMedia") || "Audio/video desconectado.")}</p><p class="muted">${escapeHtml(t("media.governanceOnly"))}</p></div>`;
      }
      updateMediaConnectionBanner();
      renderMediaCockpit();
    });
    // First user gesture unlocks remote audio autoplay policies.
    document.addEventListener(
      "pointerdown",
      () => {
        unlockRemoteAudio().catch(() => {});
      },
      { once: true, passive: true }
    );
  }

  try {
    const info = await fetchRoomInfo(assemblyId);
    if (!info.isAvailable) {
      renderAvBlocked(els.video, info.unavailableReason || t("lobby.avBlocked"));
      updateMediaConnectionBanner();
      return;
    }

    const token = await fetchJoinToken(assemblyId);
    const { identity } = syncOfficialSpeakerHighlight();
    const canPublish = Boolean(token.canPublish);
    // Default on when lobby prefs were never set (direct room entry / automation).
    const wantCam = prefs.cameraEnabled !== false;
    const wantMic = prefs.micEnabled !== false;
    // Multi-participant video: any joiner with canPublish may enable cam/mic from lobby prefs.
    // Governance floor remains a separate highlight (not a publish gate).
    await connectLiveKit(els.video, token, {
      enableCamera: wantCam && canPublish,
      enableMic: wantMic && canPublish,
      officialSpeakerIdentity: identity
    });
    if (micBtn) {
      micBtn.setAttribute("aria-pressed", String(wantMic && canPublish));
    }
    if (camBtn) {
      camBtn.setAttribute("aria-pressed", String(wantCam && canPublish));
    }
    if (identity) setMediaViewMode("focus");
  } catch (error) {
    renderAvBlocked(els.video, error.message || t("lobby.avBlocked"));
  }
  updateMediaConnectionBanner();
  renderMediaCockpit();
  renderIncidentStrip();
}

function wireOperatorControls() {
  qs("#btn-start")?.addEventListener("click", async () => {
    const ok = await confirmDialog({
      title: t("assembly.startAssembly"),
      body: t("assembly.confirmStart"),
      confirmLabel: t("confirm")
    });
    if (!ok) return;
    try {
      state.assembly = await api(`/api/assemblies/${assemblyId}/start`, { method: "POST" });
      state.startedAtUtc = new Date().toISOString();
      await rehydrate();
    } catch (error) {
      showError(error.message);
    }
  });

  qs("#btn-pause")?.addEventListener("click", async () => {
    try {
      state.assembly = await api(`/api/assemblies/${assemblyId}/pause`, { method: "POST" });
      refreshPanels();
    } catch (error) {
      showError(error.message);
    }
  });

  qs("#btn-resume")?.addEventListener("click", async () => {
    try {
      state.assembly = await resumeAssembly(assemblyId);
      await rehydrate();
    } catch (error) {
      // Fallback to start if resume endpoint missing
      if (error.status === 404) {
        showToast(t("apiUnavailable", { status: 404 }), "warn");
        return;
      }
      showError(error.message);
    }
  });

  qs("#btn-end")?.addEventListener("click", async () => {
    const status = state.assembly?.status;
    if (state.session?.status === "Open") {
      showError(t("assembly.cannotEndWhileVoting"));
      return;
    }
    const agendaItems = state.agenda?.items?.length ?? 0;
    const done =
      state.agenda?.items?.filter((i) => i.isDone || i.status === "Done").length ?? 0;
    const quorumText = state.quorum
      ? `${Number(state.quorum.currentCoefficient).toFixed(2)}%`
      : "—";
    const speaker = state.queue?.queue?.find((s) => s.id === state.queue.currentSpeakerRequestId);
    const ok = await confirmDialog({
      title: t("assembly.endAssembly"),
      body: `${t("assembly.confirmEnd")}

${t("assembly.endPrecheck", {
        agenda: `${done} / ${agendaItems || "—"}`,
        voting: state.session?.status === "Open" ? "1" : "0",
        motion: state.motion ? "1" : "0",
        speaker: speaker?.displayName || t("assembly.none"),
        participants: String(state.participants?.length ?? 0),
        status: statusLabel(status),
        quorum: quorumText
      })}`,
      confirmLabel: t("assembly.endAssembly"),
      danger: true
    });
    if (!ok) return;
    try {
      state.assembly = await api(`/api/assemblies/${assemblyId}/complete`, { method: "POST" });
      await rehydrate();
    } catch (error) {
      showError(error.message);
    }
  });
}

function localizeChrome() {
  qs("#heading-agenda").textContent = t("assembly.agenda");
  qs("#heading-motion").textContent = t("assembly.motion");
  qs("#heading-vote").textContent = t("assembly.voting");
  qs("#heading-speakers").textContent = t("assembly.speakers");
  qs("#btn-request-speak").textContent = t("assembly.requestSpeak");
  qs("#btn-start").textContent = t("assembly.startAssembly");
  qs("#btn-resume").textContent = t("assembly.resume");
  qs("#btn-pause").textContent = t("assembly.pause");
  qs("#btn-end").textContent = t("assembly.endAssembly");
  qs("#btn-logout").textContent = t("logout");
  qs("#link-dashboard").textContent = t("dashboard.title");
  qs("#link-dashboard").href = `/dashboard.html?assemblyId=${assemblyId}`;
}

async function init() {
  await initI18n();
  localizeChrome();

  if (!assemblyId) {
    showError(t("dashboard.missingId"));
    return;
  }

  try {
    state.user = await me();
  } catch {
    location.href = "/";
    return;
  }

  els.userChip.textContent = state.user.displayName;
  state.viewerRole = resolveViewerRole(state.user);
  applyRoleChrome();

  await rehydrate();

  state.hub = createAssemblyConnection({
    onConnectionState: setConnectionState,
    onReconnected: async () => {
      showToast(t("connection.restored"), "success");
      await rehydrate();
      // Governance resync must not require media; re-bootstrap media best-effort.
      try {
        await bootstrapMeeting();
      } catch {
        /* media optional */
      }
    },
    onReconnectError: (error) => showToast(error.message, "error"),
    quorumUpdated: (q) => {
      state.quorum = q;
      renderQuorum(els.quorum, q, { compact: true });
    },
    participantUpdated: (p) => {
      state.participants.set(p.userId, p);
      renderParticipants();
    },
    agendaUpdated: (a) => {
      state.agenda = a;
      refreshPanels();
    },
    speakerQueueUpdated: (q) => {
      state.queue = q;
      refreshPanels();
      syncPublishForFloor().catch(() => {});
    },
    motionUpdated: (m) => {
      state.motion = m;
      refreshPanels();
    },
    votingOpened: (s) => {
      state.session = s;
      state.tally = null;
      state.myVote = null;
      refreshPanels();
    },
    voteTallyUpdated: (tally) => {
      state.tally = tally;
      refreshPanels();
    },
    votingClosed: (result) => {
      state.session = { id: result.votingSessionId, status: "Closed", motionId: result.motionId };
      state.tally = result.tally;
      refreshPanels();
    },
    assemblyStatusChanged: (summary) => {
      state.assembly = { ...state.assembly, ...summary };
      refreshPanels();
    }
  });

  await state.hub.start(assemblyId);
  refreshPanels();
  await bootstrapMeeting();

  durationTimer = window.setInterval(tickDuration, 1000);
  tickDuration();

  qs("#btn-request-speak")?.addEventListener("click", async () => {
    try {
      await requestFloor(assemblyId, state.user.displayName);
      state.queue = await getQueue(assemblyId);
      refreshPanels();
      showError("");
    } catch (error) {
      showError(error.message);
    }
  });

  qs("#m-btn-speak")?.addEventListener("click", () => {
    qs("#btn-request-speak")?.click();
  });
  qs("#m-link-more")?.addEventListener("click", (event) => {
    event.preventDefault();
    const href = qs("#link-dashboard")?.getAttribute("href");
    if (href) location.href = href;
  });

  qs("#btn-logout")?.addEventListener("click", async () => {
    state.intentionalDisconnect = true;
    setConnectionLostVisible(false);
    await state.hub?.stop(assemblyId);
    await disconnectLiveKit();
    await logout();
    location.href = "/";
  });

  if (isOperator(state.user, { viewerRole: state.viewerRole })) {
    wireOperatorControls();
  }
}

init().catch((error) => {
  console.error(error);
  showError(error.message || t("networkError"));
});
