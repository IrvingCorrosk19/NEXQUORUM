import { me, hasPermission } from "./auth.js";
import { initI18n, t } from "../i18n/i18n.js?v=open-desk1";
import { assemblyIdFromUrl, escapeHtml, qs, showToast } from "./ui.js";
import { showPageError } from "./app-feedback.js";
import { hydrateRoomState } from "./room-state.js";
import { ensureAssemblyIdOrRedirect } from "./assembly-context.js";
import { bootIaPage } from "./ia-page.js?v=polish16";
import { isOperator } from "./roles.js";
import { createAssemblyConnection, ensureSignalR } from "./signalr-client.js";
import { attachJoinSummonListener } from "./join-summon.js";
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
} from "./meeting.js?v=room-fit2";
import { historicalOverviewUrl, isTerminalStatus } from "./assembly-lifecycle.js";
import { redirectToHttpsForMedia, mediaHttpsUrl } from "./secure-context.js";

let assemblyId = assemblyIdFromUrl();
const device = { camera: true, mic: true };
let joinReady = false;
let meetingAvailable = false;
let meterTimer = null;
let currentSelf = null;
let currentAssembly = null;
let hub = null;
let currentUser = null;

function showError(message) {
  showPageError(message, "error");
}

function clearActionError() {
  const el = qs("#page-alert");
  if (!el) return;
  el.hidden = true;
  el.textContent = "";
}

function isPrepStatus(status) {
  return status === "Draft" || status === "Scheduled";
}

function isAdmissionOpen(status) {
  return status === "CheckIn" || status === "InProgress" || status === "Paused";
}

function viewerIsOperator() {
  return isOperator(currentUser);
}

function canOpenDesk() {
  return (
    viewerIsOperator() &&
    (hasPermission(currentUser, "attendance:manage") ||
      hasPermission(currentUser, "assembly:start") ||
      hasPermission(currentUser, "assembly:manage"))
  );
}

function formatPanama(iso, timeZoneId) {
  if (!iso) return "";
  try {
    const label = new Intl.DateTimeFormat("es-PA", {
      timeZone: timeZoneId || "America/Panama",
      dateStyle: "full",
      timeStyle: "short"
    }).format(new Date(iso));
    return `${label} (hora de Panamá)`;
  } catch {
    try {
      return `${new Date(iso).toLocaleString("es-PA")} (hora de Panamá)`;
    } catch {
      return "";
    }
  }
}

function scheduledWhen(assembly) {
  return formatPanama(
    assembly?.scheduledAtUtc || assembly?.scheduledAt || assembly?.ScheduledAtUtc,
    assembly?.timeZoneId || assembly?.TimeZoneId || "America/Panama"
  );
}

function statusPillClass(status) {
  if (status === "InProgress" || status === "CheckIn") return "sent";
  if (status === "Paused") return "sending";
  if (status === "Cancelled") return "failed";
  return "draft";
}

function statusPillLabel(status) {
  const map = {
    Draft: "Borrador",
    Scheduled: "Programada",
    CheckIn: "Mesa abierta",
    InProgress: "En curso",
    Paused: "En pausa",
    Completed: "Finalizada",
    Cancelled: "Cancelada"
  };
  return map[status] || status || "—";
}

function isAdmissionClosedError(error) {
  const code = String(error?.code || error?.payload?.code || error?.payload?.extensions?.code || "");
  const message = String(error?.message || "");
  return code === "ASSEMBLY_NOT_JOINABLE" || /admisión solo aplica/i.test(message);
}

