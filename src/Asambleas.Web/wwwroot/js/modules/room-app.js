import { api } from "./api.js";
import { hasPermission, logout, me } from "./auth.js";
import { createAssemblyConnection } from "./signalr-client.js";
import { historicalOverviewUrl, isTerminalStatus } from "./assembly-lifecycle.js";
import { renderQuorum } from "./quorum.js";
import { castVote, closeVoting, getMyVoteStatus, openVoting, renderVotePanel } from "./voting.js";
import { createLiveVotingWorkspace } from "./live-voting-workspace.js";
import {
  completeFloor,
  cancelOwnFloor,
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
  enumerateMediaDevices,
  fetchJoinToken,
  fetchRoomInfo,
  getLiveKitParticipantCounts,
  getLocalPublishIntent,
  getMediaConnectionState,
  highlightOfficialSpeaker,
  listIncidents,
  loadDevicePrefs,
  renderAvBlocked,
  setIncidentHandler,
  setLocalCameraEnabled,
  setLocalMicrophoneEnabled,
  setMediaViewMode,
  switchLocalDevices,
  syncHandRaisedIndicators,
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
import { ensureAssemblyIdOrRedirect } from "./assembly-context.js";

let assemblyId = assemblyIdFromUrl();

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
  intentionalDisconnect: false,
  recording: null,
  recordingStartedAt: null
};

let durationTimer = null;
let mediaControlsWired = false;
let recordingTimer = null;
let controlBarIdleTimer = null;

const liveWorkspace = createLiveVotingWorkspace({
  getAssemblyId: () => assemblyId,
  getUser: () => state.user,
  getAgenda: () => state.agenda,
  getMotions: () => null,
  getSession: () => state.session,
  getMotion: () => state.motion,
  refreshRoom: async () => {
    try {
      const room = await api(`/api/assemblies/${assemblyId}/room-state`);
      if (room?.motion) state.motion = room.motion;
      if (room?.session) state.session = room.session;
      if (room?.agenda) state.agenda = room.agenda;
    } catch {
      /* keep local */
    }
    refreshPanels();
  },
  onMotionChanged: () => refreshPanels()
});
let drawersWired = false;
let connectionLostTimer = null;

function speakerStatus(item) {
  return String(item?.status ?? item?.Status ?? "").toLowerCase();
}

function sameUserId(a, b) {
  if (a == null || b == null) return false;
  return String(a).replace(/-/g, "").toLowerCase() === String(b).replace(/-/g, "").toLowerCase();
}

function mySpeakerRequest() {
  const uid = state.user?.userId || state.user?.id;
  const name = state.user?.displayName;
  return (
    state.queue?.queue?.find((s) => {
      if (speakerStatus(s) !== "requested") return false;
      const sid = s.userId ?? s.UserId;
      const dname = s.displayName ?? s.DisplayName;
      return sameUserId(sid, uid) || (!!name && dname === name);
    }) || null
  );
}

function myGrantedFloor() {
  const current = state.queue?.queue?.find(
    (s) => s.id === state.queue.currentSpeakerRequestId || s.Id === state.queue.currentSpeakerRequestId
  );
  if (!current) return null;
  const uid = state.user?.userId || state.user?.id;
  const sid = current.userId ?? current.UserId;
  const dname = current.displayName ?? current.DisplayName;
  if (sameUserId(sid, uid) || dname === state.user?.displayName) {
    return current;
  }
  return null;
}

function requestedHands() {
  return (state.queue?.queue || []).filter((s) => speakerStatus(s) === "requested");
}

function closeMeetingDrawers() {
  ["#participants-drawer", "#speaker-queue-drawer", "#more-menu-drawer"].forEach((sel) => {
    const el = qs(sel);
    if (el) el.hidden = true;
  });
  const backdrop = qs("#meeting-drawer-backdrop");
  if (backdrop) backdrop.hidden = true;
  document.body.classList.remove("meeting-drawer-open");
}

function openMeetingDrawer(id) {
  closeMeetingDrawers();
  const el = qs(id);
  const backdrop = qs("#meeting-drawer-backdrop");
  if (!el) return;
  el.hidden = false;
  if (backdrop) backdrop.hidden = false;
  document.body.classList.add("meeting-drawer-open");
  el.querySelector("button, [href], input, select")?.focus?.();
}

