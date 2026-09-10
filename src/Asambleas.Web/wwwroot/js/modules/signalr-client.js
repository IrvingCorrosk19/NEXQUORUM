const EVENT_NAMES = [
  "assemblyStatusChanged",
  "participantUpdated",
  "accreditationChanged",
  "quorumUpdated",
  "agendaUpdated",
  "speakerQueueUpdated",
  "motionUpdated",
  "votingOpened",
  "voteTallyUpdated",
  "votingClosed",
  "votingCancelled",
  "votingVersionCreated",
  "recordingUpdated",
  "assemblyScheduleChanged",
  "screenShareUpdated"
];

/** Events whose payload `id` is the assembly id (not a child entity id). */
const ASSEMBLY_ID_AS_ID = new Set([
  "assemblyStatusChanged",
  "assemblyScheduleChanged"
]);

function payloadAssemblyId(name, payload) {
  if (!payload || typeof payload !== "object") return null;
  const explicit = payload.assemblyId || payload.AssemblyId || null;
  if (explicit) return explicit;
  if (ASSEMBLY_ID_AS_ID.has(name)) {
    return payload.id || payload.Id || null;
  }
  return null;
}

export function createAssemblyConnection(handlers = {}) {
  if (!window.signalR) {
    throw new Error("SignalR client is not loaded.");
  }

  let joinedAssemblyId = null;
  let listenersBound = false;

  const connection = new signalR.HubConnectionBuilder()
    .withUrl("/hubs/assembly")
    .withAutomaticReconnect([0, 2000, 5000, 10000, 20000, 30000])
    .build();

  function bindListenersOnce() {
    if (listenersBound) return;
    listenersBound = true;

    for (const name of EVENT_NAMES) {
      connection.on(name, (payload) => {
        // Ignore events if we already left / switched away from this assembly.
        if (joinedAssemblyId == null) return;
        const payloadAsm = payloadAssemblyId(name, payload);
        if (payloadAsm && String(payloadAsm) !== String(joinedAssemblyId)) return;
        handlers[name]?.(payload);
        handlers.onAny?.(name, payload);
      });
    }

    connection.onreconnecting(() => handlers.onConnectionState?.("reconnecting"));

    connection.onreconnected(async () => {
      handlers.onConnectionState?.("connected");
      if (joinedAssemblyId) {
        try {
          await connection.invoke("JoinAssembly", joinedAssemblyId);
          await handlers.onReconnected?.(joinedAssemblyId);
        } catch (error) {
          handlers.onReconnectError?.(error);
        }
      }
    });

    connection.onclose(() => handlers.onConnectionState?.("disconnected"));
  }

  bindListenersOnce();

  return {
    connection,
    async start(assemblyId) {
      joinedAssemblyId = assemblyId;
      bindListenersOnce();
      if (connection.state === signalR.HubConnectionState.Disconnected) {
        await connection.start();
      }
      handlers.onConnectionState?.("connected");
      await connection.invoke("JoinAssembly", assemblyId);
    },
    async stop(assemblyId) {
      try {
        if (assemblyId && connection.state === signalR.HubConnectionState.Connected) {
          await connection.invoke("LeaveAssembly", assemblyId);
        }
      } finally {
        joinedAssemblyId = null;
        await connection.stop();
        handlers.onConnectionState?.("disconnected");
      }
    }
  };
}
