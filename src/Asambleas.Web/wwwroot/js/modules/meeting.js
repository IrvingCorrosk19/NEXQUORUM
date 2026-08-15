import { api } from "./api.js";
import { t } from "../i18n/i18n.js";
import { escapeHtml } from "./ui.js";

const DEVICE_PREFS_KEY = "asambleas.media.devicePrefs";

let liveKitRoom = null;
let previewStream = null;
let micAnalyser = null;
let micAudioCtx = null;
let mediaIncidents = [];
let onIncidentChange = null;
let mediaConnectionState = "idle";
let localPublishIntent = { camera: false, mic: false };
let mediaContainer = null;
let officialSpeakerIdentity = null;
let viewMode = "grid"; // grid | focus

export function getMediaConnectionState() {
  return mediaConnectionState;
}

export function getMediaViewMode() {
  return viewMode;
}

export function setIncidentHandler(handler) {
  onIncidentChange = typeof handler === "function" ? handler : null;
}

function pushIncident(id, message, severity = "warn") {
  const existing = mediaIncidents.find((i) => i.id === id);
  if (existing) {
    existing.message = message;
    existing.severity = severity;
    existing.at = Date.now();
  } else {
    mediaIncidents.push({ id, message, severity, at: Date.now() });
  }
  onIncidentChange?.(listIncidents());
}

function clearIncident(id) {
  mediaIncidents = mediaIncidents.filter((i) => i.id !== id);
  onIncidentChange?.(listIncidents());
}

export function listIncidents() {
  return [...mediaIncidents];
}

export function loadDevicePrefs() {
  try {
    return JSON.parse(sessionStorage.getItem(DEVICE_PREFS_KEY) || "{}") || {};
  } catch {
    return {};
  }
}

export function saveDevicePrefs(prefs) {
  const next = { ...loadDevicePrefs(), ...prefs };
  sessionStorage.setItem(DEVICE_PREFS_KEY, JSON.stringify(next));
  return next;
}

export async function fetchJoinToken(assemblyId) {
  return api(`/api/assemblies/${assemblyId}/meeting/join-token`, {
    method: "POST"
  });
}

export async function fetchRoomInfo(assemblyId) {
  return api(`/api/assemblies/${assemblyId}/meeting/room`);
}

export async function enumerateMediaDevices() {
  if (!navigator.mediaDevices?.enumerateDevices) {
    return { cameras: [], mics: [], speakers: [], supportsSinkId: false };
  }
  const devices = await navigator.mediaDevices.enumerateDevices();
  const supportsSinkId =
    typeof HTMLMediaElement !== "undefined" &&
    typeof HTMLMediaElement.prototype.setSinkId === "function";
  return {
    cameras: devices.filter((d) => d.kind === "videoinput"),
    mics: devices.filter((d) => d.kind === "audioinput"),
    speakers: supportsSinkId ? devices.filter((d) => d.kind === "audiooutput") : [],
    supportsSinkId
  };
}

function constraintsFromPrefs({ camera = true, mic = true } = {}) {
  const prefs = loadDevicePrefs();
  const video = camera
    ? prefs.cameraId
      ? { deviceId: { ideal: prefs.cameraId } }
      : { facingMode: "user" }
    : false;
  const audio = mic
    ? prefs.micId
      ? { deviceId: { ideal: prefs.micId } }
      : true
    : false;
  return { video, audio };
}