function revealControlBar() {
  const bar = qs("#meeting-control-bar");
  if (!bar) return;
  bar.classList.remove("is-hidden");
  bar.classList.add("is-visible");
  if (controlBarIdleTimer) clearTimeout(controlBarIdleTimer);
  const pinned =
    state.session?.status === "Open" ||
    bar.dataset.autohide !== "true" ||
    window.matchMedia("(max-width: 767px)").matches ||
    document.body.classList.contains("meeting-drawer-open");
  if (pinned) return;
  controlBarIdleTimer = window.setTimeout(() => {
    if (document.activeElement?.closest?.("#meeting-control-bar")) return;
    bar.classList.add("is-hidden");
    bar.classList.remove("is-visible");
  }, 3500);
}

function syncMeetingControlBar() {
  const micBtn = qs("#btn-mic");
  const camBtn = qs("#btn-cam");
  const handBtn = qs("#btn-hand");
  const queueBtn = qs("#btn-queue");
  const peopleBadge = qs("#people-count-badge");
  const queueBadge = qs("#queue-count-badge");
  const intent = getLocalPublishIntent();
  const micOn = Boolean(intent.mic);
  const camOn = Boolean(intent.camera);
  const handUp = Boolean(mySpeakerRequest());
  const hasFloor = Boolean(myGrantedFloor());
  const hands = requestedHands();
  const people = state.participants.size;

  if (micBtn) {
    micBtn.setAttribute("aria-pressed", String(micOn));
    micBtn.setAttribute("aria-label", micOn ? t("lobby.muteMic") : t("lobby.unmuteMic"));
    micBtn.classList.toggle("is-off", !micOn);
    micBtn.title = micOn ? t("lobby.muteMic") : t("lobby.unmuteMic");
  }
  if (camBtn) {
    camBtn.setAttribute("aria-pressed", String(camOn));
    camBtn.setAttribute(
      "aria-label",
      camOn ? t("lobby.turnCameraOff") : t("lobby.turnCameraOn")
    );
    camBtn.classList.toggle("is-off", !camOn);
    camBtn.title = camOn ? t("lobby.turnCameraOff") : t("lobby.turnCameraOn");
  }
  if (handBtn) {
    const pressed = handUp || hasFloor;
    // Always clear disabled when only hand-up (allow lower); keep disabled with floor.
    handBtn.disabled = Boolean(hasFloor);
    handBtn.setAttribute("aria-pressed", String(pressed));
    handBtn.classList.toggle("is-active", handUp && !hasFloor);
    handBtn.classList.toggle("has-floor", hasFloor);
    const handLabel = hasFloor
      ? t("assembly.youHaveFloor")
      : handUp
        ? t("assembly.lowerHand")
        : t("assembly.raiseHand");
    handBtn.setAttribute("aria-label", handLabel);
    handBtn.title = handLabel;
    const label = handBtn.querySelector(".mcb-label");
    if (label) {
      label.textContent = hasFloor
        ? t("assembly.floorShort") || "Palabra"
        : handUp
          ? t("assembly.lowerHandShort") || "Bajar"
          : t("assembly.raiseHandShort") || "Palabra";
    }
    handBtn.dataset.handState = hasFloor ? "floor" : handUp ? "raised" : "idle";
  }
  if (queueBtn) {
    const canMod = hasPermission(state.user, "meeting:moderate");
    queueBtn.hidden = !canMod;
    if (queueBadge) {
      queueBadge.hidden = hands.length === 0;
      queueBadge.textContent = String(hands.length);
    }
    queueBtn.setAttribute(
      "aria-label",
      `${t("assembly.speakerRequests") || "Solicitudes de palabra"}${hands.length ? ` ${hands.length}` : ""}`
    );
  }
  if (peopleBadge) {
    peopleBadge.hidden = people === 0;
    peopleBadge.textContent = String(people);
  }
  const peopleBtn = qs("#btn-people");
  if (peopleBtn) {
    peopleBtn.setAttribute(
      "aria-label",
      `${t("assembly.participants")}${people ? ` ${people}` : ""}`
    );
  }

  const votingChip = qs("#voting-open-chip");
  if (votingChip) votingChip.hidden = state.session?.status !== "Open";

  const endMore = qs("#btn-end-more");
  if (endMore) {
    const canClose = hasPermission(state.user, "assembly:close");
    const status = state.assembly?.status;
    endMore.hidden = !(canClose && (status === "InProgress" || status === "Paused"));
  }

  syncGovernanceSpeakerChip();
  syncHandTiles();
  revealControlBar();
}

