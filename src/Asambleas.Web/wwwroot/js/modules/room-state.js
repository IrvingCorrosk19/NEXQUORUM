import { api } from "./api.js";
import { t } from "../i18n/i18n.js";

/**
 * Fetches a JSON API path. On 404 returns { ok:false, status:404, data:null, message }.
 * Other errors throw (same as api) unless soft=true.
 */
export async function softGet(path, { softStatuses = [404] } = {}) {
  try {
    const data = await api(path);
    return { ok: true, status: 200, data, message: null };
  } catch (error) {
    if (softStatuses.includes(error.status)) {
      return {
        ok: false,
        status: error.status,
        data: null,
        message: t("apiUnavailable", { status: error.status })
      };
    }
    throw error;
  }
}

export async function getDashboard(assemblyId) {
  return softGet(`/api/assemblies/${assemblyId}/dashboard`);
}

export async function getReadiness(assemblyId) {
  return softGet(`/api/assemblies/${assemblyId}/readiness`);
}

export async function getRoomState(assemblyId) {
  return softGet(`/api/assemblies/${assemblyId}/room-state`);
}

export async function getMinutes(assemblyId) {
  return softGet(`/api/assemblies/${assemblyId}/minutes`);
}

export async function getEvidence(assemblyId) {
  return softGet(`/api/assemblies/${assemblyId}/evidence`);
}

export async function getParticipants(assemblyId) {
  return softGet(`/api/assemblies/${assemblyId}/attendance/participants`);
}

export async function resumeAssembly(assemblyId) {
  return api(`/api/assemblies/${assemblyId}/resume`, { method: "POST" });
}

/**
 * Hydrate room state from dedicated endpoint, falling back to assembly detail + queue.
 * Never invents quorum/votes — only API data.
 */
export async function hydrateRoomState(assemblyId) {
  const room = await getRoomState(assemblyId);
  if (room.ok && room.data) {
    return normalizeRoomState(room.data);
  }

  const assembly = await api(`/api/assemblies/${assemblyId}`);
  let queue = null;
  try {
    queue = await api(`/api/assemblies/${assemblyId}/speakers/queue`);
  } catch {
    queue = null;
  }

  const participantsResult = await getParticipants(assemblyId);

  return normalizeRoomState({
    assembly,
    quorum: null,
    agenda: null,
    motion: null,
    votingSession: null,
    session: null,
    tally: null,
    speakerQueue: queue,
    queue,
    participants: participantsResult.ok ? participantsResult.data : [],
    viewerRole: null,
    self: null,
    myVote: null,
    startedAtUtc: null,
    _fallback: true,
    _fallbackMessage: room.message
  });
}

export function normalizeRoomState(raw) {
  if (!raw) {
    return emptyRoomState();
  }

  const assembly = raw.assembly || raw.assemblyDetail || null;
  const agenda = raw.agenda || raw.agendaList || null;
  const queue = raw.speakerQueue || raw.queue || raw.speakers || null;
  const session = raw.votingSession || raw.session || raw.voting || null;
  const participants = Array.isArray(raw.participants)
    ? raw.participants
    : Array.isArray(raw.participants?.items)
      ? raw.participants.items
      : [];

  return {
    assembly,
    quorum: raw.quorum || raw.quorumState || null,
    agenda,
    motion: raw.motion || raw.currentMotion || null,
    session,
    tally: raw.tally || raw.voteTally || null,
    queue,
    participants,
    viewerRole: raw.viewerRole || raw.viewer?.role || null,
    self: raw.self || raw.participant || raw.me || null,
    myVote: raw.myVote || raw.voteReceipt || null,
    startedAtUtc: raw.assemblyStartedAtUtc || raw.startedAtUtc || assembly?.startedAtUtc || assembly?.assemblyStartedAtUtc || null,
    votingOpenedAtUtc: session?.openedAtUtc || raw.votingOpenedAtUtc || null,
    _fallback: Boolean(raw._fallback),
    _fallbackMessage: raw._fallbackMessage || null
  };
}

function emptyRoomState() {
  return {
    assembly: null,
    quorum: null,
    agenda: null,
    motion: null,
    session: null,
    tally: null,
    queue: null,
    participants: [],
    viewerRole: null,
    self: null,
    myVote: null,
    startedAtUtc: null,
    votingOpenedAtUtc: null,
    _fallback: true,
    _fallbackMessage: null
  };
}

/** Primary dashboard CTA key by assembly status. */
export function primaryCtaForStatus(status) {
  switch (status) {
    case "Draft":
      return "prepare";
    case "Scheduled":
      return "startCheckin";
    case "CheckIn":
      return "start";
    case "InProgress":
    case "Paused":
      return "continue";
    case "Completed":
      return "results";
    default:
      return "continue";
  }
}