export async function startDevicePreview(videoEl, { camera = true, mic = true } = {}) {
  stopDevicePreview(videoEl);
  stopMicMeter();

  if (!navigator.mediaDevices?.getUserMedia) {
    return {
      stream: null,
      error: t("lobby.avBlocked"),
      camera: false,
      mic: false,
      cameraDenied: false,
      micDenied: false
    };
  }

  try {
    previewStream = await navigator.mediaDevices.getUserMedia(
      constraintsFromPrefs({ camera, mic })
    );

    if (videoEl) {
      videoEl.srcObject = previewStream;
      videoEl.muted = true;
      videoEl.playsInline = true;
      await videoEl.play().catch(() => {});
    }

    if (mic && previewStream.getAudioTracks().length) {
      startMicMeter(previewStream);
    }

    return {
      stream: previewStream,
      error: null,
      camera: camera && previewStream.getVideoTracks().some((tr) => tr.enabled),
      mic: mic && previewStream.getAudioTracks().some((tr) => tr.enabled),
      cameraDenied: false,
      micDenied: false
    };
  } catch (error) {
    const denied = error?.name === "NotAllowedError" || error?.name === "PermissionDeniedError";
    const noDevice = error?.name === "NotFoundError" || error?.name === "DevicesNotFoundError";
    return {
      stream: null,
      error: denied
        ? t("lobby.avDenied")
        : noDevice
          ? t("lobby.noDevice")
          : t("lobby.avBlocked"),
      camera: false,
      mic: false,
      cameraDenied: denied,
      micDenied: denied
    };
  }
}

export function setPreviewTracks({ camera, mic }) {
  if (!previewStream) return;
  previewStream.getVideoTracks().forEach((tr) => {
    tr.enabled = Boolean(camera);
  });
  previewStream.getAudioTracks().forEach((tr) => {
    tr.enabled = Boolean(mic);
  });
}

export function stopDevicePreview(videoEl) {
  stopMicMeter();
  if (previewStream) {
    previewStream.getTracks().forEach((tr) => tr.stop());
    previewStream = null;
  }
  if (videoEl) videoEl.srcObject = null;
}

function startMicMeter(stream) {
  try {
    micAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const source = micAudioCtx.createMediaStreamSource(stream);
    micAnalyser = micAudioCtx.createAnalyser();
    micAnalyser.fftSize = 256;
    source.connect(micAnalyser);
  } catch {
    micAnalyser = null;
  }
}

function stopMicMeter() {
  if (micAudioCtx) {
    micAudioCtx.close().catch(() => {});
    micAudioCtx = null;
  }
  micAnalyser = null;
}

export function getMicLevel() {
  if (!micAnalyser) return 0;
  const data = new Uint8Array(micAnalyser.frequencyBinCount);
  micAnalyser.getByteFrequencyData(data);
  let sum = 0;
  for (const v of data) sum += v;
  return Math.min(1, sum / (data.length * 128));
}

function setMediaState(next) {
  mediaConnectionState = next;
}

function updateGridLayout(container) {
  if (!container) return;
  const tiles = [...container.querySelectorAll(".media-tile")];
  const n = tiles.length;
  container.dataset.count = String(n);
  container.classList.toggle("is-empty", n === 0);
  container.classList.toggle("is-solo", n === 1);
  container.classList.toggle("is-pair", n === 2);
  container.classList.toggle("is-quad", n >= 3 && n <= 4);
  container.classList.toggle("is-oct", n >= 5 && n <= 8);
  container.classList.toggle("is-crowd", n > 8);
  container.classList.toggle("view-focus", viewMode === "focus");
  container.classList.toggle("view-grid", viewMode === "grid");

  let empty = container.querySelector(".media-empty-hint");
  if (n <= 1) {
    if (!empty) {
      empty = document.createElement("p");
      empty.className = "media-empty-hint";
      empty.setAttribute("role", "status");
      container.appendChild(empty);
    }
    empty.textContent =
      n === 0
        ? t("media.waitingParticipants") || "Esperando participantes…"
        : t("media.firstParticipant") || "Eres el primer participante. Esperando a los demás…";
  } else if (empty) {
    empty.remove();
  }
}

