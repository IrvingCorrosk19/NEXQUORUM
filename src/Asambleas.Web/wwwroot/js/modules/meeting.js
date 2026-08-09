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
let mediaConnectionState = "idle"; // idle | connecting | connected | reconnecting | disconnected | governance-only
let localPublishIntent = { camera: false, mic: false };

export function getMediaConnectionState() {
  return mediaConnectionState;
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
  const supportsSinkId = typeof HTMLMediaElement !== "undefined"
    && typeof HTMLMediaElement.prototype.setSinkId === "function";
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
      : true
    : false;
  const audio = mic
    ? prefs.micId
      ? { deviceId: { ideal: prefs.micId } }
      : true
    : false;
  return { video, audio };
}

/**
 * Device preview via getUserMedia. Does not fake remote participants.
 */
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
  if (!previewStream) {
    return;
  }
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
  if (videoEl) {
    videoEl.srcObject = null;
  }
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

/** @returns {number} 0..1 */
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

function ensureTile(container, identity, label) {
  let tile = container.querySelector(`[data-identity="${CSS.escape(identity)}"]`);
  if (!tile) {
    tile = document.createElement("article");
    tile.className = "media-tile";
    tile.dataset.identity = identity;
    tile.innerHTML = `
      <div class="media-tile-video"></div>
      <div class="media-tile-avatar" aria-hidden="true"></div>
      <div class="media-tile-label"></div>
      <div class="media-tile-indicators" aria-hidden="true"></div>`;
    container.appendChild(tile);
  }
  const labelEl = tile.querySelector(".media-tile-label");
  if (labelEl) labelEl.textContent = label || identity.slice(0, 8);
  const avatar = tile.querySelector(".media-tile-avatar");
  if (avatar) {
    const initials = (label || "?")
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() || "")
      .join("");
    avatar.textContent = initials || "?";
  }
  return tile;
}

function attachTrackToTile(tile, track) {
  const mount = tile.querySelector(".media-tile-video");
  if (!mount) return;
  const el = track.attach();
  el.classList.add("media-track");
  if (track.kind === "video") {
    mount.querySelectorAll("video").forEach((v) => v.remove());
    mount.appendChild(el);
    tile.classList.add("has-video");
    tile.classList.remove("camera-off");
  } else {
    mount.appendChild(el);
  }
}

function mapQuality(q) {
  // LiveKit ConnectionQuality: Excellent=1 Good=2 Poor=3 Lost=4 Unknown=0 (SDK may vary)
  const n = typeof q === "number" ? q : 0;
  if (n <= 1) return t("connection.excellent");
  if (n === 2) return t("connection.good");
  if (n === 3) return t("connection.unstable");
  return t("connection.veryUnstable");
}

/**
 * Connects to LiveKit when the CDN client is present and credentials were minted.
 * Separates media connection from governance (SignalR).
 */
export async function connectLiveKit(container, joinInfo, options = {}) {
  if (!window.LivekitClient) {
    setMediaState("governance-only");
    renderGovernanceOnly(container, t("lobby.avBlocked"));
    return null;
  }

  const { Room, RoomEvent, Track, ConnectionState } = window.LivekitClient;
  await disconnectLiveKit();

  liveKitRoom = new Room({
    adaptiveStream: true,
    dynacast: true
  });

  setMediaState("connecting");
  container.innerHTML = "";
  container.classList.add("media-stage-grid");

  const officialIdentity = options.officialSpeakerIdentity || null;

  liveKitRoom.on(RoomEvent.TrackSubscribed, (track, _pub, participant) => {
    const tile = ensureTile(
      container,
      participant.identity,
      participant.name || participant.identity
    );
    attachTrackToTile(tile, track);
    if (officialIdentity && participant.identity === officialIdentity) {
      tile.classList.add("official-speaker");
    }
  });

  liveKitRoom.on(RoomEvent.TrackUnsubscribed, (track) => {
    track.detach().forEach((el) => el.remove());
  });

  liveKitRoom.on(RoomEvent.ParticipantDisconnected, (participant) => {
    container.querySelector(`[data-identity="${CSS.escape(participant.identity)}"]`)?.remove();
    pushIncident(
      `media-disconnect-${participant.identity}`,
      t("media.participantMediaIssue", { name: participant.name || participant.identity }),
      "warn"
    );
  });

  liveKitRoom.on(RoomEvent.ConnectionQualityChanged, (quality, participant) => {
    if (!participant?.isLocal) return;
    const human = mapQuality(quality);
    const tile = container.querySelector(`[data-identity="${CSS.escape(participant.identity)}"]`);
    const ind = tile?.querySelector(".media-tile-indicators");
    if (ind) ind.textContent = human;
    if (quality >= 3) {
      pushIncident("local-quality", t("media.unstableConnection"), "warn");
    } else {
      clearIncident("local-quality");
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

    // Local tile
    const local = liveKitRoom.localParticipant;
    ensureTile(container, local.identity, local.name || t("media.you"));

    // Owners start muted unless caller enables; moderators may publish immediately.
    localPublishIntent = {
      camera: Boolean(options.enableCamera),
      mic: Boolean(options.enableMic)
    };
    if (joinInfo.canPublish) {
      await applyLocalPublish(localPublishIntent);
    }

    return liveKitRoom;
  } catch (error) {
    setMediaState("governance-only");
    pushIncident("media-connect-fail", error?.message || t("lobby.avBlocked"), "error");
    renderGovernanceOnly(container, error?.message || t("lobby.avBlocked"));
    return null;
  }
}

async function applyLocalPublish({ camera, mic }) {
  if (!liveKitRoom) return { ok: false, error: "no-room" };
  try {
    await liveKitRoom.localParticipant.setCameraEnabled(Boolean(camera));
    await liveKitRoom.localParticipant.setMicrophoneEnabled(Boolean(mic));
    const tile = document.querySelector(
      `.media-stage-grid [data-identity="${CSS.escape(liveKitRoom.localParticipant.identity)}"]`
    );
    if (tile) {
      tile.classList.toggle("camera-off", !camera);
      tile.classList.toggle("mic-muted", !mic);
    }
    clearIncident("publish-fail");
    return { ok: true };
  } catch (error) {
    pushIncident("publish-fail", t("media.publishFailed"), "error");
    return { ok: false, error };
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

export async function refreshMediaToken(assemblyId, container, options = {}) {
  const token = await fetchJoinToken(assemblyId);
  // Reconnect with new grants when publish capability changes.
  return connectLiveKit(container, token, options);
}

export function highlightOfficialSpeaker(container, identity) {
  if (!container) return;
  container.querySelectorAll(".media-tile").forEach((tile) => {
    tile.classList.toggle("official-speaker", tile.dataset.identity === identity);
  });
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
  setMediaState("idle");
}

export function renderGovernanceOnly(container, reason) {
  if (!container) return;
  setMediaState("governance-only");
  const raw = String(reason || "");
  const human =
    /livekit|meeting provider|not configured/i.test(raw)
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

/** Honest A/V blocked UI — never invents remote video tiles. */
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
