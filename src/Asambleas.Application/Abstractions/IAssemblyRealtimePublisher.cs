namespace Asambleas.Application.Abstractions;

using Asambleas.Contracts.Agenda;
using Asambleas.Contracts.Assemblies;
using Asambleas.Contracts.Motions;
using Asambleas.Contracts.Quorum;
using Asambleas.Contracts.Speakers;
using Asambleas.Contracts.Voting;

public interface IAssemblyRealtimePublisher
{
    Task PublishAssemblyStatusAsync(Guid assemblyId, AssemblySummaryDto assembly, CancellationToken cancellationToken = default);

    Task PublishAttendanceAsync(Guid assemblyId, AssemblyParticipantDto participant, CancellationToken cancellationToken = default);

    Task PublishQuorumAsync(Guid assemblyId, QuorumStateDto quorum, CancellationToken cancellationToken = default);

    Task PublishAgendaAsync(Guid assemblyId, AgendaListResponse agenda, CancellationToken cancellationToken = default);

    Task PublishSpeakerQueueAsync(Guid assemblyId, SpeakerQueueDto queue, CancellationToken cancellationToken = default);

    Task PublishMotionAsync(Guid assemblyId, MotionDto motion, CancellationToken cancellationToken = default);

    Task PublishVotingOpenedAsync(Guid assemblyId, VotingSessionDto session, CancellationToken cancellationToken = default);

    Task PublishVoteTallyAsync(Guid assemblyId, VoteTallyDto tally, CancellationToken cancellationToken = default);

    Task PublishVotingClosedAsync(Guid assemblyId, CloseVotingSessionResponse result, CancellationToken cancellationToken = default);
}