function ensureTile(container, identity, label, { isLocal = false } = {}) {
  let tile = container.querySelector(`[data-identity="${CSS.escape(identity)}"]`);
  if (!tile) {
    tile = document.createElement("article");
    tile.className = "media-tile";
    tile.dataset.identity = identity;
    tile.innerHTML = `
      <div class="media-tile-video"></div>
      <div class="media-tile-avatar" aria-hidden="true"></div>
      <div class="media-tile-label"></div>
      <div class="media-tile-cam-off" aria-hidden="true">Cámara off</div>
      <div class="media-tile-hand" aria-hidden="true" title="Mano levantada"></div>
      <div class="media-tile-indicators" aria-hidden="true"></div>`;
    container.appendChild(tile);
  }
  tile.classList.toggle("is-local", isLocal);
  const labelEl = tile.querySelector(".media-tile-label");
  const display =
    (isLocal ? `${t("media.you") || "Tú"} · ` : "") + (label || identity.slice(0, 8));
  if (labelEl) labelEl.textContent = display;
  const avatar = tile.querySelector(".media-tile-avatar");
  if (avatar) {
    const initials = (label || "?")
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() || "")
      .join("");
    avatar.textContent = initials || "?";
  }
  if (officialSpeakerIdentity && identity === officialSpeakerIdentity) {
    tile.classList.add("official-speaker");
  }
  updateGridLayout(container);
  return tile;
}

function attachTrackToTile(tile, track, { mirror = false } = {}) {
  const mount = tile.querySelector(".media-tile-video");
  if (!mount) return;
  const el = track.attach();
  el.classList.add("media-track");
  el.playsInline = true;
  if (track.kind === "video") {
    mount.querySelectorAll("video").forEach((v) => v.remove());
    el.classList.toggle("is-mirrored", mirror);
    mount.appendChild(el);
    tile.classList.add("has-video");
    tile.classList.remove("camera-off");
    el.play?.().catch(() => {});
  } else if (track.kind === "audio") {
    mount.querySelectorAll("audio").forEach((a) => a.remove());
    el.autoplay = true;
    mount.appendChild(el);
    el.play?.().catch(() => {
      pushIncident("audio-autoplay", t("media.tapToEnableAudio") || "Toca para habilitar audio", "warn");
    });
  }
}

function detachTrack(track) {
  track.detach().forEach((el) => el.remove());
}

function syncParticipantPublications(container, participant) {
  const tile = ensureTile(
    container,
    participant.identity,
    participant.name || participant.identity,
    { isLocal: participant.isLocal }
  );
  for (const pub of participant.trackPublications.values()) {
    if (!pub.track) continue;
    if (!participant.isLocal && pub.isSubscribed === false) continue;
    attachTrackToTile(tile, pub.track, { mirror: participant.isLocal && pub.kind === "video" });
  }
  const camOff = ![...participant.trackPublications.values()].some(
    (p) => p.kind === "video" && p.track && !p.isMuted
  );
  tile.classList.toggle("camera-off", camOff);
  tile.classList.toggle("has-video", !camOff);
  tile.classList.toggle(
    "mic-muted",
    ![...participant.trackPublications.values()].some(
      (p) => p.kind === "audio" && p.track && !p.isMuted
    )
  );
}

function mapQuality(q) {
  const n = typeof q === "number" ? q : 0;
  if (n <= 1) return t("connection.excellent");
  if (n === 2) return t("connection.good");
  if (n === 3) return t("connection.unstable");
  return t("connection.veryUnstable");
}

export function setMediaViewMode(mode) {
  viewMode = mode === "focus" ? "focus" : "grid";
  if (mediaContainer) updateGridLayout(mediaContainer);
}

/**
 * Connects to LiveKit when the CDN client is present and credentials were minted.
 * Separates media connection from governance (SignalR).
 */
/**
 * True when LiveKit is already connected (do not tear down for governance resync).
 */
export function isLiveKitConnected() {
  return Boolean(liveKitRoom) && mediaConnectionState === "connected";
}

