import { me } from "./auth.js";
import { initI18n, t } from "../i18n/i18n.js";
import { assemblyIdFromUrl, escapeHtml, qs, showToast } from "./ui.js";
import { hydrateRoomState } from "./room-state.js";
import { ensureAssemblyIdOrRedirect } from "./assembly-context.js";
import { bootIaPage } from "./ia-page.js";
import {
  enumerateMediaDevices,
  fetchJoinToken,
  fetchRoomInfo,
  getMicLevel,
  loadDevicePrefs,
  saveDevicePrefs,
  setPreviewTracks,
  startDevicePreview,
  stopDevicePreview
} from "./meeting.js";
import { historicalOverviewUrl, isTerminalStatus } from "./assembly-lifecycle.js";

let assemblyId = assemblyIdFromUrl();
const device = { camera: true, mic: true };
let joinReady = false;
let meetingAvailable = false;
let meterTimer = null;

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
  camBtn.setAttribute("aria-label", device.camera ? t("lobby.turnCameraOff") : t("lobby.turnCameraOn"));
  micBtn.textContent = device.mic ? t("lobby.deviceOn") : t("lobby.deviceOff");
  micBtn.setAttribute("aria-pressed", String(device.mic));
  micBtn.setAttribute("aria-label", device.mic ? t("lobby.muteMic") : t("lobby.unmuteMic"));
  setPreviewTracks({ camera: device.camera, mic: device.mic });
  saveDevicePrefs({ cameraEnabled: device.camera, micEnabled: device.mic });
}

function fillSelect(select, devices, selectedId) {
  select.innerHTML = devices
    .map(
      (d, i) =>
        `<option value="${escapeHtml(d.deviceId)}" ${d.deviceId === selectedId ? "selected" : ""}>${escapeHtml(d.label || `${d.kind} ${i + 1}`)}</option>`
    )
    .join("");
  if (!devices.length) {
    select.innerHTML = `<option value="">${escapeHtml(t("lobby.noDevice"))}</option>`;
  }
}

async function refreshDeviceLists() {
  const prefs = loadDevicePrefs();
  const { cameras, mics, speakers, supportsSinkId } = await enumerateMediaDevices();
  fillSelect(qs("#select-camera"), cameras, prefs.cameraId);
  fillSelect(qs("#select-mic"), mics, prefs.micId);
  const speakerField = qs("#speaker-field");
  if (supportsSinkId && speakers.length) {
    speakerField.hidden = false;
    fillSelect(qs("#select-speaker"), speakers, prefs.speakerId);
  } else {
    speakerField.hidden = true;
  }
}

function resolveSelf(room, user) {
  if (room?.self) return room.self;
  const uid = String(user?.id || user?.userId || "").toLowerCase();
  if (!uid) return null;
  return (
    (room?.participants || []).find(
      (p) => String(p.userId || "").toLowerCase() === uid
    ) || null
  );
}

function updateEnterGate(self, assembly) {
  const btn = qs("#btn-enter");
  const hint = qs("#enter-hint");
  const checkinLink = qs("#link-checkin");
  const accredited = Boolean(self?.isAccredited);
  const status = assembly?.status || "";
  const joinable = !["Draft", "Cancelled", "Completed"].includes(status);
  joinReady = Boolean(assemblyId) && accredited && joinable;
  btn.disabled = !joinReady;
  if (checkinLink) {
    checkinLink.hidden = accredited;
    checkinLink.href = `/checkin.html?assemblyId=${assemblyId}`;
  }
  if (!accredited) {
    hint.textContent = t("lobby.needAccreditation");
  } else if (!joinable) {
    hint.textContent = t("lobby.assemblyNotJoinable", { status });
  } else if (!meetingAvailable) {
    hint.textContent = t("lobby.enterGovernanceOnly");
  } else {
    hint.textContent = "";
  }
}

function startMeterLoop() {
  stopMeterLoop();
  meterTimer = window.setInterval(() => {
    const fill = qs("#mic-meter-fill");
    if (!fill) return;
    const level = device.mic ? getMicLevel() : 0;
    fill.style.width = `${Math.round(level * 100)}%`;
  }, 100);
}

