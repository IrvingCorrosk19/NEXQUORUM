namespace Asambleas.Infrastructure.Meeting;

public sealed class LiveKitOptions
{
    public const string SectionName = "LiveKit";

    public string Url { get; set; } = string.Empty;

    public string ApiKey { get; set; } = string.Empty;

    public string ApiSecret { get; set; } = string.Empty;

    public string? DefaultRoomPrefix { get; set; }

    public bool IsConfigured =>
        !string.IsNullOrWhiteSpace(Url)
        && !string.IsNullOrWhiteSpace(ApiKey)
        && !string.IsNullOrWhiteSpace(ApiSecret);
}
