import { api } from "./api.js";
import { t } from "../i18n/i18n.js";
import { escapeHtml } from "./ui.js";

let liveKitRoom = null;
let previewStream = null;

export async function fetchJoinToken(assemblyId, canPublish = false) {
  return api(`/api/assemblies/${assemblyId}/meeting/join-token?canPublish=${canPublish}`, {
    method: "POST"
  });
}

export async function fetchRoomInfo(assemblyId) {
  return api(`/api/assemblies/${assemblyId}/meeting/room`);
}

/**
 * Device preview via getUserMedia. Does not fake remote participants.
 * @returns {{ stream: MediaStream|null, error: string|null, camera: boolean, mic: boolean }}
 */
export async function startDevicePreview(videoEl, { camera = true, mic = true } = {}) {
  stopDevicePreview(videoEl);

  if (!navigator.mediaDevices?.getUserMedia) {
    return {
      stream: null,
      error: t("lobby.avBlocked"),
      camera: false,
      mic: false
    };
  }

  try {
    previewStream = await navigator.mediaDevices.getUserMedia({
      video: camera,
      audio: mic
    });

    if (videoEl) {
      videoEl.srcObject = previewStream;
      videoEl.muted = true;
      await videoEl.play().catch(() => {});
    }

    return {
      stream: previewStream,
      error: null,
      camera: camera && previewStream.getVideoTracks().some((tr) => tr.enabled),
      mic: mic && previewStream.getAudioTracks().some((tr) => tr.enabled)
    };
  } catch (error) {
    const denied = error?.name === "NotAllowedError" || error?.name === "PermissionDeniedError";
    return {
      stream: null,
      error: denied ? t("lobby.avDenied") : t("lobby.avBlocked"),
      camera: false,
      mic: false
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
  if (previewStream) {
    previewStream.getTracks().forEach((tr) => tr.stop());
    previewStream = null;
  }
  if (videoEl) {
    videoEl.srcObject = null;
  }
}

/**
 * Connects to LiveKit when the CDN client is present and credentials were minted.
 * Without LIVEKIT_* the backend returns unavailable — show honest blocked state.
 */
export async function connectLiveKit(container, joinInfo) {
  if (!window.LivekitClient) {
    container.innerHTML = `<div class="empty-state">${escapeHtml(t("lobby.avBlocked"))}</div>`;
    return null;
  }

  const { Room, RoomEvent, Track } = window.LivekitClient;
  liveKitRoom = new Room();

  liveKitRoom.on(RoomEvent.TrackSubscribed, (track) => {
    if (track.kind === Track.Kind.Video || track.kind === Track.Kind.Audio) {
      const el = track.attach();
      container.appendChild(el);
    }
  });

  await liveKitRoom.connect(joinInfo.serverUrl, joinInfo.token);
  return liveKitRoom;
}

export async function disconnectLiveKit() {
  if (liveKitRoom) {
    await liveKitRoom.disconnect();
    liveKitRoom = null;
  }
}

/** Honest A/V blocked UI — never invents remote video tiles. */
export function renderAvBlocked(container, reason) {
  if (!container) {
    return;
  }
  const raw = String(reason || "");
  const human =
    /livekit|meeting provider|not configured/i.test(raw)
      ? t("lobby.avBlocked")
      : raw || t("lobby.avBlocked");
  container.innerHTML = `
    <div class="empty-state av-blocked" role="status">
      <p class="empty-state-what">${escapeHtml(human)}</p>
      <p class="empty-state-why muted">${escapeHtml(t("lobby.avContinue"))}</p>
    </div>
  `;
}
