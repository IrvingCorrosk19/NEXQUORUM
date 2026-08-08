namespace Asambleas.Application;

using Asambleas.Application.Abstractions;
using Asambleas.Application.Agenda;
using Asambleas.Application.Assembly;
using Asambleas.Application.Attendance;
using Asambleas.Application.Audit;
using Asambleas.Application.Meeting;
using Asambleas.Application.Motion;
using Asambleas.Application.Quorum;
using Asambleas.Application.Speaker;
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

        services.AddScoped<AssemblyService>();
        services.AddScoped<AssemblyAccessService>();
        services.AddScoped<AssemblyRoomService>();
        services.AddScoped<AttendanceService>();
        services.AddScoped<QuorumService>();
        services.AddScoped<AgendaService>();
        services.AddScoped<SpeakerService>();
        services.AddScoped<MotionService>();
        services.AddScoped<VotingService>();
        services.AddScoped<MeetingService>();

        return services;
    }
}
