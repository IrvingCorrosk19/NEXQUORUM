namespace Asambleas.Application.Abstractions;

/// <summary>Object/file storage for assembly recordings. Never couples domain to a cloud vendor.</summary>
public interface IAssemblyRecordingStorage
{
    Task WriteAsync(string storageKey, Stream content, string contentType, CancellationToken cancellationToken = default);

    Task<Stream> OpenReadAsync(string storageKey, CancellationToken cancellationToken = default);

    Task<(Stream Stream, long Length, string ContentType)> OpenReadWithMetaAsync(
        string storageKey,
        CancellationToken cancellationToken = default);

    Task<bool> ExistsAsync(string storageKey, CancellationToken cancellationToken = default);

    Task DeleteAsync(string storageKey, CancellationToken cancellationToken = default);

    /// <summary>Optional short-lived URL for object storage backends. Null means app must proxy stream.</summary>
    Task<Uri?> TryCreateExpiringReadUrlAsync(
        string storageKey,
        TimeSpan ttl,
        CancellationToken cancellationToken = default);
}

public sealed record MeetingRecordingStartResult(
    string Provider,
    string? EgressId,
    string StorageKey,
    string MimeType,
    string DisplayFileName);

public sealed record MeetingRecordingStopResult(
    string? EgressId,
    bool ProcessingAsync);

public sealed record MeetingRecordingProviderStatus(
    string Status,
    string? LocalFilePath,
    long? FileSizeBytes,
    string? FailureReason);

/// <summary>Starts/stops media capture for a LiveKit room (egress) or certified fallback provider.</summary>
public interface IMeetingRecordingProvider
{
    Task<bool> IsAvailableAsync(CancellationToken cancellationToken = default);

    Task<MeetingRecordingStartResult> StartAsync(
        Guid tenantId,
        Guid assemblyId,
        Guid recordingId,
        string roomName,
        string outputStorageKey,
        CancellationToken cancellationToken = default);

    Task<MeetingRecordingStopResult> StopAsync(
        string? egressId,
        string storageKey,
        CancellationToken cancellationToken = default);

    Task<MeetingRecordingProviderStatus> GetStatusAsync(
        string? egressId,
        string storageKey,
        CancellationToken cancellationToken = default);
}