function updateToggleLabels({ persist = true } = {}) {
  const camBtn = qs("#toggle-camera");
  const micBtn = qs("#toggle-mic");
  const camMissing = device.cameraAvailable === false;
  const micMissing = device.micAvailable === false;
  if (camBtn) {
    camBtn.disabled = camMissing || device.cameraDenied === true;
    camBtn.textContent = camMissing ? "Sin cámara" : device.cameraDenied ? "Permiso denegado" : device.camera ? t("lobby.deviceOn") : t("lobby.deviceOff");
    camBtn.setAttribute("aria-pressed", camMissing ? "false" : String(device.camera));
    camBtn.setAttribute("aria-label", camMissing ? "No hay cámara en este equipo" : device.camera ? t("lobby.turnCameraOff") : t("lobby.turnCameraOn"));
  }
  if (micBtn) {
    micBtn.disabled = micMissing || device.micDenied === true;
    micBtn.textContent = micMissing ? "Sin micrófono" : device.micDenied ? "Permiso denegado" : device.mic ? t("lobby.deviceOn") : t("lobby.deviceOff");
    micBtn.setAttribute("aria-pressed", micMissing ? "false" : String(device.mic));
    micBtn.setAttribute("aria-label", micMissing ? "No hay micrófono en este equipo" : device.mic ? t("lobby.muteMic") : t("lobby.unmuteMic"));
  }
  setPreviewTracks({ camera: device.camera && !camMissing, mic: device.mic && !micMissing });
  if (persist && !camMissing && !micMissing && !device.cameraDenied && !device.micDenied) {
    saveDevicePrefs({ cameraEnabled: device.camera, micEnabled: device.mic });
  }
  const hint = qs("#lobby-device-hint");
  if (hint) {
    const notice = deviceNotice();
    hint.hidden = !notice;
    hint.textContent = notice;
  }
}

function deviceNotice() {
  const camMissing = device.cameraAvailable === false;
  const micMissing = device.micAvailable === false;
  const denied = device.permissionDenied === true;
  if (camMissing && micMissing) {
    return "No hay cámara ni micrófono en este equipo. Puedes entrar sin imagen ni sonido.";
  }
  if (camMissing) return "No hay cámara en este equipo. Puedes entrar sin imagen.";
  if (micMissing) return "No hay micrófono en este equipo. Puedes entrar sin sonido.";
  if (denied) return "El navegador bloqueó la cámara y el micrófono. Puedes entrar sin imagen ni sonido.";
  return "";
}

function fillSelect(select, devices, selectedId, emptyLabel) {
  select.innerHTML = devices
    .map(
      (d, i) =>
        `<option value="${escapeHtml(d.deviceId)}" ${d.deviceId === selectedId ? "selected" : ""}>${escapeHtml(d.label || `${d.kind} ${i + 1}`)}</option>`
    )
    .join("");
  if (!devices.length) {
    select.innerHTML = `<option value="">${escapeHtml(emptyLabel)}</option>`;
    select.disabled = true;
  } else {
    select.disabled = false;
  }
}

