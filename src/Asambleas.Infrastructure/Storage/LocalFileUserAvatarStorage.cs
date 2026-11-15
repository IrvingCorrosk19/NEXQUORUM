namespace Asambleas.Infrastructure.Storage;

using Asambleas.Application.Abstractions;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;

public sealed class LocalFileUserAvatarStorage : IUserAvatarStorage
{
    public const string RequestPath = "/uploads/avatars";
    private readonly string _root;

    public LocalFileUserAvatarStorage(IConfiguration configuration, IHostEnvironment env)
    {
        _root = configuration["Avatar:StorageRoot"]
            ?? Environment.GetEnvironmentVariable("ASAMBLEAS_AVATAR_ROOT")
            ?? Path.Combine(env.ContentRootPath, "App_Data", "avatars");
        Directory.CreateDirectory(_root);
    }

    public string RootPath => _root;

    public async Task<string> SaveAsync(
        Guid userId,
        Stream content,
        string contentType,
        string? previousRelativeUrl,
        CancellationToken cancellationToken = default)
    {
        // Optimized avatars are always stored as WebP thumbnails.
        if (!string.Equals(contentType, "image/webp", StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException("UNSUPPORTED_IMAGE_TYPE");
        }

        var fileName = $"{userId:N}-{DateTimeOffset.UtcNow.ToUnixTimeSeconds()}.webp";
        var path = Path.Combine(_root, fileName);
        if (content.CanSeek)
        {
            content.Position = 0;
        }

        await using (var fs = new FileStream(path, FileMode.CreateNew, FileAccess.Write, FileShare.None, 64 * 1024, FileOptions.Asynchronous))
        {
            await content.CopyToAsync(fs, cancellationToken);
        }

        DeleteIfExists(previousRelativeUrl);
        return $"{RequestPath}/{fileName}";
    }

    public void DeleteIfExists(string? relativeUrl)
    {
        if (string.IsNullOrWhiteSpace(relativeUrl)) return;
        if (!relativeUrl.StartsWith(RequestPath + "/", StringComparison.OrdinalIgnoreCase)) return;
        var name = Path.GetFileName(relativeUrl);
        if (string.IsNullOrWhiteSpace(name) || name.Contains("..", StringComparison.Ordinal)) return;
        var path = Path.Combine(_root, name);
        if (File.Exists(path))
        {
            try { File.Delete(path); } catch { /* best effort */ }
        }
    }
}
