namespace Asambleas.Application.Assembly;



using Asambleas.Application.Abstractions;

using Asambleas.Application.Common;

using Asambleas.Application.Meeting;

using Asambleas.Application.Security;

using Asambleas.Contracts.Assemblies;

using Asambleas.Domain.Common;

using Microsoft.EntityFrameworkCore;

using AssemblyEntity = Asambleas.Domain.Entities.Assembly;



public sealed class AssemblyReadinessService

{

    private readonly IAsambleasDbContext _db;

    private readonly ICurrentTenant _currentTenant;

    private readonly IMeetingProvider _meetingProvider;



    public AssemblyReadinessService(

        IAsambleasDbContext db,

        ICurrentTenant currentTenant,

        IMeetingProvider meetingProvider)

    {

        _db = db;

        _currentTenant = currentTenant;

        _meetingProvider = meetingProvider;

    }



    public Task<AssemblyReadinessDto> BuildAsync(

        AssemblyEntity assembly,

        CancellationToken cancellationToken = default) =>

        BuildAsync(assembly, metrics: null, cancellationToken);



    internal async Task<AssemblyReadinessDto> BuildAsync(

        AssemblyEntity assembly,

        AssemblyMetricsLoader.Metrics? metrics,

        CancellationToken cancellationToken = default)

    {

        TenantGuard.EnsureAuthenticated(_currentTenant);

        TenantGuard.EnsureTenantMatch(_currentTenant, assembly.TenantId);



        var assemblyId = assembly.Id;

        var phId = assembly.PropertyHorizontalId;

        var roles = _currentTenant.Roles;

        var perms = _currentTenant.Permissions.Count > 0

            ? (IReadOnlySet<string>)new HashSet<string>(_currentTenant.Permissions, StringComparer.Ordinal)

            : RolePermissionMap.GetPermissions(roles);



        bool Can(string permission) => perms.Contains(permission, StringComparer.Ordinal);



        metrics ??= await AssemblyMetricsLoader.LoadAsync(_db, assemblyId, phId, cancellationToken);



        var meetingConfigured = await _meetingProvider.IsConfiguredAsync(cancellationToken);

        var modalityVirtual = string.Equals(

            assembly.Modality,

            AssemblyEntity.ModalityVirtual,

            StringComparison.OrdinalIgnoreCase);



        var participantsReady = metrics.ParticipantCount > 0;

        var coefficientsReady = metrics.CoefficientsReady;

        var coefficientTotal = metrics.CoefficientTotal;

        var agendaReady = metrics.AgendaCount > 0;

        var meetingReady = meetingConfigured || !modalityVirtual;

        var votingRulesReady = assembly.RequiredQuorumPercent > 0m;

        var votingPrepared = metrics.MotionCount + metrics.SurveyCount > 0;

        var documentsReady = metrics.ConvocationCount > 0;

        var commsReady = metrics.EmailChannelReady;



        var checks = new List<ReadinessCheckDto>();



        checks.Add(BuildCheck(

            ReadinessCheckKeys.Participants,

            participantsReady,

            ReadinessSeverities.Blocking,

            "Participantes",

            participantsReady

                ? "Participantes registrados para esta asamblea."

                : "No hay participantes elegibles registrados.",

            participantsReady ? $"{metrics.ParticipantCount} participante(s)" : null,

            "Revisar participantes",

            ReadinessDestinationKeys.AssemblyParticipants,

            Can(Permissions.AttendanceManage) || Can(Permissions.AssemblyManage)));



        var coeffDetail = metrics.UnitCount == 0

            ? null

            : $"{coefficientTotal:0.##}% configurado";

        checks.Add(BuildCheck(

            ReadinessCheckKeys.Coefficients,

            coefficientsReady,

            ReadinessSeverities.Blocking,

            "Coeficientes",

            coefficientsReady

                ? "Todas las unidades tienen coeficiente válido."

                : metrics.UnitCount == 0

                    ? "No hay unidades configuradas en la propiedad."

                    : "Una o más unidades tienen coeficiente inválido o faltante.",

            coeffDetail,

            "Corregir coeficientes",

            ReadinessDestinationKeys.PhUnits,

            Can(Permissions.UnitManage) || Can(Permissions.PhManage)));



        checks.Add(BuildCheck(

            ReadinessCheckKeys.Agenda,

            agendaReady,

            ReadinessSeverities.Blocking,

            "Agenda",

            agendaReady

                ? "La agenda tiene puntos configurados."

                : "Agrega al menos un punto de agenda.",

            agendaReady ? $"{metrics.AgendaCount} punto(s)" : null,

            "Completar agenda",

            ReadinessDestinationKeys.AssemblyAgenda,

            Can(Permissions.AgendaManage)));



        checks.Add(BuildCheck(

            ReadinessCheckKeys.Documents,

            documentsReady,

            ReadinessSeverities.Warning,

            "Documentos",

            documentsReady

                ? "Hay convocatoria o documentos asociados."

                : "Todavía no hay convocatoria ni documentos asociados.",

            documentsReady ? $"{metrics.ConvocationCount} convocatoria(s)" : null,

            "Agregar documentos",

            ReadinessDestinationKeys.AssemblyConvocation,

            Can(Permissions.ConvocationsCreate) || Can(Permissions.ConvocationsSend)));



        var votingReady = votingRulesReady && votingPrepared;

        checks.Add(BuildCheck(

            ReadinessCheckKeys.Voting,

            votingReady,

            votingRulesReady ? ReadinessSeverities.Warning : ReadinessSeverities.Blocking,

            "Votaciones",

            !votingRulesReady

                ? "El quórum requerido debe ser mayor que cero."

                : votingPrepared

                    ? "Votaciones y reglas preparadas."

                    : "Prepara al menos una votación o encuesta.",

            votingPrepared

                ? $"{metrics.MotionCount + metrics.SurveyCount} preparada(s)"

                : votingRulesReady

                    ? "Sin votaciones preparadas"

                    : $"Quórum {assembly.RequiredQuorumPercent:0.##}%",

            votingPrepared ? "Revisar votaciones" : "Preparar votaciones",

            ReadinessDestinationKeys.AssemblyVoting,

            Can(Permissions.MotionCreate) || Can(Permissions.VoteOpen)));



        checks.Add(BuildCheck(

            ReadinessCheckKeys.Meeting,

            meetingReady,

            ReadinessSeverities.Warning,

            "Videoconferencia",

            meetingReady

                ? "Sala de reunión lista."

                : modalityVirtual

                    ? "La videoconferencia no está configurada para modalidad virtual."

                    : "Opcional para modalidad presencial.",

            meetingConfigured ? "LiveKit configurado" : modalityVirtual ? "Pendiente" : "No requerida",

            "Configurar sala",

            ReadinessDestinationKeys.AssemblyLobby,

            Can(Permissions.MeetingJoin) || Can(Permissions.AssemblyManage)));



        if (Can(Permissions.CommunicationsView))

        {

            checks.Add(BuildCheck(

                ReadinessCheckKeys.Communications,

                commsReady,

                ReadinessSeverities.Warning,

                "Comunicaciones",

                commsReady

                    ? "Canal de correo configurado para la propiedad."

                    : "Correo no configurado para esta propiedad.",

                commsReady ? "Correo activo" : "Configure SMTP o canal de correo",

                "Configurar comunicaciones",

                ReadinessDestinationKeys.PhComms,

                Can(Permissions.CommunicationsConfigure)));

        }



        var blockingOpen = checks.Count(c =>

            c.Severity == ReadinessSeverities.Blocking && c.Status != ReadinessCheckStatuses.Ready);

        var warningOpen = checks.Count(c =>

            c.Severity == ReadinessSeverities.Warning && c.Status != ReadinessCheckStatuses.Ready);

        var completed = checks.Count(c => c.Status == ReadinessCheckStatuses.Ready);



        var blockers = checks

            .Where(c => c.Severity == ReadinessSeverities.Blocking && c.Status != ReadinessCheckStatuses.Ready)

            .Select(c => $"{c.Title}: {c.Description}")

            .ToList();



        var readyToStart = blockingOpen == 0;

        var overall = blockingOpen > 0

            ? ReadinessOverallStatuses.Blocking

            : warningOpen > 0

                ? ReadinessOverallStatuses.Warning

                : ReadinessOverallStatuses.Ready;



        var next = PickNextAction(checks);



        return new AssemblyReadinessDto(

            participantsReady,

            coefficientsReady,

            agendaReady,

            meetingReady,

            votingRulesReady,

            readyToStart,

            blockers,

            overall,

            completed,

            checks.Count,

            blockingOpen,

            next,

            checks);

    }



