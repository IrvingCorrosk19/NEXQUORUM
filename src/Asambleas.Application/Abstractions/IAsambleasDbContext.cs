namespace Asambleas.Application.Abstractions;

using Asambleas.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using AssemblyEntity = Asambleas.Domain.Entities.Assembly;

public interface IAsambleasDbContext
{
    DbSet<Tenant> Tenants { get; }

    DbSet<Organization> Organizations { get; }

    DbSet<PropertyHorizontal> PropertyHorizontals { get; }

    DbSet<Unit> Units { get; }

    DbSet<Owner> Owners { get; }

    DbSet<Ownership> Ownerships { get; }

    DbSet<OwnerInvitation> OwnerInvitations { get; }

    DbSet<OwnerPasswordReset> OwnerPasswordResets { get; }

    DbSet<UserPropertyMembership> UserPropertyMemberships { get; }

    DbSet<Power> Powers { get; }

    DbSet<AssemblyRepresentation> AssemblyRepresentations { get; }

    DbSet<AssemblyEntity> Assemblies { get; }

    DbSet<AssemblyParticipant> AssemblyParticipants { get; }

    DbSet<AttendanceRecord> AttendanceRecords { get; }

    DbSet<AgendaItem> AgendaItems { get; }

    DbSet<Motion> Motions { get; }

    DbSet<VotingSession> VotingSessions { get; }

    DbSet<VotingEligibilitySnapshot> VotingEligibilitySnapshots { get; }

    DbSet<Vote> Votes { get; }

    DbSet<QuorumSnapshot> QuorumSnapshots { get; }

    DbSet<SpeakerRequest> SpeakerRequests { get; }

    DbSet<AuditEvent> AuditEvents { get; }

    DbSet<CommunicationProfile> CommunicationProfiles { get; }

    DbSet<ChannelConfiguration> ChannelConfigurations { get; }

    DbSet<MessageTemplate> MessageTemplates { get; }

    DbSet<Convocation> Convocations { get; }

    DbSet<ConvocationRecipient> ConvocationRecipients { get; }

    DbSet<CommunicationBatch> CommunicationBatches { get; }

    DbSet<CommunicationDelivery> CommunicationDeliveries { get; }

    DbSet<CommunicationDeliveryEvent> CommunicationDeliveryEvents { get; }

    DbSet<AssemblyAccessLink> AssemblyAccessLinks { get; }

    DbSet<PortalNotification> PortalNotifications { get; }

    DbSet<ReminderRule> ReminderRules { get; }

    DbSet<AssemblyScheduleChange> AssemblyScheduleChanges { get; }

    DbSet<AssemblyReminderOccurrence> AssemblyReminderOccurrences { get; }

    DbSet<AssemblyRecording> AssemblyRecordings { get; }

    DbSet<PropertyRecordingPolicy> PropertyRecordingPolicies { get; }

    DbSet<RecordingNoticeAcceptance> RecordingNoticeAcceptances { get; }

    DbSet<SurveyForm> SurveyForms { get; }

    DbSet<SurveyQuestion> SurveyQuestions { get; }

    DbSet<SurveyResponse> SurveyResponses { get; }

    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
}