export async function connectLiveKit(container, joinInfo, options = {}) {
  if (!window.LivekitClient) {
    setMediaState("governance-only");
    renderGovernanceOnly(container, t("lobby.avBlocked"));
    return null;
  }

  // Preserve A/V across SignalR reconnect / governance rehydrate.
  // Rebuilding the Room kills peer connections and audio mid-assembly.
  if (
    liveKitRoom &&
    mediaConnectionState === "connected" &&
    mediaContainer === container &&
    !options.forceReconnect
  ) {
    officialSpeakerIdentity = options.officialSpeakerIdentity || officialSpeakerIdentity;
    return liveKitRoom;
  }

  const { Room, RoomEvent } = window.LivekitClient;
  await disconnectLiveKit();

  mediaContainer = container;
  officialSpeakerIdentity = options.officialSpeakerIdentity || null;
  liveKitRoom = new Room({
    adaptiveStream: true,
    dynacast: true
  });

  setMediaState("connecting");
  container.innerHTML = "";
  container.classList.add("media-stage-grid", "view-grid");
  updateGridLayout(container);

  liveKitRoom.on(RoomEvent.TrackSubscribed, (track, _pub, participant) => {
    const tile = ensureTile(
      container,
      participant.identity,
      participant.name || participant.identity
    );
    attachTrackToTile(tile, track);
  });

  liveKitRoom.on(RoomEvent.TrackUnsubscribed, (track, _pub, participant) => {
    detachTrack(track);
    const tile = container.querySelector(`[data-identity="${CSS.escape(participant.identity)}"]`);
    if (tile && track.kind === "video") {
      tile.classList.remove("has-video");
      tile.classList.add("camera-off");
    }
  });

  liveKitRoom.on(RoomEvent.LocalTrackPublished, (pub, participant) => {
    if (!pub.track) return;
    const tile = ensureTile(
      container,
      participant.identity,
      participant.name || t("media.you") || "Tú",
      { isLocal: true }
    );
    attachTrackToTile(tile, pub.track, { mirror: pub.kind === "video" });
  });

  liveKitRoom.on(RoomEvent.LocalTrackUnpublished, (pub) => {
    if (pub.track) detachTrack(pub.track);
  });

  liveKitRoom.on(RoomEvent.ParticipantConnected, (participant) => {
    ensureTile(container, participant.identity, participant.name || participant.identity);
    clearIncident(`media-disconnect-${participant.identity}`);
  });

  liveKitRoom.on(RoomEvent.ParticipantDisconnected, (participant) => {
    container.querySelector(`[data-identity="${CSS.escape(participant.identity)}"]`)?.remove();
    updateGridLayout(container);
    pushIncident(
      `media-disconnect-${participant.identity}`,
      t("media.participantMediaIssue", { name: participant.name || participant.identity }),
      "warn"
    );
  });

  liveKitRoom.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
    const ids = new Set(speakers.map((s) => s.identity));
    container.querySelectorAll(".media-tile").forEach((tile) => {
      tile.classList.toggle("is-speaking", ids.has(tile.dataset.identity));
    });
  });

  liveKitRoom.on(RoomEvent.ConnectionQualityChanged, (quality, participant) => {
    if (!participant) return;
    const tile = container.querySelector(`[data-identity="${CSS.escape(participant.identity)}"]`);
    const ind = tile?.querySelector(".media-tile-indicators");
    if (ind) ind.textContent = mapQuality(quality);
    if (participant.isLocal) {
      if (quality >= 3) pushIncident("local-quality", t("media.unstableConnection"), "warn");
      else clearIncident("local-quality");
    }
  });

  liveKitRoom.on(RoomEvent.Reconnecting, () => {
    setMediaState("reconnecting");
    pushIncident("media-reconnect", t("media.reconnecting"), "warn");
  });

  liveKitRoom.on(RoomEvent.Reconnected, () => {
    setMediaState("connected");
    clearIncident("media-reconnect");
  });

  liveKitRoom.on(RoomEvent.Disconnected, () => {
    setMediaState("disconnected");
    pushIncident("media-down", t("media.disconnectedGovernanceOk"), "error");
  });

  try {
    await liveKitRoom.connect(joinInfo.serverUrl, joinInfo.token);
    setMediaState("connected");
    clearIncident("media-down");

    const local = liveKitRoom.localParticipant;
    ensureTile(container, local.identity, local.name || t("media.you") || "Tú", {
      isLocal: true
    });

    // Attach any already-subscribed remote tracks (race after connect).
    for (const participant of liveKitRoom.remoteParticipants.values()) {
      syncParticipantPublications(container, participant);
    }
    syncParticipantPublications(container, local);

    localPublishIntent = {
      camera: Boolean(options.enableCamera),
      mic: Boolean(options.enableMic)
    };
    if (joinInfo.canPublish) {
      await applyLocalPublish(localPublishIntent);
    } else {
      pushIncident("no-publish", t("media.publishFailed"), "warn");
    }

    updateGridLayout(container);
    return liveKitRoom;
  } catch (error) {
    setMediaState("governance-only");
    pushIncident("media-connect-fail", error?.message || t("lobby.avBlocked"), "error");
    renderGovernanceOnly(container, error?.message || t("lobby.avBlocked"));
    return null;
  }
}