function stopMeterLoop() {
  if (meterTimer) {
    clearInterval(meterTimer);
    meterTimer = null;
  }
}

async function setupPreview() {
  const video = qs("#preview-video");
  const fallback = qs("#preview-fallback");

  meetingAvailable = false;
  try {
    const info = await fetchRoomInfo(assemblyId);
    meetingAvailable = Boolean(info?.isAvailable);
    qs("#fact-meeting").textContent = meetingAvailable
      ? t("lobby.meetingReady")
      : info?.unavailableReason || t("lobby.avBlocked");
  } catch {
    meetingAvailable = false;
    qs("#fact-meeting").textContent = t("lobby.avBlocked");
  }

  const prefs = loadDevicePrefs();
  if (typeof prefs.cameraEnabled === "boolean") device.camera = prefs.cameraEnabled;
  if (typeof prefs.micEnabled === "boolean") device.mic = prefs.micEnabled;

  const result = await startDevicePreview(video, { camera: device.camera, mic: device.mic });
  await refreshDeviceLists();

  if (result.stream) {
    video.hidden = false;
    fallback.hidden = true;
    startMeterLoop();
  } else {
    video.hidden = true;
    fallback.hidden = false;
    fallback.textContent = result.error || t("lobby.avDenied");
  }
  updateToggleLabels();
}

async function enterAssembly() {
  const btn = qs("#btn-enter");
  const stages = qs("#staged-loading");
  btn.disabled = true;
  stages.hidden = false;

  const steps = [
    { key: "verify", label: t("lobby.verifying") },
    { key: "token", label: t("lobby.connecting") },
    { key: "sync", label: t("lobby.synchronizing") }
  ];
  stages.innerHTML = steps.map((s, i) => `<li data-step="${i}">${escapeHtml(s.label)}</li>`).join("");

  try {
    stages.querySelector('[data-step="0"]')?.setAttribute("aria-current", "true");
    const currentUser = await me();
    const room = await hydrateRoomState(assemblyId, {
      userId: currentUser?.id || currentUser?.userId
    });
    const self = resolveSelf(room, currentUser);
    if (!self?.isAccredited) {
      throw new Error(t("lobby.needAccreditation"));
    }

    stages.querySelectorAll("li").forEach((li) => li.removeAttribute("aria-current"));
    stages.querySelector('[data-step="1"]')?.setAttribute("aria-current", "true");
    if (meetingAvailable) {
      await fetchJoinToken(assemblyId);
    }

    stages.querySelectorAll("li").forEach((li) => li.removeAttribute("aria-current"));
    stages.querySelector('[data-step="2"]')?.setAttribute("aria-current", "true");
    saveDevicePrefs({
      cameraEnabled: device.camera,
      micEnabled: device.mic,
      cameraId: qs("#select-camera")?.value || undefined,
      micId: qs("#select-mic")?.value || undefined,
      speakerId: qs("#select-speaker")?.value || undefined
    });

    stopDevicePreview(qs("#preview-video"));
    stopMeterLoop();
    location.href = `/assembly.html?assemblyId=${assemblyId}`;
  } catch (error) {
    showError(error.message || t("networkError"));
    btn.disabled = false;
    stages.hidden = true;
  }
}