function syncGovernanceSpeakerChip() {
  const chip = qs("#governance-speaker-chip");
  if (!chip) return;
  const current = state.queue?.queue?.find((s) => s.id === state.queue.currentSpeakerRequestId);
  if (!current) {
    chip.hidden = true;
    chip.innerHTML = "";
    return;
  }
  const participant = [...state.participants.values()].find((p) => p.userId === current.userId);
  chip.hidden = false;
  chip.innerHTML = `
    <span class="gsc-eyebrow">${escapeHtml(t("assembly.hasFloor") || "TIENE LA PALABRA")}</span>
    <strong>${escapeHtml(current.displayName)}</strong>
    <span class="gsc-meta">${escapeHtml(participant?.unitCode || "")}</span>`;
}

function syncHandTiles() {
  const ids = requestedHands().map((s) => s.userId).filter(Boolean);
  syncHandRaisedIndicators(els.video, ids);
}

function renderParticipantsDrawer() {
  const body = qs("#participants-drawer-body");
  if (!body) return;
  const items = [...state.participants.values()];
  const currentId = state.queue?.currentSpeakerRequestId;
  const hands = new Set(requestedHands().map((s) => s.userId));
  if (!items.length) {
    body.innerHTML = `<div class="empty-state">${escapeHtml(t("assembly.noParticipants"))}</div>`;
    return;
  }
  const roleRank = (p) => {
    const r = String(p.role || p.assemblyRole || "").toLowerCase();
    if (r.includes("president")) return 0;
    if (r.includes("secretary") || r.includes("secretario")) return 1;
    if (r.includes("represent")) return 3;
    return 2;
  };
  items.sort((a, b) => roleRank(a) - roleRank(b) || String(a.displayName || "").localeCompare(b.displayName || ""));
  body.innerHTML = `
    <ul class="meeting-people-list">
      ${items
        .map((p) => {
          const hasFloor = state.queue?.queue?.some(
            (s) => s.id === currentId && s.userId === p.userId
          );
          const hand = hands.has(p.userId);
          const role = p.role || p.assemblyRole || p.presenceType || "";
          return `<li class="${hasFloor ? "has-floor" : ""} ${hand ? "hand-up" : ""}">
            <div>
              <strong>${escapeHtml(p.displayName || "—")}</strong>
              <span class="muted">${escapeHtml(p.unitCode || "—")} · ${escapeHtml(role || "—")}</span>
            </div>
            <div class="meeting-people-flags" aria-label="Estados">
              ${hand ? `<span title="${escapeHtml(t("assembly.raiseHand"))}">✋</span>` : ""}
              ${hasFloor ? `<span class="flag-floor">${escapeHtml(t("assembly.hasFloor") || "Palabra")}</span>` : ""}
              <span class="muted">${escapeHtml(p.connectionStatus || p.attendanceStatus || "")}</span>
            </div>
          </li>`;
        })
        .join("")}
    </ul>`;
}

function renderQueueDrawer() {
  const root = qs("#speaker-queue-drawer-list");
  if (!root) return;
  const canModerate = hasPermission(state.user, "meeting:moderate");
  const active = {
    ...state.queue,
    queue: (state.queue?.queue || []).filter(
      (s) => s.status === "Requested" || s.status === "Granted"
    )
  };
  renderSpeakerQueue(root, active, {
    canModerate,
    onGrant: async (id) => {
      try {
        await grantFloor(assemblyId, id);
        state.queue = await getQueue(assemblyId);
        refreshPanels();
        renderQueueDrawer();
        syncMeetingControlBar();
      } catch (error) {
        showError(error.message);
      }
    },
    onComplete: async (id) => {
      try {
        await completeFloor(assemblyId, id);
        state.queue = await getQueue(assemblyId);
        refreshPanels();
        renderQueueDrawer();
        syncMeetingControlBar();
      } catch (error) {
        showError(error.message);
      }
    },
    onReject: async (id) => {
      try {
        await rejectFloor(assemblyId, id);
        state.queue = await getQueue(assemblyId);
        refreshPanels();
        renderQueueDrawer();
        syncMeetingControlBar();
      } catch (error) {
        showError(error.message);
      }
    },
    onSkip: async (id) => {
      try {
        await skipFloor(assemblyId, id);
        state.queue = await getQueue(assemblyId);
        refreshPanels();
        renderQueueDrawer();
        syncMeetingControlBar();
      } catch (error) {
        showError(error.message);
      }
    }
  });
}

