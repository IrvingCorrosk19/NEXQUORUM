namespace Asambleas.Application.Communications;

using System.Text.Json;
using Asambleas.Application.Abstractions;
using Asambleas.Application.Abstractions.Communications;
using Asambleas.Application.Common;
using Asambleas.Contracts.Communications;
using Asambleas.Domain.Common;
using Asambleas.Domain.Entities;
using Asambleas.Domain.Enums;
using Microsoft.EntityFrameworkCore;

public sealed class CommunicationConfigurationService
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private readonly IAsambleasDbContext _db;
    private readonly ICurrentTenant _currentTenant;
    private readonly ISecretProtector _secrets;
    private readonly ICommunicationEnvironment _environment;
    private readonly IAuditService _audit;
    private readonly Func<SmtpClientFactoryArgs, IEmailProvider> _smtpFactory;
    private readonly IEmailProvider _mockEmail;
    private readonly IWhatsAppProvider _mockWhatsApp;
    private readonly ISmsProvider _mockSms;

    public CommunicationConfigurationService(
        IAsambleasDbContext db,
        ICurrentTenant currentTenant,
        ISecretProtector secrets,
        ICommunicationEnvironment environment,
        IAuditService audit,
        Func<SmtpClientFactoryArgs, IEmailProvider> smtpFactory,
        IEmailProvider mockEmail,
        IWhatsAppProvider mockWhatsApp,
        ISmsProvider mockSms)
    {
        _db = db;
        _currentTenant = currentTenant;
        _secrets = secrets;
        _environment = environment;
        _audit = audit;
        _smtpFactory = smtpFactory;
        _mockEmail = mockEmail;
        _mockWhatsApp = mockWhatsApp;
        _mockSms = mockSms;
    }

    public async Task<CommunicationProfileDto> GetOrCreateProfileAsync(
        Guid propertyHorizontalId,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        await EnsurePhAccessAsync(propertyHorizontalId, cancellationToken);

        var profile = await _db.CommunicationProfiles
            .FirstOrDefaultAsync(p => p.PropertyHorizontalId == propertyHorizontalId, cancellationToken);

        if (profile is null)
        {
            profile = new CommunicationProfile
            {
                TenantId = _currentTenant.TenantId,
                PropertyHorizontalId = propertyHorizontalId,
                SandboxMode = false
            };
            _db.CommunicationProfiles.Add(profile);
            await EnsureDefaultChannelsAsync(propertyHorizontalId, cancellationToken);
            await EnsureDefaultConvocationTemplateAsync(propertyHorizontalId, cancellationToken);
            await _db.SaveChangesAsync(cancellationToken);
        }

        return ToProfileDto(profile);
    }

    public async Task<CommunicationProfileDto> UpdateProfileAsync(
        Guid propertyHorizontalId,
        UpdateCommunicationProfileRequest request,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        await EnsurePhAccessAsync(propertyHorizontalId, cancellationToken);

        var profile = await GetOrCreateEntityAsync(propertyHorizontalId, cancellationToken);
        profile.SandboxMode = false;
        profile.TestRecipientOverride = NormalizeOptionalEmail(
            request.TestRecipientOverride,
            "TEST_RECIPIENT_INVALID",
            "El destinatario de prueba no es un correo válido.");
        profile.DefaultTimezoneId = NormalizeTimezoneId(request.DefaultTimezoneId);
        profile.DefaultFromDisplayName = string.IsNullOrWhiteSpace(request.DefaultFromDisplayName)
            ? null
            : request.DefaultFromDisplayName.Trim();
        profile.DefaultReplyTo = NormalizeOptionalEmail(
            request.DefaultReplyTo,
            "REPLY_TO_INVALID",
            "Reply-To no es un correo válido.");

        // TestRecipientOverride is the default destination for channel tests and the sandbox
        // redirect target. It must NOT redirect live deliveries when SandboxMode=false
        // (DeliveryDispatchService only redirects when forceMock is true).
        // Blocking it in Production made the Communications UI unable to save a test recipient.

        await _db.SaveChangesAsync(cancellationToken);
        await _audit.WriteAsync(
            "communications.profile.updated",
            correlationId: profile.Id,
            metadata: new { propertyHorizontalId, profile.SandboxMode },
            cancellationToken: cancellationToken);

        return ToProfileDto(profile);
    }

    public async Task<IReadOnlyList<ChannelConfigurationDto>> ListChannelsAsync(
        Guid propertyHorizontalId,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        await EnsurePhAccessAsync(propertyHorizontalId, cancellationToken);
        await EnsureDefaultChannelsAsync(propertyHorizontalId, cancellationToken);
        await _db.SaveChangesAsync(cancellationToken);

        var rows = await _db.ChannelConfigurations
            .AsNoTracking()
            .Where(c => c.PropertyHorizontalId == propertyHorizontalId)
            .OrderBy(c => c.Channel)
            .ToListAsync(cancellationToken);

        return rows.Select(ToChannelDto).ToList();
    }

    public async Task<ChannelConfigurationDto> UpsertChannelAsync(
        Guid propertyHorizontalId,
        CommunicationChannel channel,
        UpsertChannelConfigurationRequest request,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        await EnsurePhAccessAsync(propertyHorizontalId, cancellationToken);

        if (!Enum.TryParse<CommunicationProviderType>(request.ProviderType, ignoreCase: true, out var provider))
        {
            throw new DomainException("INVALID_PROVIDER", $"Unknown provider '{request.ProviderType}'.");
        }

        ValidateProviderForChannel(channel, provider);
        ValidateSmtpSettings(channel, provider, request);

        var row = await _db.ChannelConfigurations
            .FirstOrDefaultAsync(
                c => c.PropertyHorizontalId == propertyHorizontalId && c.Channel == channel,
                cancellationToken);

        if (row is null)
        {
            row = new ChannelConfiguration
            {
                TenantId = _currentTenant.TenantId,
                PropertyHorizontalId = propertyHorizontalId,
                Channel = channel
            };
            _db.ChannelConfigurations.Add(row);
        }

        row.ProviderType = provider;
        row.IsEnabled = request.IsEnabled;
        row.SettingsJson = JsonSerializer.Serialize(SanitizeSettings(request.Settings), JsonOptions);

        if (!string.IsNullOrWhiteSpace(request.Secret))
        {
            row.SecretCiphertext = _secrets.Protect(request.Secret);
            row.HasSecret = true;
            await _audit.WriteAsync(
                "communications.secret.updated",
                correlationId: row.Id,
                metadata: new { channel = channel.ToString(), propertyHorizontalId },
                cancellationToken: cancellationToken);
        }

        await _db.SaveChangesAsync(cancellationToken);
        return ToChannelDto(row);
    }

    public async Task<ChannelTestResultDto> TestChannelAsync(
        Guid propertyHorizontalId,
        CommunicationChannel channel,
        ChannelTestRequest request,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        await EnsurePhAccessAsync(propertyHorizontalId, cancellationToken);

        var profile = await GetOrCreateEntityAsync(propertyHorizontalId, cancellationToken);
        var row = await _db.ChannelConfigurations
            .FirstOrDefaultAsync(
                c => c.PropertyHorizontalId == propertyHorizontalId && c.Channel == channel,
                cancellationToken)
            ?? throw new DomainException("CHANNEL_NOT_CONFIGURED", "Channel is not configured.");

        var destination = string.IsNullOrWhiteSpace(request.Destination)
            ? profile.TestRecipientOverride
            : request.Destination.Trim();

        if (string.IsNullOrWhiteSpace(destination))
        {
            throw new DomainException(
                "TEST_DESTINATION_REQUIRED",
                "Configura un destinatario de prueba en el perfil o indícalo al probar el canal.");
        }

        if (!IsValidEmail(destination))
        {
            throw new DomainException("INVALID_RECIPIENT", "El destinatario de prueba no es válido.");
        }

        if (channel == CommunicationChannel.Email)
        {
            if (row.ProviderType != CommunicationProviderType.Smtp)
            {
                throw new DomainException(
                    "SMTP_NOT_CONFIGURED",
                    "Guarda la configuración SMTP antes de probar.");
            }

            if (!row.HasSecret)
            {
                throw new DomainException(
                    "SMTP_SECRET_REQUIRED",
                    "Indica la contraseña de aplicación y guarda antes de probar.");
            }

            if (!row.IsEnabled)
            {
                throw new DomainException(
                    "SMTP_CHANNEL_DISABLED",
                    "Activa el canal de correo antes de probar.");
            }
        }

        ProviderSendResult result;
        // Email channel tests always use real SMTP — never mock/simulator.
        var forceMock = channel == CommunicationChannel.Email ? false : profile.SandboxMode;

        switch (channel)
        {
            case CommunicationChannel.Email:
                var emailProvider = await ResolveEmailProviderAsync(row, forceMock, cancellationToken);
                var phName = await _db.PropertyHorizontals.AsNoTracking()
                    .Where(p => p.Id == propertyHorizontalId)
                    .Select(p => p.Name)
                    .FirstOrDefaultAsync(cancellationToken) ?? "Su propiedad horizontal";
                var preview = BuildSampleConvocationEmail(phName);
                result = await emailProvider.SendAsync(
                    new EmailMessage(
                        destination,
                        null,
                        preview.Subject,
                        preview.Html,
                        preview.Text,
                        null,
                        profile.DefaultFromDisplayName,
                        profile.DefaultReplyTo,
                        null),
                    cancellationToken);
                break;
            case CommunicationChannel.WhatsApp:
                result = await _mockWhatsApp.SendAsync(
                    new WhatsAppMessage(destination, "ASAMBLEAS prueba WhatsApp", null, null),
                    cancellationToken);
                break;
            case CommunicationChannel.Sms:
                result = await _mockSms.SendAsync(
                    new SmsMessage(destination, "ASAMBLEAS prueba SMS"),
                    cancellationToken);
                break;
            case CommunicationChannel.Portal:
                result = new ProviderSendResult(true, DeliveryStatus.Delivered, null, "Portal does not require external test.", false);
                break;
            default:
                throw new DomainException("CHANNEL_NOT_TESTABLE", "This channel cannot be tested yet.");
        }

        row.LastTestedAtUtc = DateTimeOffset.UtcNow;
        row.LastTestSucceeded = result.Succeeded;
        row.LastTestDetail = channel == CommunicationChannel.Email
            ? result.Succeeded
                ? $"Correo enviado correctamente a {destination}."
                : (result.Detail ?? "No se pudo enviar el correo. Revisa host, puerto, usuario y contraseña.")
            : $"{result.Detail} | ResolvedProvider={(forceMock ? "Mock" : row.ProviderType.ToString())}";
        await _db.SaveChangesAsync(cancellationToken);

        await _audit.WriteAsync(
            "communications.channel.tested",
            correlationId: row.Id,
            metadata: new { channel = channel.ToString(), result.Succeeded, sandbox = false },
            cancellationToken: cancellationToken);

        return new ChannelTestResultDto(result.Succeeded, row.LastTestDetail ?? string.Empty, row.LastTestedAtUtc.Value);
    }

    public async Task<IReadOnlyList<MessageTemplateDto>> ListTemplatesAsync(
        Guid propertyHorizontalId,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        await EnsurePhAccessAsync(propertyHorizontalId, cancellationToken);

        await EnsureDefaultConvocationTemplateAsync(propertyHorizontalId, cancellationToken);
        await _db.SaveChangesAsync(cancellationToken);

        var rows = await _db.MessageTemplates
            .AsNoTracking()
            .Where(t => t.PropertyHorizontalId == propertyHorizontalId)
            .OrderBy(t => t.Code)
            .ToListAsync(cancellationToken);

        return rows.Select(t => new MessageTemplateDto(
            t.Id, t.Code, t.Name, t.ChannelScope.ToString(), t.Subject, t.BodyHtml, t.BodyText, t.IsActive, t.Version)).ToList();
    }

    public async Task<MessageTemplateDto> UpsertTemplateAsync(
        Guid propertyHorizontalId,
        UpsertMessageTemplateRequest request,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        await EnsurePhAccessAsync(propertyHorizontalId, cancellationToken);

        if (!Enum.TryParse<TemplateChannelScope>(request.ChannelScope, ignoreCase: true, out var scope))
        {
            throw new DomainException("INVALID_TEMPLATE_SCOPE", "Invalid template channel scope.");
        }

        SanitizeTemplateHtml(request.BodyHtml);

        var code = request.Code.Trim();
        var row = await _db.MessageTemplates
            .FirstOrDefaultAsync(t => t.PropertyHorizontalId == propertyHorizontalId && t.Code == code, cancellationToken);

        if (row is null)
        {
            row = new MessageTemplate
            {
                TenantId = _currentTenant.TenantId,
                PropertyHorizontalId = propertyHorizontalId,
                Code = code
            };
            _db.MessageTemplates.Add(row);
        }
        else
        {
            row.Version += 1;
        }

        row.Name = request.Name.Trim();
        row.ChannelScope = scope;
        row.Subject = request.Subject?.Trim();
        row.BodyHtml = request.BodyHtml;
        row.BodyText = request.BodyText;
        row.IsActive = request.IsActive;
        await _db.SaveChangesAsync(cancellationToken);

        return new MessageTemplateDto(
            row.Id, row.Code, row.Name, row.ChannelScope.ToString(), row.Subject, row.BodyHtml, row.BodyText, row.IsActive, row.Version);
    }

    internal async Task<(CommunicationProfile Profile, ChannelConfiguration? Email, ChannelConfiguration? WhatsApp, ChannelConfiguration? Sms, ChannelConfiguration? Portal)>
        LoadRuntimeAsync(Guid propertyHorizontalId, CancellationToken cancellationToken)
    {
        var profile = await GetOrCreateEntityAsync(propertyHorizontalId, cancellationToken);
        await EnsureDefaultChannelsAsync(propertyHorizontalId, cancellationToken);
        await _db.SaveChangesAsync(cancellationToken);

        var channels = await _db.ChannelConfigurations
            .Where(c => c.PropertyHorizontalId == propertyHorizontalId)
            .ToListAsync(cancellationToken);

        return (
            profile,
            channels.FirstOrDefault(c => c.Channel == CommunicationChannel.Email),
            channels.FirstOrDefault(c => c.Channel == CommunicationChannel.WhatsApp),
            channels.FirstOrDefault(c => c.Channel == CommunicationChannel.Sms),
            channels.FirstOrDefault(c => c.Channel == CommunicationChannel.Portal));
    }

    /// <summary>
    /// Resolves the PH Email channel provider (SMTP when Sandbox=false and configured).
    /// Shared by Communication Center tests, convocations, and owner invitations.
    /// </summary>
    public async Task<(IEmailProvider Provider, bool UsedSandbox, string ProviderName)> ResolvePhEmailProviderAsync(
        Guid propertyHorizontalId,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        await EnsurePhAccessAsync(propertyHorizontalId, cancellationToken);

        var profile = await GetOrCreateEntityAsync(propertyHorizontalId, cancellationToken);
        var row = await _db.ChannelConfigurations
            .FirstOrDefaultAsync(
                c => c.PropertyHorizontalId == propertyHorizontalId && c.Channel == CommunicationChannel.Email,
                cancellationToken);

        var forceMock = profile.SandboxMode;
        var provider = await ResolveEmailProviderAsync(row, forceMock, cancellationToken);
        var name = forceMock
                   || row is null
                   || row.ProviderType == CommunicationProviderType.Mock
                   || !row.IsEnabled
            ? "Mock"
            : row.ProviderType.ToString();
        return (provider, forceMock, name);
    }

    public async Task<IEmailProvider> ResolveEmailProviderAsync(
        ChannelConfiguration? config,
        bool forceMock,
        CancellationToken cancellationToken)
    {
        await Task.CompletedTask;
        if (forceMock || config is null || config.ProviderType == CommunicationProviderType.Mock || !config.IsEnabled)
        {
            return _mockEmail;
        }

        if (config.ProviderType != CommunicationProviderType.Smtp)
        {
            return _mockEmail;
        }

        string? password = null;
        if (config.HasSecret && !string.IsNullOrWhiteSpace(config.SecretCiphertext))
        {
            try
            {
                password = _secrets.Unprotect(config.SecretCiphertext);
            }
            catch (Exception ex)
            {
                throw new DomainException(
                    "SMTP_SECRET_DECRYPT_FAILED",
                    "No pudimos leer el secreto SMTP guardado. Vuelve a guardar la contraseña de aplicación.",
                    ex);
            }
        }

        if (string.IsNullOrWhiteSpace(password))
        {
            throw new DomainException(
                "SMTP_SECRET_REQUIRED",
                "La configuración SMTP está incompleta: falta la contraseña/App Password.");
        }

        try
        {
            var settings = SmtpClientFactoryArgs.FromChannel(config.SettingsJson, password);
            return _smtpFactory(settings);
        }
        catch (DomainException)
        {
            throw;
        }
        catch (Exception ex)
        {
            throw new DomainException(
                "CONFIGURATION_ERROR",
                "La configuración SMTP está incompleta o es inválida.",
                ex);
        }
    }

    private async Task EnsurePhAccessAsync(Guid propertyHorizontalId, CancellationToken cancellationToken)
    {
        var ph = await _db.PropertyHorizontals
            .AsNoTracking()
            .FirstOrDefaultAsync(p => p.Id == propertyHorizontalId, cancellationToken)
            ?? throw new DomainException("PH_NOT_FOUND", "Property horizontal not found.");

        TenantGuard.EnsureTenantMatch(_currentTenant, ph.TenantId);
    }

    private async Task<CommunicationProfile> GetOrCreateEntityAsync(
        Guid propertyHorizontalId,
        CancellationToken cancellationToken)
    {
        var profile = await _db.CommunicationProfiles
            .FirstOrDefaultAsync(p => p.PropertyHorizontalId == propertyHorizontalId, cancellationToken);

        if (profile is not null)
        {
            if (profile.SandboxMode)
            {
                profile.SandboxMode = false;
                await _db.SaveChangesAsync(cancellationToken);
            }

            return profile;
        }

        profile = new CommunicationProfile
        {
            TenantId = _currentTenant.TenantId,
            PropertyHorizontalId = propertyHorizontalId,
            SandboxMode = false
        };
        _db.CommunicationProfiles.Add(profile);
        await EnsureDefaultChannelsAsync(propertyHorizontalId, cancellationToken);
        await EnsureDefaultConvocationTemplateAsync(propertyHorizontalId, cancellationToken);
        await _db.SaveChangesAsync(cancellationToken);
        return profile;
    }

    public async Task<ConvocationEmailPreviewDto> GetConvocationEmailPreviewAsync(
        Guid propertyHorizontalId,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        await EnsurePhAccessAsync(propertyHorizontalId, cancellationToken);

        var phName = await _db.PropertyHorizontals.AsNoTracking()
            .Where(p => p.Id == propertyHorizontalId)
            .Select(p => p.Name)
            .FirstOrDefaultAsync(cancellationToken) ?? "Su propiedad horizontal";

        var sample = BuildSampleConvocationEmail(phName);
        return new ConvocationEmailPreviewDto(sample.Subject, sample.Preheader, sample.Html, sample.Text);
    }

    private static ConvocationEmailComposer.ComposeResult BuildSampleConvocationEmail(string phName) =>
        ConvocationEmailComposer.Compose(
            new ConvocationEmailComposer.ComposeInput(
                "María González",
                phName,
                "Asamblea Ordinaria",
                "Ordinaria",
                DateTimeOffset.UtcNow.AddDays(14).Date.AddHours(18),
                "America/Panama",
                "Virtual",
                "Sala virtual ASAMBLEAS",
                "101",
                12.5m,
                [
                    (1, "Verificación de quórum"),
                    (2, "Informe de administración"),
                    (3, "Aprobación de estados financieros")
                ],
                "https://asambleas.app/ejemplo-acceso",
                null,
                false));

    private async Task EnsureDefaultConvocationTemplateAsync(
        Guid propertyHorizontalId,
        CancellationToken cancellationToken)
    {
        const string code = "convocatoria-std";
        var exists = await _db.MessageTemplates.AsNoTracking()
            .AnyAsync(t => t.PropertyHorizontalId == propertyHorizontalId && t.Code == code, cancellationToken);
        if (exists)
        {
            return;
        }

        var phName = await _db.PropertyHorizontals.AsNoTracking()
            .Where(p => p.Id == propertyHorizontalId)
            .Select(p => p.Name)
            .FirstOrDefaultAsync(cancellationToken) ?? "Su PH";
        var sample = BuildSampleConvocationEmail(phName);

        _db.MessageTemplates.Add(new MessageTemplate
        {
            TenantId = _currentTenant.TenantId,
            PropertyHorizontalId = propertyHorizontalId,
            Code = code,
            Name = "Convocatoria institucional",
            ChannelScope = TemplateChannelScope.Email,
            Subject = sample.Subject,
            BodyHtml = sample.Html,
            BodyText = sample.Text,
            IsActive = true,
            Version = 1
        });
    }

    private async Task EnsureDefaultChannelsAsync(Guid propertyHorizontalId, CancellationToken cancellationToken)
    {
        var existing = await _db.ChannelConfigurations
            .Where(c => c.PropertyHorizontalId == propertyHorizontalId)
            .Select(c => c.Channel)
            .ToListAsync(cancellationToken);

        void AddIfMissing(CommunicationChannel channel, CommunicationProviderType provider, bool enabled)
        {
            if (existing.Contains(channel))
            {
                return;
            }

            _db.ChannelConfigurations.Add(new ChannelConfiguration
            {
                TenantId = _currentTenant.TenantId,
                PropertyHorizontalId = propertyHorizontalId,
                Channel = channel,
                ProviderType = provider,
                IsEnabled = enabled,
                SettingsJson = "{}"
            });
        }

        AddIfMissing(CommunicationChannel.Email, CommunicationProviderType.Mock, true);
        AddIfMissing(CommunicationChannel.WhatsApp, CommunicationProviderType.Mock, false);
        AddIfMissing(CommunicationChannel.Sms, CommunicationProviderType.Mock, false);
        AddIfMissing(CommunicationChannel.Portal, CommunicationProviderType.Portal, true);
        AddIfMissing(CommunicationChannel.Pdf, CommunicationProviderType.Mock, false);
        AddIfMissing(CommunicationChannel.Physical, CommunicationProviderType.Mock, false);
    }

    private CommunicationProfileDto ToProfileDto(CommunicationProfile profile) =>
        new(
            profile.Id,
            profile.PropertyHorizontalId,
            profile.SandboxMode,
            profile.TestRecipientOverride,
            profile.DefaultTimezoneId,
            profile.DefaultFromDisplayName,
            profile.DefaultReplyTo,
            profile.SandboxMode);

    private static ChannelConfigurationDto ToChannelDto(ChannelConfiguration row)
    {
        var settings = new Dictionary<string, string?>(StringComparer.OrdinalIgnoreCase);
        try
        {
            using var doc = JsonDocument.Parse(string.IsNullOrWhiteSpace(row.SettingsJson) ? "{}" : row.SettingsJson);
            foreach (var prop in doc.RootElement.EnumerateObject())
            {
                if (IsSecretKey(prop.Name))
                {
                    continue;
                }

                settings[prop.Name] = prop.Value.ValueKind switch
                {
                    JsonValueKind.String => prop.Value.GetString(),
                    JsonValueKind.Number => prop.Value.ToString(),
                    JsonValueKind.True => "true",
                    JsonValueKind.False => "false",
                    _ => prop.Value.ToString()
                };
            }
        }
        catch (JsonException)
        {
            // ignore malformed stored settings for DTO projection
        }

        return new ChannelConfigurationDto(
            row.Id,
            row.Channel.ToString(),
            row.ProviderType.ToString(),
            row.IsEnabled,
            settings,
            row.HasSecret,
            row.LastTestedAtUtc,
            row.LastTestSucceeded,
            row.LastTestDetail);
    }

    private static Dictionary<string, string?> SanitizeSettings(IReadOnlyDictionary<string, string?>? settings)
    {
        var result = new Dictionary<string, string?>(StringComparer.OrdinalIgnoreCase);
        if (settings is null)
        {
            return result;
        }

        foreach (var (key, value) in settings)
        {
            if (IsSecretKey(key))
            {
                continue;
            }

            result[key] = value;
        }

        return result;
    }

    private static bool IsSecretKey(string key) =>
        key.Contains("password", StringComparison.OrdinalIgnoreCase)
        || key.Contains("secret", StringComparison.OrdinalIgnoreCase)
        || key.Contains("token", StringComparison.OrdinalIgnoreCase)
        || key.Contains("apiKey", StringComparison.OrdinalIgnoreCase);

    private static void ValidateProviderForChannel(CommunicationChannel channel, CommunicationProviderType provider)
    {
        var ok = (channel, provider) switch
        {
            (CommunicationChannel.Email, CommunicationProviderType.Mock or CommunicationProviderType.Smtp) => true,
            (CommunicationChannel.WhatsApp, CommunicationProviderType.Mock or CommunicationProviderType.MetaWhatsApp) => true,
            (CommunicationChannel.Sms, CommunicationProviderType.Mock or CommunicationProviderType.TwilioSms) => true,
            (CommunicationChannel.Portal, CommunicationProviderType.Portal or CommunicationProviderType.Mock) => true,
            (CommunicationChannel.Pdf, CommunicationProviderType.Mock) => true,
            (CommunicationChannel.Physical, CommunicationProviderType.Mock) => true,
            _ => false
        };

        if (!ok)
        {
            throw new DomainException("PROVIDER_CHANNEL_MISMATCH", $"Provider {provider} is not valid for {channel}.");
        }
    }

    private static void ValidateSmtpSettings(
        CommunicationChannel channel,
        CommunicationProviderType provider,
        UpsertChannelConfigurationRequest request)
    {
        if (channel != CommunicationChannel.Email || provider != CommunicationProviderType.Smtp || !request.IsEnabled)
        {
            return;
        }

        var settings = request.Settings ?? new Dictionary<string, string?>();
        if (!settings.TryGetValue("host", out var host) || string.IsNullOrWhiteSpace(host))
        {
            throw new DomainException("SMTP_HOST_REQUIRED", "SMTP host is required when Email/SMTP is enabled.");
        }

        if (!settings.TryGetValue("port", out var portRaw) || !int.TryParse(portRaw, out var port) || port is < 1 or > 65535)
        {
            throw new DomainException("SMTP_PORT_INVALID", "SMTP port must be an integer between 1 and 65535.");
        }

        if (settings.TryGetValue("useSsl", out var sslRaw)
            && !string.IsNullOrWhiteSpace(sslRaw)
            && !bool.TryParse(sslRaw, out _))
        {
            throw new DomainException("SMTP_SSL_INVALID", "useSsl must be true or false.");
        }

        if (!settings.TryGetValue("fromAddress", out var from) || string.IsNullOrWhiteSpace(from))
        {
            throw new DomainException("SMTP_FROM_REQUIRED", "fromAddress is required for SMTP.");
        }
    }

    private static void SanitizeTemplateHtml(string html)
    {
        if (html.Contains("<script", StringComparison.OrdinalIgnoreCase)
            || html.Contains("javascript:", StringComparison.OrdinalIgnoreCase)
            || html.Contains("onerror=", StringComparison.OrdinalIgnoreCase))
        {
            throw new DomainException("UNSAFE_TEMPLATE_HTML", "Template HTML contains forbidden content.");
        }
    }

    private static string NormalizeTimezoneId(string? timezoneId)
    {
        var tz = string.IsNullOrWhiteSpace(timezoneId) ? "America/Panama" : timezoneId.Trim();
        try
        {
            _ = TimeZoneInfo.FindSystemTimeZoneById(tz);
            return tz;
        }
        catch (TimeZoneNotFoundException)
        {
            throw new DomainException(
                "TIMEZONE_INVALID",
                $"La zona horaria '{tz}' no es válida. Usa un ID IANA (ej. America/Panama).");
        }
        catch (InvalidTimeZoneException)
        {
            throw new DomainException(
                "TIMEZONE_INVALID",
                $"La zona horaria '{tz}' no es válida. Usa un ID IANA (ej. America/Panama).");
        }
    }

    private static string? NormalizeOptionalEmail(string? value, string code, string message)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var email = value.Trim();
        if (!IsValidEmail(email))
        {
            throw new DomainException(code, message);
        }

        return email;
    }

    private static bool IsValidEmail(string email)
    {
        try
        {
            var addr = new System.Net.Mail.MailAddress(email);
            return string.Equals(addr.Address, email, StringComparison.OrdinalIgnoreCase);
        }
        catch
        {
            return false;
        }
    }
}

/// <summary>Factory args for SMTP provider creation without leaking Infrastructure types into Application DI graphs incorrectly.</summary>
public sealed record SmtpClientFactoryArgs(string SettingsJson, string? Password)
{
    public static SmtpClientFactoryArgs FromChannel(string settingsJson, string? password) =>
        new(settingsJson, password);
}