    private static ReadinessCheckDto BuildCheck(

        string key,

        bool ready,

        string severity,

        string title,

        string description,

        string? detail,

        string actionLabel,

        string destinationKey,

        bool canAct)

    {

        var status = ready

            ? ReadinessCheckStatuses.Ready

            : severity == ReadinessSeverities.Warning

                ? ReadinessCheckStatuses.Optional

                : ReadinessCheckStatuses.Attention;



        return new ReadinessCheckDto(

            key,

            status,

            severity,

            title,

            description,

            detail,

            ready ? null : actionLabel,

            ready ? null : destinationKey,

            !ready && canAct);

    }



    private static ReadinessActionDto? PickNextAction(IReadOnlyList<ReadinessCheckDto> checks)

    {

        static ReadinessActionDto? FromCheck(ReadinessCheckDto c) =>

            c.CanAct && c.DestinationKey is not null && c.ActionLabel is not null

                ? new ReadinessActionDto(

                    c.Key,

                    c.Title,

                    c.Description,

                    c.ActionLabel,

                    c.DestinationKey,

                    true)

                : null;



        var blocking = checks

            .Where(c => c.Severity == ReadinessSeverities.Blocking && c.Status != ReadinessCheckStatuses.Ready)

            .Select(FromCheck)

            .FirstOrDefault(a => a is not null);

        if (blocking is not null)

        {

            return blocking;

        }



        return checks

            .Where(c => c.Severity == ReadinessSeverities.Warning && c.Status != ReadinessCheckStatuses.Ready)

            .Select(FromCheck)

            .FirstOrDefault(a => a is not null);

    }

}