async function applyLocalPublish({ camera, mic }) {
  if (!liveKitRoom) return { ok: false, error: "no-room", code: "NO_ROOM" };
  try {
    await liveKitRoom.localParticipant.setCameraEnabled(Boolean(camera));
    await liveKitRoom.localParticipant.setMicrophoneEnabled(Boolean(mic));
    const tile = mediaContainer?.querySelector(
      `[data-identity="${CSS.escape(liveKitRoom.localParticipant.identity)}"]`
    );
    if (tile) {
      tile.classList.toggle("camera-off", !camera);
      tile.classList.toggle("mic-muted", !mic);
      if (camera) tile.classList.add("has-video");
      else tile.classList.remove("has-video");
    }
    clearIncident("publish-fail");
    clearIncident("permission-denied");
    saveDevicePrefs({ cameraEnabled: Boolean(camera), micEnabled: Boolean(mic) });
    return { ok: true };
  } catch (error) {
    const name = error?.name || "";
    const msg = String(error?.message || "");
    const denied =
      name === "NotAllowedError" ||
      /Permission denied|NotAllowedError|PermissionDenied/i.test(msg);
    if (denied) {
      pushIncident(
        "permission-denied",
        t("media.permissionDenied") || "Cámara o micrófono bloqueados por el navegador.",
        "error"
      );
      return { ok: false, error, code: "PERMISSION_DENIED" };
    }
    pushIncident("publish-fail", t("media.publishFailed"), "error");
    return { ok: false, error, code: "PUBLISH_FAILED" };
  }
}

export async function setLocalCameraEnabled(enabled) {
  localPublishIntent.camera = Boolean(enabled);
  return applyLocalPublish(localPublishIntent);
}

export async function setLocalMicrophoneEnabled(enabled) {
  localPublishIntent.mic = Boolean(enabled);
  return applyLocalPublish(localPublishIntent);
}

export function getLocalPublishIntent() {
  return { ...localPublishIntent };
}

export function getLiveKitRoom() {
  return liveKitRoom;
}

/** Mark tiles whose LiveKit identity matches raised-hand user ids (dashless GUID). */
export function syncHandRaisedIndicators(container, raisedUserIds = []) {
  if (!container) return;
  const set = new Set(
    (raisedUserIds || []).map((id) => String(id || "").replace(/-/g, "").toLowerCase())
  );
  container.querySelectorAll(".media-tile").forEach((tile) => {
    const id = String(tile.dataset.identity || "").replace(/-/g, "").toLowerCase();
    tile.classList.toggle("hand-raised", set.has(id));
  });
}

