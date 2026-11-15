namespace Asambleas.Infrastructure.Storage;

using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats.Webp;
using SixLabors.ImageSharp.Processing;

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

        Image image;
        try
        {
            image = await Image.LoadAsync(input, cancellationToken);
        }
        catch (UnknownImageFormatException)
        {
            throw new AvatarProcessingException("El archivo no es una imagen válida.");
        }
        catch (InvalidImageContentException)
        {
            throw new AvatarProcessingException("El archivo no es una imagen válida.");
        }

        using (image)
        {
            image.Mutate(ctx => ctx.AutoOrient());
            StripMetadata(image);

            var sourceWidth = image.Width;
            var sourceHeight = image.Height;
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

            var side = Math.Min(sourceWidth, sourceHeight);
            var cropX = (sourceWidth - side) / 2;
            var cropY = (sourceHeight - side) / 2;
            var outputEdge = Math.Min(side, MaxOutputEdge);

            image.Mutate(ctx =>
            {
                ctx.Crop(new Rectangle(cropX, cropY, side, side));
                if (side != outputEdge)
                {
                    ctx.Resize(outputEdge, outputEdge);
                }
            });

            StripMetadata(image);

            var encoded = await EncodeWebpNearTargetAsync(image, cancellationToken);
            encoded.Position = 0;

            return new Result(
                encoded,
                "image/webp",
                sourceWidth,
                sourceHeight,
                sourceBytes,
                image.Width,
                image.Height,
                encoded.Length);
        }
    }

    private static void StripMetadata(Image image)
    {
        image.Metadata.ExifProfile = null;
        image.Metadata.IccProfile = null;
        image.Metadata.IptcProfile = null;
        image.Metadata.XmpProfile = null;
        image.Metadata.CicpProfile = null;
    }

    private static async Task<MemoryStream> EncodeWebpNearTargetAsync(Image image, CancellationToken cancellationToken)
    {
        // Prefer quality that lands near 50 KB without exceeding much; drop quality if needed.
        var qualities = new[] { 82, 72, 62, 52, 42, 32 };
        MemoryStream? best = null;
        foreach (var quality in qualities)
        {
            var ms = new MemoryStream();
            var encoder = new WebpEncoder
            {
                FileFormat = WebpFileFormatType.Lossy,
                Quality = quality,
                Method = WebpEncodingMethod.Default,
                SkipMetadata = true
            };
            await image.SaveAsync(ms, encoder, cancellationToken);
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
