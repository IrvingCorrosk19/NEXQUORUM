namespace Asambleas.Application;

using Asambleas.Application.Abstractions;
using Asambleas.Application.Agenda;
using Asambleas.Application.Assembly;
using Asambleas.Application.Attendance;
using Asambleas.Application.Audit;
using Asambleas.Application.Calendar;
using Asambleas.Application.Communications;
using Asambleas.Application.Evidence;
using Asambleas.Application.Meeting;
using Asambleas.Application.Motion;
using Asambleas.Application.PhOnboarding;
using Asambleas.Application.Quorum;
using Asambleas.Application.Recording;
using Asambleas.Application.Representation;
using Asambleas.Application.Speaker;
using Asambleas.Application.Surveys;
using Asambleas.Application.Voting;
using Asambleas.Domain.Voting;
using Microsoft.Extensions.DependencyInjection;

public static class DependencyInjection
{
    public static IServiceCollection AddAsambleasApplication(this IServiceCollection services)
    {
        ArgumentNullException.ThrowIfNull(services);

        services.AddScoped<AuditService>();
        services.AddScoped<IAuditService>(sp => sp.GetRequiredService<AuditService>());
        services.AddScoped<IDecisionRule, SimpleMajorityDecisionRule>();
        services.AddScoped<IDecisionRule, QualifiedMajorityDecisionRule>();
        services.AddScoped<DecisionRuleResolver>();

        services.AddScoped<AssemblyService>();
        services.AddScoped<AssemblyAccessService>();
        services.AddScoped<AssemblyReadinessService>();
        services.AddScoped<AssemblyRoomService>();
        services.AddScoped<AssemblyRepresentationService>();
        services.AddScoped<IAssemblyRepresentationService>(sp => sp.GetRequiredService<AssemblyRepresentationService>());
        services.AddScoped<AttendanceService>();
        services.AddScoped<QuorumService>();
        services.AddScoped<AgendaService>();
        services.AddScoped<SpeakerService>();
        services.AddScoped<MotionService>();
        services.AddScoped<VotingService>();
        services.AddScoped<SurveyFormService>();
        services.AddSingleton<IScreenShareCoordinator, InMemoryScreenShareCoordinator>();
        services.AddScoped<MeetingService>();
        services.AddScoped<AssemblyEvidenceService>();
        services.AddScoped<EvidencePackageExportService>();
        services.AddScoped<RecordingService>();
        services.AddScoped<CalendarSchedulingService>();
        services.AddScoped<CommunicationConfigurationService>();
        services.AddScoped<DeliveryDispatchService>();
        services.AddScoped<AssemblyAccessLinkService>();
        services.AddScoped<ConvocationService>();
        services.AddScoped<PhOnboardingService>();
        services.AddScoped<PhImportService>();
        services.AddScoped<OwnerInvitationService>();

        return services;
    }
}
