const EVENT_NAMES = [
  "assemblyStatusChanged",
  "participantUpdated",
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
  "assemblyScheduleChanged"
];

export function createAssemblyConnection(handlers = {}) {
  if (!window.signalR) {
    throw new Error("SignalR client is not loaded.");
  }

  let joinedAssemblyId = null;

  const connection = new signalR.HubConnectionBuilder()
    .withUrl("/hubs/assembly")
    .withAutomaticReconnect()
    .build();

  for (const name of EVENT_NAMES) {
    connection.on(name, (payload) => {
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

  return {
    connection,
    async start(assemblyId) {
      joinedAssemblyId = assemblyId;
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