export async function switchLocalDevices({ micId, cameraId, speakerId } = {}) {
  const prefs = saveDevicePrefs({
    ...(micId ? { micId } : {}),
    ...(cameraId ? { cameraId } : {}),
    ...(speakerId ? { speakerId } : {})
  });
  if (!liveKitRoom) return { ok: true, prefs };
  try {
    const { createLocalTracks } = window.LivekitClient || {};
    if (!createLocalTracks) {
      // Re-apply publish so browser picks ideal device on next enable.
      return applyLocalPublish(localPublishIntent);
    }
    // Toggle off/on to refresh devices with prefs constraints when possible.
    const wantCam = localPublishIntent.camera;
    const wantMic = localPublishIntent.mic;
    await liveKitRoom.localParticipant.setCameraEnabled(false);
    await liveKitRoom.localParticipant.setMicrophoneEnabled(false);
    if (wantCam || wantMic) {
      await applyLocalPublish({ camera: wantCam, mic: wantMic });
    }
    if (speakerId && typeof HTMLMediaElement !== "undefined") {
      mediaContainer?.querySelectorAll("audio, video").forEach((el) => {
        if (typeof el.setSinkId === "function") {
          el.setSinkId(speakerId).catch(() => {});
        }
      });
    }
    return { ok: true, prefs };
  } catch (error) {
    return { ok: false, error };
  }
}

export async function refreshMediaToken(assemblyId, container, options = {}) {
  const token = await fetchJoinToken(assemblyId);
  return connectLiveKit(container, token, options);
}

export function highlightOfficialSpeaker(container, identity) {
  officialSpeakerIdentity = identity;
  if (!container) return;
  container.querySelectorAll(".media-tile").forEach((tile) => {
    const isOfficial = tile.dataset.identity === identity;
    tile.classList.toggle("official-speaker", isOfficial);
    tile.classList.toggle("is-stage", viewMode === "focus" && isOfficial);
  });
  updateGridLayout(container);
}

export async function disconnectLiveKit() {
  if (liveKitRoom) {
    try {
      await liveKitRoom.disconnect();
    } catch {
      /* ignore */
    }
    liveKitRoom = null;
  }
  mediaContainer = null;
  setMediaState("idle");
}

export function renderGovernanceOnly(container, reason) {
  if (!container) return;
  setMediaState("governance-only");
  const raw = String(reason || "");
  const human = /livekit|meeting provider|not configured/i.test(raw)
    ? t("lobby.avBlocked")
    : raw || t("lobby.avBlocked");
  container.innerHTML = `
    <div class="empty-state av-blocked governance-only" role="status" data-media="governance-only">
      <p class="empty-state-what">${escapeHtml(human)}</p>
      <p class="empty-state-why muted">${escapeHtml(t("lobby.avContinue"))}</p>
      <p class="empty-state-why muted">${escapeHtml(t("media.governanceOnly"))}</p>
    </div>
  `;
}

export function renderAvBlocked(container, reason) {
  renderGovernanceOnly(container, reason);
}

export function getLiveKitParticipantCounts() {
  if (!liveKitRoom) {
    return { connected: 0, mics: 0, cameras: 0 };
  }
  let mics = 0;
  let cameras = 0;
  const parts = [liveKitRoom.localParticipant, ...liveKitRoom.remoteParticipants.values()];
  for (const p of parts) {
    for (const pub of p.trackPublications.values()) {
      if (!pub.track) continue;
      if (pub.kind === "audio" && !pub.isMuted) mics += 1;
      if (pub.kind === "video" && !pub.isMuted) cameras += 1;
    }
  }
  return { connected: parts.length, mics, cameras };
}

/** Unlock audio after a user gesture when browser blocks autoplay. */
export async function unlockRemoteAudio() {
  if (!mediaContainer) return;
  const audios = mediaContainer.querySelectorAll("audio");
  for (const a of audios) {
    try {
      await a.play();
    } catch {
      /* ignore */
    }
  }
  clearIncident("audio-autoplay");
}
