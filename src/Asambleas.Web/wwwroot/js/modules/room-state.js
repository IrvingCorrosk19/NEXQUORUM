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
 * @param {string} assemblyId
 * @param {{ userId?: string }=} options  When set, resolves `self` from participants if API omits it.
 */
export async function hydrateRoomState(assemblyId, options = {}) {
  const userId = options.userId || null;
  const room = await getRoomState(assemblyId);
  if (room.ok && room.data) {
    return normalizeRoomState(room.data, userId);
  }

  const assembly = await api(`/api/assemblies/${assemblyId}`);
  let queue = null;
  try {
    queue = await api(`/api/assemblies/${assemblyId}/speakers/queue`);
  } catch {
    queue = null;
  }

  const participantsResult = await getParticipants(assemblyId);

  return normalizeRoomState(
    {
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
    },
    userId
  );
}

export function normalizeRoomState(raw, userIdHint = null) {
  if (!raw) {
    return emptyRoomState();
  }

  const assembly = raw.assembly || raw.assemblyDetail || null;

  // Agenda: API may send AgendaListResponse OR bare AgendaItemDto[]
  let agenda = raw.agenda || raw.agendaList || null;
  if (Array.isArray(agenda)) {
    agenda = {
      assemblyId: assembly?.id,
      activeAgendaItemId: assembly?.activeAgendaItemId || null,
      items: agenda
    };
  } else if (agenda && Array.isArray(agenda.items)) {
    agenda = {
      ...agenda,
      activeAgendaItemId:
        agenda.activeAgendaItemId ?? assembly?.activeAgendaItemId ?? null
    };
  }

  // Speakers: API may send SpeakerQueueDto OR bare SpeakerRequestDto[]
  let queue = raw.speakerQueue || raw.queue || raw.speakers || null;
  if (Array.isArray(queue)) {
    const current =
      queue.find((s) => s.status === "Granted")?.id ||
      raw.currentSpeakerRequestId ||
      null;
    queue = {
      assemblyId: assembly?.id,
      currentSpeakerRequestId: current,
      queue
    };
  } else if (queue && Array.isArray(queue.queue)) {
    queue = {
      ...queue,
      currentSpeakerRequestId:
        queue.currentSpeakerRequestId ||
        queue.queue.find((s) => s.status === "Granted")?.id ||
        null
    };
  }

  const session =
    raw.openVotingSession || raw.votingSession || raw.session || raw.voting || null;
  const tally =
    raw.openSessionResultsOrNull || raw.tally || raw.voteTally || null;
  const motion = raw.activeMotion || raw.motion || raw.currentMotion || null;

  const participants = Array.isArray(raw.participants)
    ? raw.participants
    : Array.isArray(raw.participants?.items)
      ? raw.participants.items
      : [];

  let myVote = raw.myVote || raw.voteReceipt || null;
  if (!myVote && (raw.currentUserHasVoted || raw.CurrentUserHasVoted)) {
    myVote = {
      evidenceId: raw.currentUserEvidenceId || raw.CurrentUserEvidenceId || null,
      castAtUtc: null
    };
  }

  let self =
    raw.self ||
    raw.participant ||
    raw.me ||
    null;
  if (!self && userIdHint) {
    self =
      participants.find(
        (p) =>
          String(p.userId || "").toLowerCase() === String(userIdHint).toLowerCase()
      ) || null;
  }

  return {
    assembly,
    quorum: raw.quorum || raw.quorumState || null,
    agenda,
    motion,
    session,
    tally,
    queue,
    participants,
    viewerRole: raw.viewerRole || raw.viewer?.role || null,
    self,
    myVote,
    startedAtUtc:
      raw.assemblyStartedAtUtc ||
      raw.startedAtUtc ||
      assembly?.startedAtUtc ||
      assembly?.assemblyStartedAtUtc ||
      null,
    votingOpenedAtUtc: session?.openedAtUtc || raw.votingOpenedAtUtc || null,
    screenShare: raw.screenShare || raw.ScreenShare || null,
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
    screenShare: null,
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
    case "Cancelled":
      return "results";
    default:
      return "continue";
  }
}
