namespace Asambleas.Web.Controllers;

using Asambleas.Application.Communications;
using Asambleas.Application.Security;
using Asambleas.Contracts.Communications;
using Asambleas.Domain.Common;
using Asambleas.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

[ApiController]
[Authorize]
[Route("api/communications")]
public sealed class CommunicationsController : ControllerBase
{
    private readonly CommunicationConfigurationService _config;
    private readonly ConvocationService _convocations;

    public CommunicationsController(
        CommunicationConfigurationService config,
        ConvocationService convocations)
    {
        _config = config;
        _convocations = convocations;
    }

    [HttpGet("ph/{propertyHorizontalId:guid}/profile")]
    [Authorize(Policy = Permissions.CommunicationsView)]
    public Task<CommunicationProfileDto> GetProfile(Guid propertyHorizontalId, CancellationToken cancellationToken) =>
        _config.GetOrCreateProfileAsync(propertyHorizontalId, cancellationToken);

    [HttpPut("ph/{propertyHorizontalId:guid}/profile")]
    [Authorize(Policy = Permissions.CommunicationsConfigure)]
    public Task<CommunicationProfileDto> UpdateProfile(
        Guid propertyHorizontalId,
        [FromBody] UpdateCommunicationProfileRequest request,
        CancellationToken cancellationToken) =>
        _config.UpdateProfileAsync(propertyHorizontalId, request, cancellationToken);

    [HttpGet("ph/{propertyHorizontalId:guid}/channels")]
    [Authorize(Policy = Permissions.CommunicationsView)]
    public Task<IReadOnlyList<ChannelConfigurationDto>> ListChannels(
        Guid propertyHorizontalId,
        CancellationToken cancellationToken) =>
        _config.ListChannelsAsync(propertyHorizontalId, cancellationToken);

    [HttpPut("ph/{propertyHorizontalId:guid}/channels/{channel}")]
    [Authorize(Policy = Permissions.CommunicationsConfigure)]
    public async Task<ChannelConfigurationDto> UpsertChannel(
        Guid propertyHorizontalId,
        string channel,
        [FromBody] UpsertChannelConfigurationRequest request,
        CancellationToken cancellationToken)
    {
        var parsed = ParseChannel(channel);
        return await _config.UpsertChannelAsync(propertyHorizontalId, parsed, request, cancellationToken);
    }

    [HttpPost("ph/{propertyHorizontalId:guid}/channels/{channel}/test")]
    [Authorize(Policy = Permissions.CommunicationsTest)]
    public async Task<ChannelTestResultDto> TestChannel(
        Guid propertyHorizontalId,
        string channel,
        [FromBody] ChannelTestRequest request,
        CancellationToken cancellationToken)
    {
        var parsed = ParseChannel(channel);
        return await _config.TestChannelAsync(propertyHorizontalId, parsed, request, cancellationToken);
    }

    [HttpGet("ph/{propertyHorizontalId:guid}/convocation-email-preview")]
    [Authorize(Policy = Permissions.CommunicationsView)]
    public Task<ConvocationEmailPreviewDto> ConvocationEmailPreview(
        Guid propertyHorizontalId,
        CancellationToken cancellationToken) =>
        _config.GetConvocationEmailPreviewAsync(propertyHorizontalId, cancellationToken);

    [HttpGet("ph/{propertyHorizontalId:guid}/templates")]
    [Authorize(Policy = Permissions.TemplatesView)]
    public Task<IReadOnlyList<MessageTemplateDto>> ListTemplates(
        Guid propertyHorizontalId,
        CancellationToken cancellationToken) =>
        _config.ListTemplatesAsync(propertyHorizontalId, cancellationToken);

    [HttpPut("ph/{propertyHorizontalId:guid}/templates")]
    [Authorize(Policy = Permissions.TemplatesManage)]
    public Task<MessageTemplateDto> UpsertTemplate(
        Guid propertyHorizontalId,
        [FromBody] UpsertMessageTemplateRequest request,
        CancellationToken cancellationToken) =>
        _config.UpsertTemplateAsync(propertyHorizontalId, request, cancellationToken);