async function refreshDeviceLists() {
  const prefs = loadDevicePrefs();
  const devices = await enumerateMediaDevices();
  const { cameras, mics, speakers, supportsSinkId } = devices;
  fillSelect(qs("#select-camera"), cameras, prefs.cameraId, "Sin cámara disponible");
  fillSelect(qs("#select-mic"), mics, prefs.micId, "Sin micrófono disponible");
  const speakerField = qs("#speaker-field");
  if (supportsSinkId && speakers.length) {
    speakerField.hidden = false;
    fillSelect(qs("#select-speaker"), speakers, prefs.speakerId, "Sin altavoz disponible");
  } else {
    speakerField.hidden = true;
  }
  const hint = qs("#lobby-device-hint");
  if (hint) {
    const denied = devices.micState === "denied" || devices.camState === "denied";
    const busy = devices.micState === "busy" || devices.camState === "busy";
    const missing = !mics.length && !cameras.length;
    hint.textContent = denied
      ? "Permiso de micrófono o cámara denegado. Puede entrar sin audio ni video."
      : busy
        ? "El micrófono o la cámara están ocupados. Puede entrar sin audio ni video."
        : missing
          ? "No hay micrófono ni cámara. Puede entrar sin audio ni video."
          : "";
    hint.hidden = !hint.textContent;
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

/** Convocation authorizes participation — any resolved self participant is convocated. */
function isConvocated(self) {
  return Boolean(self?.userId || self?.UserId || self?.displayName);
}

function setLobbyState(message, variant = "info") {
  const el = qs("#lobby-state");
  if (!el) return;
  if (!message) {
    el.hidden = true;
    el.textContent = "";
    return;
  }
  el.hidden = false;
  el.className = `alert alert-${variant} lobby-state`;
  el.setAttribute("role", "status");
  el.textContent = message;
}

function selfUserId(user) {
  return String(user?.userId || user?.id || "").toLowerCase();
}

function applyQuorumFact(q) {
  const el = qs("#fact-quorum");
  if (!el) return;
  if (q && q.currentCoefficient != null && q.requiredCoefficient != null) {
    el.textContent = `${Number(q.currentCoefficient).toFixed(2)}% / ${Number(q.requiredCoefficient).toFixed(2)}%`;
  } else if (q && (q.CurrentCoefficient != null || q.RequiredCoefficient != null)) {
    el.textContent = `${Number(q.CurrentCoefficient ?? 0).toFixed(2)}% / ${Number(q.RequiredCoefficient ?? 0).toFixed(2)}%`;
  }
}

function shouldAutoEnterRoom(assembly) {
  const status = assembly?.status || assembly?.Status || "";
  return status === "InProgress" || status === "Paused";
}

function updateEnterGate(self, assembly) {
  const btn = qs("#btn-enter");
  const desk = qs("#btn-open-desk");
  const pill = qs("#lobby-status-pill");
  const whenLine = qs("#lobby-when-line");
  const phLine = qs("#lobby-ph-line");
  const titleEl = qs("#lobby-title");
  const convocated = isConvocated(self);
  const status = assembly?.status || assembly?.Status || "";
  const operator = viewerIsOperator();
  const prep = isPrepStatus(status);
  const admissionOpen = isAdmissionOpen(status);
  const when = scheduledWhen(assembly);

  if (titleEl && assembly?.title) {
    titleEl.textContent = assembly.title;
  }
  if (phLine) {
    phLine.textContent = assembly?.propertyHorizontalName || "PH";
  }
  if (whenLine) {
    whenLine.textContent = when || "Fecha y hora por confirmar (hora de Panamá)";
  }
  if (pill) {
    pill.textContent = statusPillLabel(status);
    pill.className = `conv-status-pill conv-status-pill--${statusPillClass(status)}`;
  }

  if (desk) {
    const showDesk = operator && prep && canOpenDesk() && assemblyId;
    desk.hidden = !showDesk;
    desk.disabled = !showDesk;
    desk.textContent = t("lobby.openDesk");
  }

  qs("#fact-invitation").textContent = convocated
    ? t("lobby.convocated")
    : t("lobby.notConvocated");

  let ready = false;
  let label = t("lobby.enter") || "Entrar a la asamblea";
  let stateMessage = "";
  let stateVariant = "info";

  if (status === "Cancelled") {
    stateMessage = t("lobby.assemblyCancelled");
  } else if (!convocated && !operator) {
    stateMessage = t("lobby.noValidInvitation");
  } else if (operator && prep) {
    ready = Boolean(assemblyId);
    label = t("lobby.enterPrep") || "Entrar a preparar sala";
    stateMessage = t("lobby.prepHint") || "Puedes preparar la sala y probar cámara, micrófono y altavoz. La reunión no inicia hasta que abras la mesa.";
  } else if (!operator && prep) {
    stateMessage = when
      ? (t("lobby.scheduledWait", { when }) || `La asamblea está programada para ${when}. La mesa aún no está abierta.`)
      : (t("lobby.scheduledWaitUnknown") || "La asamblea está programada. La mesa aún no está abierta.");
  } else if (admissionOpen && convocated) {
    ready = Boolean(assemblyId);
    label = t("lobby.enter");
    if (status === "CheckIn") {
      stateMessage = t("lobby.waitingRoomHint");
    } else if (shouldAutoEnterRoom(assembly)) {
      stateMessage = t("lobby.assemblyLiveEnter");
      stateVariant = "success";
    } else if (!meetingAvailable) {
      stateMessage = t("lobby.enterGovernanceOnly");
    } else {
      stateMessage = t("lobby.convocatedEnter");
      stateVariant = "success";
    }
  } else if (operator && admissionOpen) {
    ready = Boolean(assemblyId);
    label = t("lobby.enter");
    stateMessage = t("lobby.enterGovernanceOnly");
  } else {
    stateMessage = t("lobby.assemblyNotJoinable", { status });
  }

  joinReady = ready;
  if (btn) {
    btn.hidden = !ready && !(operator && prep);
    btn.disabled = !ready;
    btn.textContent = label;
  }
  setLobbyState(stateMessage, stateVariant);
  document.body.dataset.lobbyMode = operator && prep ? "prep" : admissionOpen ? "enter" : "wait";
}

let autoEnterScheduled = false;
let entryInFlight = false;
let cameraPrompt = null;

function lobbyText(key, fallback) {
  const value = t(key);
  return !value || value === key ? fallback : value;
}

function askCameraEntry() {
  if (!device.camera) return Promise.resolve("skip");
  const dialog = qs("#camera-entry-dialog");
  if (!dialog?.showModal) return Promise.resolve("on");
  if (cameraPrompt) return cameraPrompt;
  const message = qs("#camera-entry-message");
  const offBtn = qs("#btn-camera-entry-off");
  const onBtn = qs("#btn-camera-entry-on");
  if (message) {
    const prep = isPrepStatus(currentAssembly?.status);
    message.textContent = prep
      ? lobbyText(
          "lobby.prepCameraBody",
          "Vas a preparar la sala. Puedes probar cámara y micrófono; esto no inicia la reunión ni registra asistencia."
        )
      : lobbyText(
          "lobby.cameraEntryBody",
          "Tu cámara está encendida. Al entrar a la asamblea, los demás participantes podrán verte."
        );
  }
  if (offBtn) offBtn.textContent = lobbyText("lobby.cameraEntryOff", "Apagar cámara");
  if (onBtn) onBtn.textContent = lobbyText("lobby.cameraEntryOn", "Entrar con cámara");
  cameraPrompt = new Promise((resolve) => {
    let settled = false;
    const finish = (choice) => {
      if (settled) return;
      settled = true;
      dialog.removeEventListener("cancel", onCancel);
      dialog.removeEventListener("close", onClose);
      dialog.removeEventListener("click", onBackdrop);
      offBtn?.removeEventListener("click", onOff);
      onBtn?.removeEventListener("click", onOn);
      if (dialog.open) dialog.close();
      resolve(choice);
    };
    const onOff = () => finish("off");
    const onOn = () => finish("on");
    const onCancel = (event) => {
      event.preventDefault();
      finish("cancel");
    };
    const onClose = () => finish("cancel");
    const onBackdrop = (event) => {
      if (event.target === dialog) finish("cancel");
    };
    dialog.addEventListener("cancel", onCancel);
    dialog.addEventListener("close", onClose);
    dialog.addEventListener("click", onBackdrop);
    offBtn?.addEventListener("click", onOff);
    onBtn?.addEventListener("click", onOn);
    dialog.showModal();
  }).finally(() => {
    cameraPrompt = null;
  });
  return cameraPrompt;
}

async function beginEntry(options = {}) {
  if (entryInFlight) return false;
  const prep = isPrepStatus(currentAssembly?.status);
  const operator = viewerIsOperator();
  if (device.camera && !prep) {
    const choice = await askCameraEntry();
    if (choice === "cancel") return false;
    if (choice === "off") {
      device.camera = false;
      updateToggleLabels();
    }
  }
  if (entryInFlight) return false;
  entryInFlight = true;
  try {
    await enterAssembly({
      ...options,
      skipAdmission: Boolean(options.skipAdmission) || (operator && prep),
      allowGovernanceOnly: Boolean(options.allowGovernanceOnly) || (operator && prep)
    });
    return true;
  } catch (error) {
    entryInFlight = false;
    throw error;
  }
}

function scheduleAutoEnterIfLive(assembly, self) {
  if (autoEnterScheduled) return;
  if (sessionStorage.getItem(`asambleas-explicit-leave:${assemblyId}`) === "1") return;
  if (!shouldAutoEnterRoom(assembly)) return;
  if (!isConvocated(self)) return;
  if (["Cancelled", "Completed"].includes(assembly?.status || "")) return;
  autoEnterScheduled = true;
  document.documentElement.dataset.lobbyAutoEnter = "scheduled";
  showToast({
    title: t("lobby.assemblyStartedTitle") || "Asamblea iniciada",
    message: t("lobby.assemblyStartedBody") || "Entrando a la sala en tiempo real…",
    variant: "success"
  });
  window.setTimeout(() => {
    beginEntry({ allowGovernanceOnly: true })
      .then((entered) => {
        document.documentElement.dataset.lobbyAutoEnter = entered ? "ok" : "camera-choice";
      })
      .catch((err) => {
        document.documentElement.dataset.lobbyAutoEnter = "fail";
        console.warn("Auto-enter failed", err);
        try {
          stopDevicePreview(qs("#preview-video"));
          stopMeterLoop();
        } catch {
          /* ignore */
        }
        location.href = `/assembly.html?assemblyId=${assemblyId}`;
      });
  }, 350);
}

async function refreshLobbySnapshot() {
  if (!assemblyId || !currentUser) return;
  try {
    const snap = await hydrateRoomState(assemblyId, {
      userId: selfUserId(currentUser)
    });
    currentAssembly = snap.assembly || currentAssembly;
    currentSelf = resolveSelf(snap, currentUser) || currentSelf;
    if (snap.quorum) applyQuorumFact(snap.quorum);
    updateEnterGate(currentSelf, currentAssembly);
    scheduleAutoEnterIfLive(currentAssembly, currentSelf);
  } catch {
    /* transient */
  }
}

function applySelfUpdate(participant) {
  if (!participant || !currentUser) return;
  const uid = selfUserId(currentUser);
  const pid = String(participant.userId || participant.UserId || "").toLowerCase();
  if (!uid || uid !== pid) return;
  currentSelf = {
    ...(currentSelf || {}),
    ...participant,
    userId: participant.userId || participant.UserId || currentSelf?.userId
  };
  updateEnterGate(currentSelf, currentAssembly);
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
      ? "La sala admite ingreso."
      : info?.unavailableReason || t("lobby.avBlocked");
  } catch {
    meetingAvailable = false;
    qs("#fact-meeting").textContent = t("lobby.avBlocked");
  }

  const prefs = loadDevicePrefs();
  if (typeof prefs.cameraEnabled === "boolean") device.camera = prefs.cameraEnabled;
  if (typeof prefs.micEnabled === "boolean") device.mic = prefs.micEnabled;
  await refreshDeviceLists();
  const camSelect = qs("#select-cam, #select-camera");
  const micSelect = qs("#select-mic");
  device.cameraAvailable = Boolean(camSelect && [...camSelect.options].some((o) => o.value));
  device.micAvailable = Boolean(micSelect && [...micSelect.options].some((o) => o.value));
  if (!device.cameraAvailable) device.camera = false;
  if (!device.micAvailable) device.mic = false;

  const result = await startDevicePreview(video, { camera: device.camera, mic: device.mic });

  if (result.stream) {
    video.hidden = false;
    fallback.hidden = true;
    startMeterLoop();
  } else {
    video.hidden = true;
    fallback.hidden = false;
    const httpsUrl = mediaHttpsUrl();
    if (httpsUrl && !window.isSecureContext) {
      fallback.innerHTML = `${escapeHtml(t("lobby.insecureContext"))}
        <p style="margin-top:0.75rem"><a class="btn btn-primary" href="${escapeHtml(httpsUrl)}">${escapeHtml(t("lobby.openHttps"))}</a></p>`;
    } else {
      fallback.textContent = result.error || t("lobby.avDenied");
    }
  }
  device.cameraDenied = Boolean(result?.cameraDenied);
  device.micDenied = Boolean(result?.micDenied);
  device.permissionDenied = device.cameraDenied || device.micDenied;
  if (result?.error && /notfound|devicenotfound|requested device not found|no hay/i.test(String(result.error))) {
    device.cameraAvailable = false;
    device.micAvailable = false;
    device.camera = false;
    device.mic = false;
  }
  if (!result?.stream && device.permissionDenied) {
    device.camera = false;
    device.mic = false;
  }
  updateToggleLabels({ persist: false });
  if (!result?.stream && fallback && window.isSecureContext && deviceNotice()) {
    fallback.textContent = "Sin vista previa.";
  }
}

async function enterAssembly(options = {}) {
  const allowGovernanceOnly = Boolean(options.allowGovernanceOnly);
  const skipAdmission = Boolean(options.skipAdmission);
  const btn = qs("#btn-enter");
  const stages = qs("#staged-loading");
  const waitPanel = qs("#admission-wait");
  if (btn) btn.disabled = true;
  if (stages) stages.hidden = false;

  const steps = [
    { key: "verify", label: t("lobby.verifying") },
    { key: "token", label: t("lobby.connecting") },
    { key: "sync", label: t("lobby.synchronizing") }
  ];
  if (stages) {
    stages.innerHTML = steps.map((s, i) => `<li data-step="${i}">${escapeHtml(s.label)}</li>`).join("");
  }

  try {
    stages?.querySelector('[data-step="0"]')?.setAttribute("aria-current", "true");
    const user = currentUser || (await me());
    currentUser = user;
    const room = await hydrateRoomState(assemblyId, {
      userId: user?.id || user?.userId
    });
    const self = resolveSelf(room, user);
    const status = room?.assembly?.status || currentAssembly?.status || "";
    const operator = isOperator(user);
    const prep = isPrepStatus(status);
    if (!isConvocated(self) && !operator) {
      throw new Error(t("lobby.noValidInvitation"));
    }

    // Admission (request-entry) is only for an open desk/assembly.
    // Operator prep must not admit, notify, or count quorum.
    const skipPrepAdmission = skipAdmission || (operator && prep);
    if (!skipPrepAdmission) {
      const { api } = await import("./api.js");
      const entry = await api(`/api/assemblies/${assemblyId}/attendance/lobby/request-entry`, {
        method: "POST"
      });
      const entryStatus = entry?.roomEntryStatus || entry?.RoomEntryStatus || "";
      if (/Rejected/i.test(entryStatus)) {
        throw new Error(
          entry?.roomEntryRejectReason ||
            "No puedes entrar en este momento. Revisa tu invitación o contacta a la mesa."
        );
      }
    }

    stages?.querySelectorAll("li").forEach((li) => li.removeAttribute("aria-current"));
    stages?.querySelector('[data-step="1"]')?.setAttribute("aria-current", "true");
    if (meetingAvailable) {
      try {
        await fetchJoinToken(assemblyId);
      } catch (err) {
        if (!allowGovernanceOnly && !prep) throw err;
        console.warn("Join token unavailable; entering governance-only", err);
      }
    }

    stages?.querySelectorAll("li").forEach((li) => li.removeAttribute("aria-current"));
    stages?.querySelector('[data-step="2"]')?.setAttribute("aria-current", "true");
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
    if (isAdmissionClosedError(error)) {
      updateEnterGate(currentSelf, currentAssembly);
    } else {
      showError(error.message || t("networkError"));
    }
    if (btn) btn.disabled = false;
    if (stages) stages.hidden = true;
    throw error;
  }
}

async function init() {
  await initI18n();

  // Camera/mic require HTTPS — leave http://IP:8092 immediately.
  if (redirectToHttpsForMedia()) {
    const fallback = qs("#preview-fallback");
    if (fallback) {
      fallback.hidden = false;
      fallback.textContent = t("lobby.redirectingHttps");
    }
    return;
  }

  qs("#label-camera").textContent = t("lobby.camera");
  qs("#label-mic").textContent = t("lobby.microphone");
  qs("#label-camera-select").textContent = t("lobby.camera");
  qs("#label-mic-select").textContent = t("lobby.microphone");
  qs("#label-speaker-select").textContent = t("lobby.speaker");
  qs("#label-mic-level").textContent = t("lobby.micLevel");
  qs("#btn-enter").textContent = t("lobby.enter");
  const deskBtn = qs("#btn-open-desk");
  if (deskBtn) deskBtn.textContent = t("lobby.openDesk");

  if (!assemblyId) {
    assemblyId = await ensureAssemblyIdOrRedirect();
    if (!assemblyId) {
      showError(t("dashboard.missingId"));
      return;
    }
    return;
  }

  try {
    currentUser = await me();
  } catch {
    location.href = "/";
    return;
  }
  const user = currentUser;

  await bootIaPage({ current: "asm-room", pageLabel: "Sala", allowOwnerPortal: true });

  let room;
  try {
    room = await hydrateRoomState(assemblyId, {
      userId: user?.id || user?.userId
    });
  } catch (error) {
    showError(error.message);
    setLobbyState(error.message || "No se pudo cargar la sala.", "error");
    await setupPreview();
    return;
  }

  if (room._fallbackMessage) {
    showToast(room._fallbackMessage, "info");
  }

  const assembly = room.assembly;
  currentAssembly = assembly;
  if (isTerminalStatus(assembly?.status)) {
    location.replace(historicalOverviewUrl(assemblyId, assembly.status));
    return;
  }

  const titleEl = qs("#lobby-title");
  if (titleEl) titleEl.textContent = assembly?.title || t("lobby.title");
  const phLine = qs("#lobby-ph-line");
  if (phLine) phLine.textContent = assembly?.propertyHorizontalName || "PH";

  const self = resolveSelf(room, user);
  currentSelf = self;
  qs("#fact-participant").textContent = self?.displayName || user.displayName;
  qs("#fact-unit").textContent = self?.unitCode || "—";
  qs("#fact-invitation").textContent = isConvocated(self)
    ? t("lobby.convocated")
    : t("lobby.notConvocated");
  const coeff = Number(self?.effectiveCoefficientPercent || self?.coefficientPercent || 0);
  qs("#fact-representation").textContent = `${coeff.toFixed(3)}%`;
  qs("#fact-connection").textContent = "Sin datos";

  if (room.quorum) {
    const q = room.quorum;
    qs("#fact-quorum").textContent = `${Number(q.currentCoefficient).toFixed(2)}% / ${Number(q.requiredCoefficient).toFixed(2)}%`;
  } else {
    qs("#fact-quorum").textContent = "—";
  }

  const dts = qs("#participant-facts").querySelectorAll("dt");
  const labels = [
    t("lobby.participant"),
    t("lobby.unit"),
    t("lobby.invitation"),
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
  scheduleAutoEnterIfLive(assembly, self);

  try {
    await ensureSignalR();
    hub = createAssemblyConnection({
      onConnectionState: (status) => {
        const el = qs("#fact-connection");
        if (!el) return;
        if (status === "reconnecting") {
          el.textContent = t("connection.reconnectingAssembly") || "Reconectando con la asamblea…";
          showToast(t("connection.reconnectingAssembly") || "Reconectando con la asamblea…", "info");
        } else if (status === "connected") {
          el.textContent = "Datos conectados";
        } else if (status === "disconnected") {
          el.textContent = "Sin datos";
          showToast(
            t("connection.reconnectFailed") ||
              "No fue posible recuperar la conexión. Intentando nuevamente…",
            "warn"
          );
        }
      },
      onReconnected: async () => {
        showToast(t("connection.restoredShort") || "Conexión restablecida.", "success");
        await refreshLobbySnapshot();
      },
      onReconnectError: () => {
        showToast(
          t("connection.reconnectFailed") ||
            "No fue posible recuperar la conexión. Intentando nuevamente…",
          "warn"
        );
      },
      participantUpdated: (p) => applySelfUpdate(p),
      quorumUpdated: (q) => {
        applyQuorumFact(q);
      },
      assemblyStatusChanged: async (asm) => {
        if (!asm) return;
        currentAssembly = {
          ...(currentAssembly || {}),
          ...asm,
          id: asm.id || asm.Id || currentAssembly?.id,
          status: asm.status || asm.Status
        };
        updateEnterGate(currentSelf, currentAssembly);
        await refreshLobbySnapshot();
        scheduleAutoEnterIfLive(currentAssembly, currentSelf);
      },
      joinSummonRequested: attachJoinSummonListener({
        getUserId: () => selfUserId(currentUser),
        onJoin: () => {
          enterAssembly({ allowGovernanceOnly: true }).catch(() => {
            location.href = `/assembly.html?assemblyId=${assemblyId}`;
          });
        }
      }),
      roomEntryChanged: (chg) => {
        const uid = selfUserId(currentUser);
        const target = String(chg?.userId || chg?.UserId || "").toLowerCase();
        if (!uid || target !== uid) return;
        const status = chg?.roomEntryStatus || chg?.RoomEntryStatus || "";
        const msg = chg?.message || chg?.Message || "";
        if (/Admitted/i.test(status)) {
          showToast({ title: "Admitido", message: msg || "Entrando…", variant: "success" });
          enterAssembly({ allowGovernanceOnly: true, skipAdmission: true }).catch(() => {
            location.href = `/assembly.html?assemblyId=${assemblyId}`;
          });
        } else if (/Rejected/i.test(status)) {
          const waitPanel = qs("#admission-wait");
          if (waitPanel) waitPanel.hidden = true;
          const btn = qs("#btn-enter");
          if (btn) {
            btn.disabled = false;
            updateEnterGate(currentSelf, currentAssembly);
          }
          showError(chg?.rejectReason || chg?.RejectReason || msg || "Ingreso rechazado.");
        } else if (/Waiting/i.test(status)) {
          const waitPanel = qs("#admission-wait");
          if (waitPanel) waitPanel.hidden = false;
        }
      }
    });
    await hub.start(assemblyId, { markPresence: false });
    document.documentElement.dataset.lobbyHub = "connected";
    await refreshLobbySnapshot();
  } catch (err) {
    console.warn("Lobby SignalR unavailable", err);
    document.documentElement.dataset.lobbyHub = "offline";
  }

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
    updateEnterGate(currentSelf, currentAssembly);
  });
  qs("#select-mic")?.addEventListener("change", async (e) => {
    saveDevicePrefs({ micId: e.target.value });
    await setupPreview();
    updateEnterGate(currentSelf, currentAssembly);
  });
  qs("#select-speaker")?.addEventListener("change", (e) => {
    saveDevicePrefs({ speakerId: e.target.value });
  });
  qs("#btn-camera-entry-close")?.addEventListener("click", () => {
    qs("#camera-entry-dialog")?.close();
  });
  qs("#btn-enter").addEventListener("click", () => {
    clearActionError();
    beginEntry().catch((error) => {
      if (!isAdmissionClosedError(error)) {
        showError(error.message);
      }
      const btn = qs("#btn-enter");
      if (btn) btn.disabled = false;
    });
  });
  qs("#btn-open-desk")?.addEventListener("click", async () => {
    if (!canOpenDesk() || !isPrepStatus(currentAssembly?.status)) return;
    const desk = qs("#btn-open-desk");
    clearActionError();
    if (desk) {
      desk.disabled = true;
      desk.textContent = "Abriendo mesa…";
    }
    try {
      const { api } = await import("./api.js");
      const updated = await api(`/api/assemblies/${assemblyId}/start-checkin`, { method: "POST" });
      currentAssembly = {
        ...(currentAssembly || {}),
        ...(updated || {}),
        status: updated?.status || "CheckIn"
      };
      updateEnterGate(currentSelf, currentAssembly);
      showToast("Mesa abierta. Los convocados ya pueden entrar.", "success");
    } catch (err) {
      showError(err.message || t("networkError"));
      if (desk) {
        desk.disabled = false;
        desk.textContent = t("lobby.openDesk");
      }
    }
  });
  qs("#btn-cancel-entry")?.addEventListener("click", async () => {
    try {
      const { api } = await import("./api.js");
      await api(`/api/assemblies/${assemblyId}/attendance/lobby/cancel-entry`, { method: "POST" });
      const waitPanel = qs("#admission-wait");
      if (waitPanel) waitPanel.hidden = true;
      const btn = qs("#btn-enter");
      if (btn) {
        btn.disabled = false;
        btn.textContent = t("lobby.enter");
      }
      showToast({ title: "Solicitud cancelada", message: "Puede volver a solicitar ingreso cuando esté listo.", variant: "info" });
    } catch (err) {
      showError(err.message || t("networkError"));
    }
  });

  window.addEventListener("beforeunload", () => {
    stopDevicePreview(qs("#preview-video"));
    stopMeterLoop();
    try {
      hub?.stop?.(assemblyId);
    } catch {
      /* ignore */
    }
  });
}

init().catch((error) => {
  console.error(error);
  showError(error.message || t("networkError"));
});