async function init() {
  await initI18n();

  qs("#lobby-title").textContent = t("lobby.title");
  qs("#label-camera").textContent = t("lobby.camera");
  qs("#label-mic").textContent = t("lobby.microphone");
  qs("#label-camera-select").textContent = t("lobby.camera");
  qs("#label-mic-select").textContent = t("lobby.microphone");
  qs("#label-speaker-select").textContent = t("lobby.speaker");
  qs("#label-mic-level").textContent = t("lobby.micLevel");
  qs("#btn-enter").textContent = t("lobby.enter");
  const linkDash = qs("#link-dashboard");
  if (linkDash) {
    linkDash.href = `/dashboard.html?assemblyId=${assemblyId}`;
    linkDash.textContent = t("back");
  }
  const checkinLink = qs("#link-checkin");
  if (checkinLink) {
    checkinLink.textContent = t("lobby.goToCheckin");
    checkinLink.href = `/checkin.html?assemblyId=${assemblyId}`;
  }

  if (!assemblyId) {
    assemblyId = await ensureAssemblyIdOrRedirect();
    if (!assemblyId) {
      showError(t("dashboard.missingId"));
      return;
    }
    return;
  }

  let user;
  try {
    user = await me();
  } catch {
    location.href = "/";
    return;
  }

  await bootIaPage({ current: "asm-room", pageLabel: "Sala" });
  document.body.classList.add("is-fullscreen-ops");

  let room;
  try {
    room = await hydrateRoomState(assemblyId, {
      userId: user?.id || user?.userId
    });
  } catch (error) {
    showError(error.message);
    return;
  }

  if (room._fallbackMessage) {
    showToast(room._fallbackMessage, "info");
  }

  const assembly = room.assembly;
  if (isTerminalStatus(assembly?.status)) {
    location.replace(historicalOverviewUrl(assemblyId, assembly.status));
    return;
  }

  qs("#lobby-meta").innerHTML = `
    <span><strong>PH:</strong> ${escapeHtml(assembly?.propertyHorizontalName || "—")}</span>
    <span><strong>${escapeHtml(assembly?.title || "—")}</strong></span>
  `;

  const self = resolveSelf(room, user);
  qs("#fact-participant").textContent = self?.displayName || user.displayName;
  qs("#fact-unit").textContent = self?.unitCode || "—";
  qs("#fact-accreditation").textContent = self?.isAccredited
    ? t("lobby.accredited")
    : t("lobby.notAccredited");
  const coeff = Number(self?.effectiveCoefficientPercent || self?.coefficientPercent || 0);
  qs("#fact-representation").textContent = `${coeff.toFixed(3)}%`;
  qs("#fact-connection").textContent = navigator.onLine ? t("connection.online") : t("connection.disconnected");

  if (room.quorum) {
    const q = room.quorum;
    qs("#fact-quorum").textContent = `${Number(q.currentCoefficient).toFixed(2)}% / ${Number(q.requiredCoefficient).toFixed(2)}%`;
  } else {
    qs("#fact-quorum").textContent = "—";
  }

  const statusEl = qs("#lobby-status");
  if (assembly?.status && assembly.status !== "InProgress") {
    statusEl.hidden = false;
    statusEl.textContent =
      assembly.status === "CheckInOpen" || assembly.status === "Scheduled"
        ? t("lobby.notStarted")
        : t("lobby.assemblyStatus", { status: assembly.status });
  }

  const dts = qs("#participant-facts").querySelectorAll("dt");
  const labels = [
    t("lobby.participant"),
    t("lobby.unit"),
    t("lobby.accreditation"),
    t("lobby.representation"),
    t("lobby.connection"),
    t("lobby.quorum"),
    t("lobby.meetingStatus")
  ];
  dts.forEach((dt, i) => {
    if (labels[i]) dt.textContent = labels[i];
  });

  await setupPreview();
  updateEnterGate(self, assembly);

  qs("#toggle-camera").addEventListener("click", () => {
    device.camera = !device.camera;
    updateToggleLabels();
  });
  qs("#toggle-mic").addEventListener("click", () => {
    device.mic = !device.mic;
    updateToggleLabels();
  });
  qs("#select-camera")?.addEventListener("change", async (e) => {
    saveDevicePrefs({ cameraId: e.target.value });
    await setupPreview();
    updateEnterGate(self, assembly);
  });
  qs("#select-mic")?.addEventListener("change", async (e) => {
    saveDevicePrefs({ micId: e.target.value });
    await setupPreview();
    updateEnterGate(self, assembly);
  });
  qs("#select-speaker")?.addEventListener("change", (e) => {
    saveDevicePrefs({ speakerId: e.target.value });
  });
  qs("#btn-enter").addEventListener("click", () => {
    enterAssembly().catch((error) => {
      showError(error.message);
      qs("#btn-enter").disabled = false;
    });
  });

  window.addEventListener("beforeunload", () => {
    stopDevicePreview(qs("#preview-video"));
    stopMeterLoop();
  });
}

init().catch((error) => {
  console.error(error);
  showError(error.message || t("networkError"));
});
