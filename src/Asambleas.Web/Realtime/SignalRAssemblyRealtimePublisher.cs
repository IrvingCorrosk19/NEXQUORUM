namespace Asambleas.Web.Realtime;

using Asambleas.Application.Abstractions;
using Asambleas.Contracts.Agenda;
using Asambleas.Contracts.Assemblies;
using Asambleas.Contracts.Meetings;
using Asambleas.Contracts.Motions;
using Asambleas.Contracts.Quorum;
using Asambleas.Contracts.Realtime;
using Asambleas.Contracts.Recordings;
using Asambleas.Contracts.Speakers;
using Asambleas.Contracts.Voting;
using Asambleas.Web.Hubs;
using Microsoft.AspNetCore.SignalR;

public sealed class SignalRAssemblyRealtimePublisher : IAssemblyRealtimePublisher
{
    private readonly IHubContext<AssemblyHub> _hub;

    public SignalRAssemblyRealtimePublisher(IHubContext<AssemblyHub> hub)
    {
        _hub = hub;
    }

    public Task PublishAssemblyStatusAsync(Guid assemblyId, AssemblySummaryDto assembly, CancellationToken cancellationToken = default) =>
        SendAsync(assemblyId, RealtimeEventNames.AssemblyStatusChanged, assembly, cancellationToken);

    public Task PublishAssemblyScheduleChangedAsync(Guid assemblyId, AssemblySummaryDto assembly, CancellationToken cancellationToken = default) =>
        SendAsync(assemblyId, RealtimeEventNames.AssemblyScheduleChanged, assembly, cancellationToken);

    public Task PublishAttendanceAsync(Guid assemblyId, AssemblyParticipantDto participant, CancellationToken cancellationToken = default) =>
        SendAsync(assemblyId, RealtimeEventNames.ParticipantUpdated, participant, cancellationToken);

    public Task PublishQuorumAsync(Guid assemblyId, QuorumStateDto quorum, CancellationToken cancellationToken = default) =>
        SendAsync(assemblyId, RealtimeEventNames.QuorumUpdated, quorum, cancellationToken);

    public Task PublishAgendaAsync(Guid assemblyId, AgendaListResponse agenda, CancellationToken cancellationToken = default) =>
        SendAsync(assemblyId, RealtimeEventNames.AgendaUpdated, agenda, cancellationToken);

    public Task PublishSpeakerQueueAsync(Guid assemblyId, SpeakerQueueDto queue, CancellationToken cancellationToken = default) =>
        SendAsync(assemblyId, RealtimeEventNames.SpeakerQueueUpdated, queue, cancellationToken);

    public Task PublishMotionAsync(Guid assemblyId, MotionDto motion, CancellationToken cancellationToken = default) =>
        SendAsync(assemblyId, RealtimeEventNames.MotionUpdated, motion, cancellationToken);

    public Task PublishVotingOpenedAsync(Guid assemblyId, VotingSessionDto session, CancellationToken cancellationToken = default) =>
        SendAsync(assemblyId, RealtimeEventNames.VotingOpened, session, cancellationToken);

    public Task PublishVoteTallyAsync(Guid assemblyId, VoteTallyDto tally, CancellationToken cancellationToken = default) =>
        SendAsync(assemblyId, RealtimeEventNames.VoteTallyUpdated, tally, cancellationToken);

    public Task PublishVotingClosedAsync(Guid assemblyId, CloseVotingSessionResponse result, CancellationToken cancellationToken = default) =>
        SendAsync(assemblyId, RealtimeEventNames.VotingClosed, result, cancellationToken);

    public Task PublishVotingCancelledAsync(Guid assemblyId, VotingSessionDto session, CancellationToken cancellationToken = default) =>
        SendAsync(assemblyId, RealtimeEventNames.VotingCancelled, session, cancellationToken);

    public Task PublishVotingVersionCreatedAsync(Guid assemblyId, MotionDto motion, CancellationToken cancellationToken = default) =>
        SendAsync(assemblyId, RealtimeEventNames.VotingVersionCreated, motion, cancellationToken);

    public Task PublishRecordingUpdatedAsync(Guid assemblyId, AssemblyRecordingDto recording, CancellationToken cancellationToken = default) =>
        SendAsync(assemblyId, RealtimeEventNames.RecordingUpdated, recording, cancellationToken);

    public Task PublishScreenShareUpdatedAsync(Guid assemblyId, ScreenShareStateDto state, CancellationToken cancellationToken = default) =>
        SendAsync(assemblyId, RealtimeEventNames.ScreenShareUpdated, state, cancellationToken);

    private Task SendAsync<T>(Guid assemblyId, string eventName, T payload, CancellationToken cancellationToken) =>
        _hub.Clients.Group(AssemblyHub.GroupName(assemblyId))
            .SendAsync(eventName, payload, cancellationToken);
}
