import { me } from "./auth.js";
import { initI18n, t } from "../i18n/i18n.js";
import { assemblyIdFromUrl, escapeHtml, qs, showToast } from "./ui.js";
import { hydrateRoomState } from "./room-state.js";
import {
  fetchRoomInfo,
  setPreviewTracks,
  startDevicePreview,
  stopDevicePreview
} from "./meeting.js";

const assemblyId = assemblyIdFromUrl();
const device = { camera: true, mic: true };

function showError(message) {
  const el = qs("#page-alert");
  if (!el) return;
  el.hidden = !message;
  el.textContent = message || "";
}

function updateToggleLabels() {
  const camBtn = qs("#toggle-camera");
  const micBtn = qs("#toggle-mic");
  camBtn.textContent = device.camera ? t("lobby.deviceOn") : t("lobby.deviceOff");
  camBtn.setAttribute("aria-pressed", String(device.camera));
  micBtn.textContent = device.mic ? t("lobby.deviceOn") : t("lobby.deviceOff");
  micBtn.setAttribute("aria-pressed", String(device.mic));
  setPreviewTracks({ camera: device.camera, mic: device.mic });
}

async function setupPreview() {
  const video = qs("#preview-video");
  const fallback = qs("#preview-fallback");

  let meetingBlocked = false;
  try {
    const info = await fetchRoomInfo(assemblyId);
    if (info && info.isAvailable === false) {
      meetingBlocked = true;
      fallback.textContent = info.unavailableReason || t("lobby.avBlocked");
    }
  } catch {
    meetingBlocked = true;
    fallback.textContent = t("lobby.avBlocked");
  }

  const result = await startDevicePreview(video, { camera: device.camera, mic: device.mic });
  if (result.stream) {
    video.hidden = false;
    fallback.hidden = true;
  } else {
    video.hidden = true;
    fallback.hidden = false;
    fallback.textContent = result.error || (meetingBlocked ? t("lobby.avBlocked") : t("lobby.avDenied"));
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function enterAssembly() {
  const btn = qs("#btn-enter");
  const stages = qs("#staged-loading");
  btn.disabled = true;
  stages.hidden = false;
  const messages = [t("lobby.verifying"), t("lobby.connecting"), t("lobby.synchronizing")];
  stages.innerHTML = messages.map((m, i) => `<li data-step="${i}">${escapeHtml(m)}</li>`).join("");

  for (let i = 0; i < messages.length; i++) {
    stages.querySelectorAll("li").forEach((li) => li.removeAttribute("aria-current"));
    stages.querySelector(`[data-step="${i}"]`)?.setAttribute("aria-current", "true");
    if (i === 0) {
      await hydrateRoomState(assemblyId);
    } else if (i === 1) {
      await sleep(400);
    } else {
      await sleep(350);
    }
  }

  stopDevicePreview(qs("#preview-video"));
  location.href = `/assembly.html?assemblyId=${assemblyId}`;
}

async function init() {
  await initI18n();

  qs("#lobby-title").textContent = t("lobby.title");
  qs("#label-camera").textContent = t("lobby.camera");
  qs("#label-mic").textContent = t("lobby.microphone");
  qs("#btn-enter").textContent = t("lobby.enter");
  qs("#link-dashboard").href = `/dashboard.html?assemblyId=${assemblyId}`;
  qs("#link-dashboard").textContent = t("back");
  updateToggleLabels();

  if (!assemblyId) {
    showError(t("dashboard.missingId"));
    return;
  }

  let user;
  try {
    user = await me();
  } catch {
    location.href = "/";
    return;
  }

  let room;
  try {
    room = await hydrateRoomState(assemblyId);
  } catch (error) {
    showError(error.message);
    return;
  }

  if (room._fallbackMessage) {
    showToast(room._fallbackMessage, "info");
  }

  const assembly = room.assembly;
  qs("#lobby-meta").innerHTML = `
    <span><strong>PH:</strong> ${escapeHtml(assembly?.propertyHorizontalName || "—")}</span>
    <span><strong>${escapeHtml(assembly?.title || "—")}</strong></span>
  `;

  const self = room.self;
  qs("#fact-participant").textContent = self?.displayName || user.displayName;
  qs("#fact-unit").textContent = self?.unitCode || "—";
  qs("#fact-accreditation").textContent = self?.attendanceStatus || "—";
  qs("#fact-connection").textContent = navigator.onLine ? t("connection.online") : t("connection.disconnected");

  if (room.quorum) {
    const q = room.quorum;
    qs("#fact-quorum").textContent = `${Number(q.currentCoefficient).toFixed(2)}% / ${Number(q.requiredCoefficient).toFixed(2)}%`;
  } else {
    qs("#fact-quorum").textContent = "—";
  }

  // Label i18n for dl
  const dts = qs("#participant-facts").querySelectorAll("dt");
  const labels = [t("lobby.participant"), t("lobby.unit"), t("lobby.accreditation"), t("lobby.connection"), t("lobby.quorum")];
  dts.forEach((dt, i) => {
    if (labels[i]) dt.textContent = labels[i];
  });

  await setupPreview();

  qs("#toggle-camera").addEventListener("click", () => {
    device.camera = !device.camera;
    updateToggleLabels();
  });
  qs("#toggle-mic").addEventListener("click", () => {
    device.mic = !device.mic;
    updateToggleLabels();
  });
  qs("#btn-enter").addEventListener("click", () => {
    enterAssembly().catch((error) => {
      showError(error.message);
      qs("#btn-enter").disabled = false;
    });
  });

  window.addEventListener("beforeunload", () => stopDevicePreview(qs("#preview-video")));
}

init().catch((error) => {
  console.error(error);
  showError(error.message || t("networkError"));
});
