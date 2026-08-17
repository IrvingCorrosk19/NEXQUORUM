import { api } from "./api.js";
import { t } from "../i18n/i18n.js";
import { escapeHtml } from "./ui.js";

export async function requestFloor(assemblyId, displayName = null) {
  return api(`/api/assemblies/${assemblyId}/speakers/request`, {
    method: "POST",
    body: { displayName },
    dedupeKey: `speakers-request:${assemblyId}`
  });
}

/** Active queue only (Requested + Granted) for operator / owner UX. */
export function activeSpeakerQueue(queue) {
  if (!queue) return { assemblyId: null, currentSpeakerRequestId: null, queue: [] };
  return {
    ...queue,
    queue: (queue.queue || []).filter((s) => {
      const st = String(s.status || s.Status || "").toLowerCase();
      return st === "requested" || st === "granted";
    })
  };
}

/** 1-based position among Requested items for this request id. */
export function queuePositionFor(queue, requestId) {
  const requested = (queue?.queue || [])
    .filter((s) => String(s.status || s.Status || "").toLowerCase() === "requested")
    .sort((a, b) => (a.queueOrder ?? a.QueueOrder ?? 0) - (b.queueOrder ?? b.QueueOrder ?? 0));
  const idx = requested.findIndex((s) => String(s.id || s.Id) === String(requestId));
  return idx >= 0 ? idx + 1 : null;
}

/** Lower own raised hand (cancel Requested). Idempotent on server. */
export async function cancelOwnFloor(assemblyId) {
  return api(`/api/assemblies/${assemblyId}/speakers/cancel`, {
    method: "POST",
    dedupeKey: `speakers-cancel:${assemblyId}`
  });
}

/** End own Granted floor. Idempotent on server. */
export async function completeOwnFloor(assemblyId) {
  return api(`/api/assemblies/${assemblyId}/speakers/complete-own`, {
    method: "POST",
    dedupeKey: `speakers-complete-own:${assemblyId}`
  });
}

export async function grantFloor(assemblyId, speakerRequestId) {
  return api(`/api/assemblies/${assemblyId}/speakers/${speakerRequestId}/grant`, {
    method: "POST"
  });
}

export async function completeFloor(assemblyId, speakerRequestId) {
  return api(`/api/assemblies/${assemblyId}/speakers/${speakerRequestId}/complete`, {
    method: "POST"
  });
}

export async function rejectFloor(assemblyId, speakerRequestId) {
  return api(`/api/assemblies/${assemblyId}/speakers/${speakerRequestId}/reject`, {
    method: "POST"
  });
}

export async function skipFloor(assemblyId, speakerRequestId) {
  return api(`/api/assemblies/${assemblyId}/speakers/${speakerRequestId}/skip`, {
    method: "POST"
  });
}

export async function getQueue(assemblyId) {
  return api(`/api/assemblies/${assemblyId}/speakers/queue`);
}

export function renderSpeakerQueue(
  root,
  queue,
  { canModerate, onGrant, onComplete, onReject, onSkip } = {}
) {
  if (!root) {
    return;
  }

  if (!queue?.queue?.length) {
    root.innerHTML = `
      <div class="empty-state panel-compact-empty" role="status">
        <p class="empty-state-what">${escapeHtml(t("assembly.noSpeakers"))}</p>
        <p class="empty-state-why">${escapeHtml(t("assembly.noSpeakersWhy"))}</p>
      </div>`;
    return;
  }

  const sorted = [...queue.queue].sort((a, b) => (a.queueOrder ?? 0) - (b.queueOrder ?? 0));
  const currentId = queue.currentSpeakerRequestId;

  root.innerHTML = `
    <ol class="speaker-queue">
      ${sorted
        .map((item, index) => {
          const isSpeaking = item.id === currentId || item.status === "Granted";
          const wait = waitLabel(item);
          const order = String(index + 1).padStart(2, "0");
          return `
        <li class="${isSpeaking ? "is-speaking" : ""}" data-status="${escapeHtml(item.status || "")}">
          <span class="speaker-order metric-number" aria-hidden="true">${order}</span>
          <div class="speaker-info">
            <strong>${escapeHtml(item.displayName)}</strong>
            <span class="speaker-wait">${
              isSpeaking
                ? escapeHtml(t("assembly.speaking"))
                : wait
                  ? escapeHtml(wait)
                  : escapeHtml(item.status || "")
            }</span>
          </div>
          <div class="speaker-actions cluster">
          ${
            canModerate && item.status === "Requested"
              ? `<button type="button" class="btn btn-secondary" data-grant="${item.id}">${escapeHtml(t("assembly.grant"))}</button>
                 <button type="button" class="btn btn-ghost" data-skip="${item.id}">${escapeHtml(t("assembly.skip") || "Omitir")}</button>
                 <button type="button" class="btn btn-ghost" data-reject="${item.id}">${escapeHtml(t("assembly.reject"))}</button>`
              : ""
          }
          ${
            canModerate && item.status === "Granted"
              ? `<button type="button" class="btn btn-secondary" data-complete="${item.id}">${escapeHtml(t("assembly.complete"))}</button>`
              : ""
          }
          </div>
        </li>`;
        })
        .join("")}
    </ol>
  `;

  root.querySelectorAll("[data-grant]").forEach((btn) => {
    btn.addEventListener("click", () => onGrant?.(btn.getAttribute("data-grant")));
  });
  root.querySelectorAll("[data-complete]").forEach((btn) => {
    btn.addEventListener("click", () => onComplete?.(btn.getAttribute("data-complete")));
  });
  root.querySelectorAll("[data-reject]").forEach((btn) => {
    btn.addEventListener("click", () => onReject?.(btn.getAttribute("data-reject")));
  });
  root.querySelectorAll("[data-skip]").forEach((btn) => {
    btn.addEventListener("click", () => onSkip?.(btn.getAttribute("data-skip")));
  });
}

function waitLabel(item) {
  const raw = item.requestedAtUtc || item.RequestedAtUtc || item.waitingSinceUtc;
  if (!raw) return null;
  const ms = Date.now() - new Date(raw).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  // mm:ss for queue wait clarity
  const totalSec = Math.floor(ms / 1000);
  const mm = String(Math.floor(totalSec / 60)).padStart(2, "0");
  const ss = String(totalSec % 60).padStart(2, "0");
  return t("assembly.waitAgo", { t: `${mm}:${ss}` }) || `${mm}:${ss}`;
}
