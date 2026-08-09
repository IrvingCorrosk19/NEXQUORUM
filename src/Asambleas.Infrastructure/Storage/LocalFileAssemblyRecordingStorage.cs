namespace Asambleas.Infrastructure.Storage;

using Asambleas.Application.Abstractions;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

public sealed class LocalFileAssemblyRecordingStorage : IAssemblyRecordingStorage
{
    private readonly string _root;
    private readonly ILogger<LocalFileAssemblyRecordingStorage> _logger;

    public LocalFileAssemblyRecordingStorage(
        IConfiguration configuration,
        ILogger<LocalFileAssemblyRecordingStorage> logger)
    {
        _logger = logger;
        _root = configuration["Recording:StorageRoot"]
                ?? Environment.GetEnvironmentVariable("ASAMBLEAS_RECORDING_ROOT")
                ?? Path.Combine(Path.GetTempPath(), "asambleas-recordings");
        Directory.CreateDirectory(_root);
    }

    public Task WriteAsync(string storageKey, Stream content, string contentType, CancellationToken cancellationToken = default)
    {
        var path = ResolvePath(storageKey);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        return WriteFileAsync(path, content, cancellationToken);
    }

    public Task<Stream> OpenReadAsync(string storageKey, CancellationToken cancellationToken = default)
    {
        var path = ResolvePath(storageKey);
        if (!File.Exists(path))
        {
            throw new FileNotFoundException("Recording object was not found.", storageKey);
        }

        Stream stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read, 64 * 1024, FileOptions.Asynchronous | FileOptions.SequentialScan);
        return Task.FromResult(stream);
    }

    public Task<(Stream Stream, long Length, string ContentType)> OpenReadWithMetaAsync(
        string storageKey,
        CancellationToken cancellationToken = default)
    {
        var path = ResolvePath(storageKey);
        if (!File.Exists(path))
        {
            throw new FileNotFoundException("Recording object was not found.", storageKey);
        }

        var info = new FileInfo(path);
        Stream stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read, 64 * 1024, FileOptions.Asynchronous | FileOptions.SequentialScan);
        var contentType = path.EndsWith(".mp4", StringComparison.OrdinalIgnoreCase)
            ? "video/mp4"
            : "application/octet-stream";
        return Task.FromResult((stream, info.Length, contentType));
    }

    public Task<bool> ExistsAsync(string storageKey, CancellationToken cancellationToken = default)
    {
        return Task.FromResult(File.Exists(ResolvePath(storageKey)));
    }

    public Task DeleteAsync(string storageKey, CancellationToken cancellationToken = default)
    {
        var path = ResolvePath(storageKey);
        if (File.Exists(path))
        {
            File.Delete(path);
        }

        return Task.CompletedTask;
    }

    public Task<Uri?> TryCreateExpiringReadUrlAsync(
        string storageKey,
        TimeSpan ttl,
        CancellationToken cancellationToken = default)
    {
        // Local filesystem has no public URLs — app must authorize + proxy/stream.
        _ = storageKey;
        _ = ttl;
        return Task.FromResult<Uri?>(null);
    }

    private string ResolvePath(string storageKey)
    {
        if (string.IsNullOrWhiteSpace(storageKey)
            || storageKey.Contains("..", StringComparison.Ordinal)
            || Path.IsPathRooted(storageKey))
        {
            throw new InvalidOperationException("Invalid storage key.");
        }

        var full = Path.GetFullPath(Path.Combine(_root, storageKey.Replace('/', Path.DirectorySeparatorChar)));
        var rootFull = Path.GetFullPath(_root);
        if (!full.StartsWith(rootFull, StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException("Storage key escapes root.");
        }

        return full;
    }

    private static async Task WriteFileAsync(string path, Stream content, CancellationToken cancellationToken)
    {
        await using var fs = new FileStream(path, FileMode.Create, FileAccess.Write, FileShare.None, 64 * 1024, FileOptions.Asynchronous);
        await content.CopyToAsync(fs, cancellationToken);
    }
}
