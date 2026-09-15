/**
 * Global join-summon presence: keep SignalR connected for live assemblies
 * so "Avisar para unirse" reaches owners on dashboard/portal (not only lobby/room).
 */
import { me } from "./auth.js";
import { createAssemblyConnection } from "./signalr-client.js";
import { attachJoinSummonListener } from "./join-summon.js";
import { api } from "./api.js";

let started = false;
const hubs = new Map(); // assemblyId -> connection

function selfUserId(user) {
  return String(user?.userId || user?.id || "").toLowerCase();
}

async function listLiveAssemblyIds() {
  const ids = new Set();
  try {
    const next = await api("/api/calendar/next");
    const n = next?.assemblyId || next?.AssemblyId;
    if (n) ids.add(String(n));
  } catch {
    /* optional */
  }
  try {
    const events = await api("/api/calendar/events?take=20");
    const list = Array.isArray(events) ? events : events?.items || [];
    for (const ev of list) {
      const st = String(ev.status || ev.Status || "");
      const cal = String(ev.calendarStatus || ev.CalendarStatus || "");
      if (/InProgress|Paused|CheckIn/i.test(st) || /LIVE|CHECKIN/i.test(cal)) {
        const id = ev.assemblyId || ev.AssemblyId || ev.id;
        if (id) ids.add(String(id));
      }
    }
  } catch {
    /* optional */
  }
  // Dashboard deep-link
  try {
    const q = new URLSearchParams(location.search);
    const aid = q.get("assemblyId");
    if (aid) ids.add(aid);
  } catch {
    /* ignore */
  }
  return [...ids];
}

export async function ensureJoinSummonPresence(options = {}) {
  if (started && !options.force) return;
  started = true;

  let user;
  try {
    user = options.user || (await me());
  } catch {
    return;
  }
  if (!user) return;

  const onJoinDefault = (payload) => {
    const id = payload?.assemblyId || payload?.AssemblyId;
    if (!id) return;
    location.href = `/lobby.html?assemblyId=${encodeURIComponent(id)}`;
  };

  const ids = await listLiveAssemblyIds();
  for (const assemblyId of ids) {
    if (hubs.has(assemblyId)) continue;
    try {
      const hub = createAssemblyConnection({
        joinSummonRequested: attachJoinSummonListener({
          getUserId: () => selfUserId(user),
          onJoin: options.onJoin || onJoinDefault,
          onDismiss: options.onDismiss
        })
      });
      await hub.start(assemblyId, { markPresence: false });
      hubs.set(assemblyId, hub);
    } catch (err) {
      console.warn("join-summon presence failed", assemblyId, err);
    }
  }
}

export async function stopJoinSummonPresence() {
  for (const [id, hub] of hubs.entries()) {
    try {
      await hub.stop?.(id);
    } catch {
      /* ignore */
    }
  }
  hubs.clear();
  started = false;
}