function wireMeetingDrawers() {
  if (drawersWired) return;
  drawersWired = true;
  qs("#meeting-drawer-backdrop")?.addEventListener("click", closeMeetingDrawers);
  document.querySelectorAll("[data-close-drawer]").forEach((btn) => {
    btn.addEventListener("click", closeMeetingDrawers);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMeetingDrawers();
  });
  qs("#btn-people")?.addEventListener("click", () => {
    renderParticipantsDrawer();
    openMeetingDrawer("#participants-drawer");
  });
  qs("#btn-queue")?.addEventListener("click", () => {
    renderQueueDrawer();
    openMeetingDrawer("#speaker-queue-drawer");
  });
  qs("#btn-more")?.addEventListener("click", () => openMeetingDrawer("#more-menu-drawer"));
  qs("#btn-hand")?.addEventListener("click", async () => {
    if (myGrantedFloor()) return;
    const btn = qs("#btn-hand");
    if (btn) btn.disabled = true;
    try {
      if (mySpeakerRequest()) {
        await cancelOwnFloor(assemblyId);
      } else {
        await requestFloor(assemblyId, state.user.displayName);
      }
      state.queue = await getQueue(assemblyId);
      refreshPanels();
      syncMeetingControlBar();
      showError("");
    } catch (error) {
      showError(error.message);
      syncMeetingControlBar();
    } finally {
      if (btn && !myGrantedFloor()) btn.disabled = false;
    }
  });
  qs("#btn-leave")?.addEventListener("click", async () => {
    const ok = await confirmDialog({
      title: t("assembly.leaveMeeting") || "Salir de la reunión",
      body:
        t("assembly.confirmLeave") ||
        "Saldrá de la videoconferencia. La asamblea continúa; no se finaliza la sesión.",
      confirmLabel: t("assembly.leaveMeeting") || "Salir"
    });
    if (!ok) return;
    state.intentionalDisconnect = true;
    setConnectionLostVisible(false);
    closeMeetingDrawers();
    await state.hub?.stop(assemblyId);
    await disconnectLiveKit();
    location.href = `/lobby.html?assemblyId=${assemblyId}`;
  });
  qs("#btn-end-more")?.addEventListener("click", () => {
    closeMeetingDrawers();
    qs("#btn-end")?.click();
  });
  qs("#btn-device-settings")?.addEventListener("click", async () => {
    closeMeetingDrawers();
    await openDeviceSettings();
  });
  qs("#more-link-dashboard")?.setAttribute("href", `/dashboard.html?assemblyId=${assemblyId}`);
  ["pointermove", "pointerdown", "keydown", "focusin"].forEach((ev) => {
    document.addEventListener(ev, () => revealControlBar(), { passive: true });
  });
}

async function openDeviceSettings() {
  const dialog = qs("#device-settings-dialog");
  if (!dialog) return;
  const devices = await enumerateMediaDevices();
  const prefs = loadDevicePrefs();
  const fill = (sel, list, selected) => {
    const el = qs(sel);
    if (!el) return;
    el.innerHTML = list
      .map(
        (d) =>
          `<option value="${escapeHtml(d.deviceId)}" ${d.deviceId === selected ? "selected" : ""}>${escapeHtml(d.label || d.deviceId.slice(0, 8))}</option>`
      )
      .join("");
  };
  fill("#device-mic-select", devices.mics, prefs.micId);
  fill("#device-cam-select", devices.cameras, prefs.cameraId);
  const speakerWrap = qs("#device-speaker-wrap");
  if (speakerWrap) speakerWrap.hidden = !devices.supportsSinkId || !devices.speakers.length;
  fill("#device-speaker-select", devices.speakers, prefs.speakerId);
  const hint = qs("#device-settings-hint");
  if (hint) {
    hint.textContent =
      t("media.deviceSettingsHint") ||
      "Los cambios se aplican sin salir de la reunión.";
  }
  dialog.showModal();
  dialog.addEventListener(
    "close",
    async () => {
      if (dialog.returnValue !== "ok") return;
      const micId = qs("#device-mic-select")?.value;
      const cameraId = qs("#device-cam-select")?.value;
      const speakerId = qs("#device-speaker-select")?.value;
      const result = await switchLocalDevices({ micId, cameraId, speakerId });
      if (!result.ok) showToast(t("media.publishFailed"), "warn");
      else showToast(t("media.devicesUpdated") || "Dispositivos actualizados", "success");
      syncMeetingControlBar();
    },
    { once: true }
  );
}

