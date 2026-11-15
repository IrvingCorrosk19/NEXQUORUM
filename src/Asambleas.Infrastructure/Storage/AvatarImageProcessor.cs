namespace Asambleas.Infrastructure.Storage;

using ImageMagick;

/// <summary>
/// Normalizes profile photos: EXIF orientation, centered square crop, strip metadata,
/// WebP thumbnail ≤ 256×256 aiming for ~50 KB.
/// </summary>
public static class AvatarImageProcessor
{
    public const int MaxOutputEdge = 256;
    public const int MaxInputEdge = 8192;
    public const int MinInputEdge = 32;
    public const int TargetBytes = 50 * 1024;

    public sealed record Result(
        MemoryStream Content,
        string ContentType,
        int SourceWidth,
        int SourceHeight,
        long SourceBytes,
        int OutputWidth,
        int OutputHeight,
        long OutputBytes);

    public static async Task<Result> ProcessAsync(Stream input, long sourceBytes, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(input);

        MagickImage image;
        try
        {
            image = new MagickImage(input);
        }
        catch (MagickException)
        {
            throw new AvatarProcessingException("El archivo no es una imagen válida.");
        }

        using (image)
        {
            cancellationToken.ThrowIfCancellationRequested();
            image.AutoOrient();
            image.Strip();

            var sourceWidth = (int)image.Width;
            var sourceHeight = (int)image.Height;
            if (sourceWidth < MinInputEdge || sourceHeight < MinInputEdge)
            {
                throw new AvatarProcessingException(
                    $"La imagen debe medir al menos {MinInputEdge}×{MinInputEdge} píxeles.");
            }

            if (sourceWidth > MaxInputEdge || sourceHeight > MaxInputEdge)
            {
                throw new AvatarProcessingException(
                    $"La imagen no puede superar {MaxInputEdge}×{MaxInputEdge} píxeles.");
            }

            var side = (uint)Math.Min(sourceWidth, sourceHeight);
            image.Crop(side, side, Gravity.Center);
            image.ResetPage();

            var outputEdge = Math.Min((int)side, MaxOutputEdge);
            if (image.Width != (uint)outputEdge || image.Height != (uint)outputEdge)
            {
                image.Resize((uint)outputEdge, (uint)outputEdge);
            }

            image.Strip();
            image.Format = MagickFormat.WebP;

            var encoded = await EncodeWebpNearTargetAsync(image, cancellationToken);
            encoded.Position = 0;

            return new Result(
                encoded,
                "image/webp",
                sourceWidth,
                sourceHeight,
                sourceBytes,
                (int)image.Width,
                (int)image.Height,
                encoded.Length);
        }
    }

    private static async Task<MemoryStream> EncodeWebpNearTargetAsync(MagickImage image, CancellationToken cancellationToken)
    {
        var qualities = new[] { 82u, 72u, 62u, 52u, 42u, 32u };
        MemoryStream? best = null;

        foreach (var quality in qualities)
        {
            cancellationToken.ThrowIfCancellationRequested();
            image.Quality = quality;
            var ms = new MemoryStream();
            await image.WriteAsync(ms, MagickFormat.WebP, cancellationToken);
            if (best is null || ms.Length < best.Length)
            {
                best?.Dispose();
                best = ms;
            }
            else
            {
                await ms.DisposeAsync();
            }

            if (best.Length <= TargetBytes)
            {
                break;
            }
        }

        return best ?? throw new AvatarProcessingException("No pudimos optimizar la imagen.");
    }
}

public sealed class AvatarProcessingException : Exception
{
    public AvatarProcessingException(string message) : base(message)
    {
    }
}
