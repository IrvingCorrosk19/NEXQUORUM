import { api } from "./api.js";
import { confirmDialog, showToast, escapeHtml } from "./ui.js";
import { hasPermission } from "./auth.js";

/**
 * "Avisar para unirse" — president summons absent participants via SignalR.
 */
export function canSummonParticipants(user) {
  return (
    hasPermission(user, "assembly:manage") ||
    hasPermission(user, "meeting:moderate") ||
    hasPermission(user, "assembly:start")
  );
}

export async function summonParticipant(assemblyId, userId) {
  return api(`/api/assemblies/${assemblyId}/attendance/participants/${userId}/summon`, {
    method: "POST"
  });
}

export async function summonAllAbsent(assemblyId) {
  return api(`/api/assemblies/${assemblyId}/attendance/summon-absent`, { method: "POST" });
}

export async function confirmAndSummonAll(assemblyId, absentCount) {
  const ok = await confirmDialog({
    title: "Avisar a todos los ausentes",
    body:
      `Se enviará un aviso en tiempo real a ${absentCount} participante${absentCount === 1 ? "" : "s"} ausente${absentCount === 1 ? "" : "s"}.\n\n` +
      "No se avisará a quienes ya estén conectados.\n" +
      "No se duplicarán avisos activos (espera de 60 s por persona).",
    confirmLabel: "Avisar participantes",
    cancelLabel: "Cancelar"
  });
  if (!ok) return null;
  return summonAllAbsent(assemblyId);
}

function playGentleChime() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = 880;
    g.gain.value = 0.04;
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    o.stop(ctx.currentTime + 0.4);
    setTimeout(() => ctx.close().catch(() => {}), 500);
  } catch {
    /* optional */
  }
}

function vibrateOnce() {
  try {
    if (navigator.vibrate) navigator.vibrate(120);
  } catch {
    /* optional */
  }
}

async function maybeBrowserNotify(title, body) {
  try {
    if (!("Notification" in window) || document.visibilityState === "visible") return;
    if (Notification.permission === "default") {
      await Notification.requestPermission();
    }
    if (Notification.permission === "granted") {
      new Notification(title, { body, tag: "asambleas-join-summon" });
    }
  } catch {
    /* optional */
  }
}

/**
 * Mount listener that shows join prompt for the current user only.
 */
export function attachJoinSummonListener(handlers) {
  return async (payload) => {
    const uid = String(handlers.getUserId?.() || "").toLowerCase();
    const target = String(payload?.targetUserId || payload?.TargetUserId || "").toLowerCase();
    if (!uid || !target || uid !== target) return;

    playGentleChime();
    vibrateOnce();
    const title = payload.assemblyTitle || payload.AssemblyTitle || "Asamblea";
    const ph = payload.propertyHorizontalName || payload.PropertyHorizontalName || "";
    const msg =
      payload.message ||
      payload.Message ||
      "El presidente ha iniciado la asamblea y solicita que te unas";
    await maybeBrowserNotify("ASAMBLEAS", msg);

    const existing = document.getElementById("join-summon-dialog");
    if (existing) existing.remove();

    const dialog = document.createElement("dialog");
    dialog.id = "join-summon-dialog";
    dialog.className = "dialog join-summon-dialog";
    dialog.innerHTML = `
      <h2 id="join-summon-title">Aviso de la asamblea</h2>
      <p class="dialog-body">${escapeHtml(msg)}</p>
      <p><strong>${escapeHtml(title)}</strong></p>
      <p class="muted">${escapeHtml(ph)}</p>
      <div class="dialog-actions">
        <button type="button" class="btn btn-secondary" data-summon-dismiss>Ahora no</button>
        <button type="button" class="btn btn-primary" data-summon-join>Unirme ahora</button>
      </div>
    `;
    document.body.appendChild(dialog);
    dialog.showModal();
    dialog.querySelector("[data-summon-dismiss]")?.addEventListener("click", () => {
      dialog.close();
      dialog.remove();
      handlers.onDismiss?.(payload);
    });
    dialog.querySelector("[data-summon-join]")?.addEventListener("click", () => {
      dialog.close();
      dialog.remove();
      handlers.onJoin?.(payload);
    });
  };
}

export function renderSummonActionsHtml({ userId, connected }) {
  if (connected) return "";
  return `<button type="button" class="btn btn-secondary btn-sm" data-summon-user="${userId}" title="Avisar para unirse">
    <span aria-hidden="true">🔔</span> Avisar para unirse
  </button>`;
}

export function showSummonToast(result) {
  if (!result) return;
  const status = result.status || result.Status;
  const detail = result.detail || result.Detail || "";
  if (status === "Notified") showToast(detail || "Aviso enviado.", "success");
  else if (status === "SkippedConnected") showToast(detail || "Ya está conectado.", "info");
  else if (status === "SkippedCooldown") showToast(detail || "Espere antes de avisar de nuevo.", "warn");
  else showToast(detail || "No fue posible avisar.", "error");
}