    [HttpGet("portal/me")]
    [Authorize(Policy = Permissions.PortalSelf)]
    public Task<IReadOnlyList<PortalNotificationDto>> MyPortal(CancellationToken cancellationToken) =>
        _convocations.ListMyPortalNotificationsAsync(cancellationToken);

    [HttpPost("portal/{notificationId:guid}/read")]
    [Authorize(Policy = Permissions.PortalSelf)]
    public Task<PortalNotificationDto> MarkPortalRead(Guid notificationId, CancellationToken cancellationToken) =>
        _convocations.MarkPortalReadAsync(notificationId, cancellationToken);

    private static CommunicationChannel ParseChannel(string channel)
    {
        if (!Enum.TryParse<CommunicationChannel>(channel, ignoreCase: true, out var parsed))
        {
            throw new DomainException("INVALID_CHANNEL", $"Unknown channel '{channel}'.");
        }

        return parsed;
    }
}

[ApiController]
[Authorize]
[Route("api/assemblies/{assemblyId:guid}/convocations")]
public sealed class AssemblyConvocationsController : ControllerBase
{
    private readonly ConvocationService _convocations;

    public AssemblyConvocationsController(ConvocationService convocations) => _convocations = convocations;

    [HttpGet]
    [Authorize(Policy = Permissions.CommunicationsView)]
    public Task<IReadOnlyList<ConvocationSummaryDto>> List(Guid assemblyId, CancellationToken cancellationToken) =>
        _convocations.ListForAssemblyAsync(assemblyId, cancellationToken);

    [HttpPost]
    [Authorize(Policy = Permissions.ConvocationsCreate)]
    public Task<ConvocationDetailDto> Create(
        Guid assemblyId,
        [FromBody] CreateConvocationRequest request,
        CancellationToken cancellationToken)
    {
        if (request.AssemblyId == Guid.Empty)
        {
            request = request with { AssemblyId = assemblyId };
        }

        return _convocations.CreateAsync(request, cancellationToken);
    }
}

[ApiController]
[Authorize]
[Route("api/convocations")]
public sealed class ConvocationsController : ControllerBase
{
    private readonly ConvocationService _convocations;

    public ConvocationsController(ConvocationService convocations) => _convocations = convocations;

    [HttpGet("{convocationId:guid}")]
    [Authorize(Policy = Permissions.CommunicationsView)]
    public Task<ConvocationDetailDto> Get(Guid convocationId, CancellationToken cancellationToken) =>
        _convocations.GetAsync(convocationId, cancellationToken);

    [HttpPost("{convocationId:guid}/validate")]
    [Authorize(Policy = Permissions.ConvocationsCreate)]
    public Task<ConvocationDetailDto> Validate(Guid convocationId, CancellationToken cancellationToken) =>
        _convocations.ValidateAsync(convocationId, cancellationToken);

    [HttpPost("{convocationId:guid}/send")]
    [Authorize(Policy = Permissions.ConvocationsSend)]
    public Task<CommunicationBatchDto> Send(
        Guid convocationId,
        [FromBody] SendConvocationRequest request,
        CancellationToken cancellationToken) =>
        _convocations.SendAsync(convocationId, request, cancellationToken);

    [HttpPost("{convocationId:guid}/resend")]
    [Authorize(Policy = Permissions.ConvocationsResend)]
    public Task<CommunicationBatchDto> Resend(
        Guid convocationId,
        [FromBody] ResendConvocationRequest request,
        CancellationToken cancellationToken) =>
        _convocations.ResendAsync(convocationId, request, cancellationToken);

    [HttpGet("{convocationId:guid}/recipient-deliveries")]
    [Authorize(Policy = Permissions.ConvocationsViewEvidence)]
    public Task<IReadOnlyList<ConvocationRecipientDeliveryDto>> RecipientDeliveries(
        Guid convocationId,
        CancellationToken cancellationToken) =>
        _convocations.ListRecipientDeliveryStatusAsync(convocationId, cancellationToken);

    [HttpGet("{convocationId:guid}/deliveries")]
    [Authorize(Policy = Permissions.ConvocationsViewEvidence)]
    public Task<IReadOnlyList<DeliveryDto>> Deliveries(Guid convocationId, CancellationToken cancellationToken) =>
        _convocations.ListDeliveriesAsync(convocationId, cancellationToken);
}
