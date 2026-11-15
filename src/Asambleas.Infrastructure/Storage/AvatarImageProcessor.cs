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

        await using var buffer = await CopyToMemoryAsync(input, cancellationToken);
        buffer.Position = 0;

        MagickImageInfo info;
        try
        {
            info = new MagickImageInfo(buffer);
        }
        catch (MagickException)
        {
            throw new AvatarProcessingException("El archivo no es una imagen válida.");
        }

        if (!IsAllowedFormat(info.Format))
        {
            throw new AvatarProcessingException("Usa una imagen JPG, PNG o WebP.");
        }

        var pingWidth = (int)info.Width;
        var pingHeight = (int)info.Height;
        EnsureInputDimensions(pingWidth, pingHeight);

        buffer.Position = 0;
        MagickImage image;
        try
        {
            image = new MagickImage(buffer);
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
            EnsureInputDimensions(sourceWidth, sourceHeight);

            var target = (uint)Math.Min(MaxOutputEdge, Math.Min(sourceWidth, sourceHeight));
            image.Resize(new MagickGeometry(target, target)
            {
                IgnoreAspectRatio = false,
                FillArea = true
            });
            image.Crop(target, target, Gravity.Center);
            image.ResetPage();
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

    private static void EnsureInputDimensions(int width, int height)
    {
        if (width < MinInputEdge || height < MinInputEdge)
        {
            throw new AvatarProcessingException(
                $"La imagen debe medir al menos {MinInputEdge}×{MinInputEdge} píxeles.");
        }

        if (width > MaxInputEdge || height > MaxInputEdge)
        {
            throw new AvatarProcessingException(
                $"La imagen no puede superar {MaxInputEdge}×{MaxInputEdge} píxeles.");
        }
    }

    private static bool IsAllowedFormat(MagickFormat format) =>
        format is MagickFormat.Jpeg
            or MagickFormat.Jpg
            or MagickFormat.Pjpeg
            or MagickFormat.Png
            or MagickFormat.Png8
            or MagickFormat.Png24
            or MagickFormat.Png32
            or MagickFormat.Png48
            or MagickFormat.Png64
            or MagickFormat.WebP;

    private static async Task<MemoryStream> CopyToMemoryAsync(Stream input, CancellationToken cancellationToken)
    {
        var buffer = new MemoryStream();
        if (input.CanSeek)
        {
            input.Position = 0;
        }

        await input.CopyToAsync(buffer, cancellationToken);
        return buffer;
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