function setMediaBusy(message) {
  const el = qs("#media-busy-hint");
  if (!el) return;
  if (!message) {
    el.hidden = true;
    el.textContent = "";
    return;
  }
  el.hidden = false;
  el.textContent = message;
}

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

  // Keep the room usable during SignalR reconnect — fullscreen only on hard drop.
  if (connectionLostTimer) {
    clearTimeout(connectionLostTimer);
    connectionLostTimer = null;
  }
  if (state.intentionalDisconnect || status === "connected" || status === "reconnecting") {
    setConnectionLostVisible(false);
    return;
  }
  if (status === "disconnected") {
    connectionLostTimer = window.setTimeout(() => {
      if (!state.intentionalDisconnect) {
        setConnectionLostVisible(true);
      }
    }, 4000);
  }
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
  const recControls = qs("#recording-controls");
  if (recControls) {
    recControls.hidden = !hasPermission(state.user, "recording:control");
  }
  const exp = qs("#link-expediente");
  if (exp) {
    exp.href = `/expediente.html?assemblyId=${assemblyId}`;
    exp.hidden = !hasPermission(state.user, "expediente:view");
  }
  const studio = qs("#link-studio");
  if (studio) {
    studio.href = `/voting-studio.html?assemblyId=${assemblyId}`;
    studio.hidden = !hasPermission(state.user, "motion:create");
  }
}

function syncRecordingBanner() {
  const banner = qs("#recording-banner");
  const timer = qs("#recording-timer");
  const active =
    state.recording &&
    ["Recording", "Starting", "Processing"].includes(state.recording.status);
  if (banner) banner.hidden = !active;
  qs("#btn-rec-start") && (qs("#btn-rec-start").hidden = Boolean(active));
  qs("#btn-rec-stop") && (qs("#btn-rec-stop").hidden = !active || state.recording?.status === "Processing");
  if (recordingTimer) {
    clearInterval(recordingTimer);
    recordingTimer = null;
  }
  if (active && state.recording?.startedAtUtc) {
    const started = new Date(state.recording.startedAtUtc).getTime();
    const tick = () => {
      const sec = Math.max(0, Math.floor((Date.now() - started) / 1000));
      const h = String(Math.floor(sec / 3600)).padStart(2, "0");
      const m = String(Math.floor((sec % 3600) / 60)).padStart(2, "0");
      const s = String(sec % 60).padStart(2, "0");
      if (timer) timer.textContent = `${h}:${m}:${s}`;
    };
    tick();
    recordingTimer = window.setInterval(tick, 1000);
  } else if (timer) {
    timer.textContent = "";
  }
}

async function hydrateRecording() {
  try {
    const list = await api(`/api/assemblies/${assemblyId}/recordings`);
    state.recording =
      (list || []).find((r) => ["Recording", "Starting", "Processing"].includes(r.status)) ||
      (list || [])[0] ||
      null;
    syncRecordingBanner();
  } catch {
    /* optional */
  }
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
  if (isTerminalStatus(status)) {
    location.replace(historicalOverviewUrl(assemblyId, status));
    return;
  }
  const mode =
    status === "InProgress" ? "live" : status === "Paused" ? "paused" : "prep";
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
  const current = state.queue?.queue?.find((s) => s.id === state.queue.currentSpeakerRequestId);
  const isMine = Boolean(myGrantedFloor());
  const myRequest = mySpeakerRequest();

  if (isMine) {
    banner.hidden = false;
    banner.innerHTML = `<strong>${escapeHtml(t("assembly.youHaveFloor"))}</strong>
      <span class="muted">${escapeHtml(t("assembly.floorVsMic") || "Gobernanza · distinto del micrófono")}</span>`;
    banner.classList.add("is-active");
  } else if (myRequest) {
    banner.hidden = false;
    const pos = myRequest.queueOrder ?? myRequest.QueueOrder ?? "—";
    banner.innerHTML = `<strong>${escapeHtml(t("assembly.handRaised") || "Mano levantada")}</strong>
      <span>${escapeHtml(t("assembly.queuePosition", { n: pos }))}</span>`;
    banner.classList.remove("is-active");
  } else if (current && state.viewerRole === "Operator") {
    banner.hidden = true;
  } else {
    banner.hidden = true;
    banner.classList.remove("is-active");
  }
  syncMeetingControlBar();
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
    myStatus: state.myVoteStatus || null,
    motion: state.motion,
    canCast: hasPermission(state.user, "vote:cast"),
    canOpen:
      operator &&
      hasPermission(state.user, "vote:open") &&
      state.motion?.status === "Presented" &&
      state.session?.status !== "Open",
    canClose: operator && hasPermission(state.user, "vote:close"),
    operatorView: operator,
    eligibleVoters:
      state.session?.eligibleVoters ??
      state.tally?.eligibleVoters ??
      state.quorum?.eligibleUnits ??
      (state.participants.size || null),
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
        state.myVoteStatus = status;
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
    onOpen: async (policy = "HiddenUntilClose") => {
      if (!state.motion) {
        showError(t("assembly.noMotion"));
        return;
      }
      const ok = await confirmDialog({
        title: t("assembly.openVoting"),
        body: t("assembly.confirmOpenVoting"),
        confirmLabel: t("voting.open"),
        cancelLabel: t("cancel")
      });
      if (!ok) return;
      const hidePartial = policy !== "LiveResults";
      state.session = await openVoting(assemblyId, state.motion.id, hidePartial, policy);
      state.tally = {
        votesCast: 0,
        eligibleVoters: state.session.eligibleVoters,
        eligibleCoefficient: state.session.eligibleCoefficient,
        trendHidden: policy !== "LiveResults",
        resultVisibilityPolicy: policy
      };
      state.myVote = null;
      refreshPanels();
    },
    onClose: async () => {
      const cast = state.tally?.votesCast ?? 0;
      const eligible = state.session?.eligibleVoters ?? state.tally?.eligibleVoters ?? "—";
      const pending =
        typeof eligible === "number" ? Math.max(0, eligible - cast) : "—";
      const ok = await confirmDialog({
        title: t("assembly.closeVoting"),
        body: `${t("assembly.confirmCloseVoting")}\n\n${t("voting.votesReceived")}: ${cast} / ${eligible}\n${t("voting.pending")}: ${pending}`,
        confirmLabel: t("voting.close"),
        danger: true
      });
      if (!ok) return;
      const result = await closeVoting(assemblyId, state.session.id);
      state.session = { ...state.session, status: "Closed" };
      state.tally = result.tally;
      refreshPanels();
    }
  });

  if (operator && els.vote) {
    liveWorkspace.mountOperatorChrome(els.vote);
    liveWorkspace.syncLockBanner(els.vote);
  }

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
  state.myVoteStatus = room.myVoteStatus || state.myVoteStatus || null;
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
      showToast(t("assembly.youHaveFloor"), "success");
    } catch (error) {
      showToast(error.message || t("media.publishFailed"), "error");
      renderIncidentStrip();
    }
  }
  renderMediaCockpit();
  renderIncidentStrip();
  updateMediaConnectionBanner();
  syncMeetingControlBar();
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
    wireMeetingDrawers();
    if (micBtn) {
      micBtn.addEventListener("click", async () => {
        const next = micBtn.getAttribute("aria-pressed") !== "true";
        setMediaBusy(next ? t("media.connectingMic") || "Conectando micrófono…" : "");
        micBtn.disabled = true;
        try {
          const result = await setLocalMicrophoneEnabled(next);
          if (!result.ok) {
            if (result.code === "PERMISSION_DENIED") {
              showToast(
                t("media.permissionDenied") ||
                  "Micrófono bloqueado por el navegador. Revise la configuración del sitio.",
                "error"
              );
            } else {
              showToast(t("media.publishFailed"), "warn");
            }
          }
          await unlockRemoteAudio();
        } finally {
          micBtn.disabled = false;
          setMediaBusy("");
          syncMeetingControlBar();
        }
      });
    }
    if (camBtn) {
      camBtn.addEventListener("click", async () => {
        const next = camBtn.getAttribute("aria-pressed") !== "true";
        setMediaBusy(next ? t("media.activatingCamera") || "Activando cámara…" : "");
        camBtn.disabled = true;
        try {
          const result = await setLocalCameraEnabled(next);
          if (!result.ok) {
            if (result.code === "PERMISSION_DENIED") {
              showToast(
                t("media.permissionDenied") ||
                  "Cámara bloqueada por el navegador. Revise la configuración del sitio.",
                "error"
              );
            } else {
              showToast(t("media.publishFailed"), "warn");
            }
          }
          await unlockRemoteAudio();
        } finally {
          camBtn.disabled = false;
          setMediaBusy("");
          syncMeetingControlBar();
        }
      });
    }
    qs("#btn-view-grid")?.addEventListener("click", () => {
      setMediaViewMode("grid");
      qs("#btn-view-grid")?.setAttribute("aria-pressed", "true");
      qs("#btn-view-focus")?.setAttribute("aria-pressed", "false");
      closeMeetingDrawers();
    });
    qs("#btn-view-focus")?.addEventListener("click", () => {
      setMediaViewMode("focus");
      qs("#btn-view-grid")?.setAttribute("aria-pressed", "false");
      qs("#btn-view-focus")?.setAttribute("aria-pressed", "true");
      closeMeetingDrawers();
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
      closeMeetingDrawers();
    });
    qs("#btn-leave-media")?.addEventListener("click", async () => {
      await disconnectLiveKit();
      if (els.video) {
        els.video.innerHTML = `<div class="empty-state" role="status"><p>${escapeHtml(t("media.leftMedia") || "Audio/video desconectado.")}</p><p class="muted">${escapeHtml(t("media.governanceOnly"))}</p></div>`;
      }
      updateMediaConnectionBanner();
      renderMediaCockpit();
      syncMeetingControlBar();
      closeMeetingDrawers();
    });
    document.addEventListener(
      "pointerdown",
      () => {
        unlockRemoteAudio().catch(() => {});
      },
      { once: true, passive: true }
    );
  }

  try {
    if (isTerminalStatus(state.assembly?.status)) {
      renderAvBlocked(els.video, "Asamblea finalizada — modo consulta.");
      updateMediaConnectionBanner();
      return;
    }

    const info = await fetchRoomInfo(assemblyId);
    if (!info.isAvailable) {
      renderAvBlocked(els.video, info.unavailableReason || t("lobby.avBlocked"));
      updateMediaConnectionBanner();
      return;
    }

    const token = await fetchJoinToken(assemblyId);
    const { identity } = syncOfficialSpeakerHighlight();
    const canPublish = Boolean(token.canPublish);
    const wantCam = prefs.cameraEnabled !== false;
    const wantMic = prefs.micEnabled !== false;
    await connectLiveKit(els.video, token, {
      enableCamera: wantCam && canPublish,
      enableMic: wantMic && canPublish,
      officialSpeakerIdentity: identity
    });
    if (identity) setMediaViewMode("focus");
    syncHandTiles();
  } catch (error) {
    renderAvBlocked(els.video, error.message || t("lobby.avBlocked"));
  }
  updateMediaConnectionBanner();
  renderMediaCockpit();
  renderIncidentStrip();
  syncMeetingControlBar();
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
      body: `Al finalizar:
• se cerrará la operación en vivo;
• no se podrán emitir nuevos votos;
• el quórum quedará sellado;
• la asamblea pasará a modo histórico.

${t("assembly.confirmEnd")}

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
      danger: true,
      typeConfirm: "FINALIZAR"
    });
    if (!ok) return;
    const endBtn = qs("#btn-end");
    try {
      const { runWithButton } = await import("./loading.js");
      await runWithButton(endBtn, "Finalizando…", async () => {
        state.assembly = await api(`/api/assemblies/${assemblyId}/complete`, { method: "POST" });
        await rehydrate();
        showToast({
          title: "Asamblea finalizada",
          message: "La asamblea quedó en modo consulta histórico.",
          variant: "success"
        });
      });
    } catch (error) {
      showError(error.message);
      showToast({ title: "No se pudo finalizar", message: error.message, variant: "error", correlationId: error.correlationId });
    }
  });

  qs("#btn-rec-start")?.addEventListener("click", async () => {
    try {
      state.recording = await api(`/api/assemblies/${assemblyId}/recording/start`, { method: "POST" });
      syncRecordingBanner();
      showToast("Grabación iniciada", "success");
    } catch (error) {
      showError(error.message);
    }
  });
  qs("#btn-rec-stop")?.addEventListener("click", async () => {
    if (!state.recording?.id) return;
    const ok = await confirmDialog({
      title: "Detener grabación",
      body: "¿Detener la grabación de esta sesión?",
      confirmLabel: "Detener",
      danger: true
    });
    if (!ok) return;
    try {
      state.recording = await api(
        `/api/assemblies/${assemblyId}/recording/${state.recording.id}/stop`,
        { method: "POST" }
      );
      syncRecordingBanner();
      showToast("Grabación detenida / procesando", "info");
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
  qs("#btn-start").textContent = t("assembly.startAssembly");
  qs("#btn-resume").textContent = t("assembly.resume");
  qs("#btn-pause").textContent = t("assembly.pause");
  qs("#btn-end").textContent = t("assembly.endAssembly");
  qs("#btn-logout").textContent = t("logout");
  qs("#link-dashboard").textContent = t("dashboard.title");
  qs("#link-dashboard").href = `/dashboard.html?assemblyId=${assemblyId}`;
  qs("#more-link-dashboard")?.setAttribute("href", `/dashboard.html?assemblyId=${assemblyId}`);
}

async function init() {
  await initI18n();
  localizeChrome();

  if (!assemblyId) {
    assemblyId = await ensureAssemblyIdOrRedirect();
    if (!assemblyId) {
      showError(t("dashboard.missingId"));
      return;
    }
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
      state.tally = {
        votesCast: 0,
        eligibleVoters: s.eligibleVoters,
        eligibleCoefficient: s.eligibleCoefficient,
        trendHidden: (s.resultVisibilityPolicy || "HiddenUntilClose") !== "LiveResults",
        resultVisibilityPolicy: s.resultVisibilityPolicy
      };
      state.myVote = null;
      state.myVoteStatus = null;
      refreshPanels();
      if (hasPermission(state.user, "vote:cast") && s?.id) {
        getMyVoteStatus(assemblyId, s.id)
          .then((st) => {
            state.myVoteStatus = st;
            refreshPanels();
          })
          .catch(() => {});
      }
    },
    voteTallyUpdated: async (tally) => {
      state.tally = tally;
      const policy =
        state.session?.resultVisibilityPolicy ||
        tally?.resultVisibilityPolicy ||
        "HiddenUntilClose";
      if (
        policy === "PresidentOnlyLive" &&
        (hasPermission(state.user, "vote:open") || hasPermission(state.user, "vote:close")) &&
        state.session?.id
      ) {
        try {
          const { getResults } = await import("./voting.js");
          state.tally = await getResults(assemblyId, state.session.id);
        } catch {
          /* keep participation pulse */
        }
      }
      refreshPanels();
    },
    votingClosed: (result) => {
      state.session = {
        ...state.session,
        id: result.votingSessionId,
        status: "Closed",
        motionId: result.motionId
      };
      state.tally = result.tally;
      refreshPanels();
      liveWorkspace.handleRealtime("votingClosed");
    },
    votingCancelled: (session) => {
      state.session = session;
      state.myVote = null;
      state.myVoteStatus = null;
      state.tally = null;
      showToast(
        session?.cancellationReason
          ? `Votación anulada: ${session.cancellationReason}`
          : "Votación anulada. Espere la nueva versión.",
        "info"
      );
      refreshPanels();
      liveWorkspace.handleRealtime("votingCancelled");
    },
    votingVersionCreated: (motion) => {
      showToast(
        `Nueva versión disponible: ${motion?.code || ""} v${motion?.versionNumber || ""}`,
        "success"
      );
      liveWorkspace.handleRealtime("votingVersionCreated");
      refreshPanels();
    },
    assemblyStatusChanged: (summary) => {
      state.assembly = { ...state.assembly, ...summary };
      refreshPanels();
    },
    recordingUpdated: (rec) => {
      state.recording = rec;
      syncRecordingBanner();
    }
  });

  await state.hub.start(assemblyId);
  refreshPanels();
  await hydrateRecording();
  await bootstrapMeeting();

  durationTimer = window.setInterval(tickDuration, 1000);
  tickDuration();
  wireMeetingDrawers();
  syncMeetingControlBar();

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
