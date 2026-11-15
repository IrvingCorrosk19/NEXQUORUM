namespace Asambleas.Web.Security;

/// <summary>Validates uploaded profile photos by size, declared type, and magic bytes.</summary>
public static class AvatarImageValidator
{
    public const long MaxBytes = 2 * 1024 * 1024;

    public static readonly HashSet<string> AllowedContentTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/webp"
    };

    public static string? Validate(IFormFile file, out string normalizedContentType)
    {
        normalizedContentType = string.Empty;
        if (file is null || file.Length <= 0)
        {
            return "Selecciona una imagen.";
        }

        if (file.Length > MaxBytes)
        {
            return "La imagen no puede superar 2 MB.";
        }

        using var stream = file.OpenReadStream();
        Span<byte> header = stackalloc byte[12];
        var read = stream.Read(header);
        if (read < 3)
        {
            return "No pudimos leer la imagen.";
        }

        var detected = Detect(header[..read]);
        if (detected is null)
        {
            return "El archivo no es una imagen válida.";
        }

        var declared = (file.ContentType ?? string.Empty).Trim();
        if (!string.IsNullOrEmpty(declared))
        {
            if (!AllowedContentTypes.Contains(declared))
            {
                return "Usa una imagen JPG, PNG o WebP.";
            }

            if (detected == "image/jpeg" && declared is not ("image/jpeg" or "image/jpg"))
            {
                return "El contenido no coincide con el tipo declarado.";
            }

            if (detected == "image/png" && !declared.Equals("image/png", StringComparison.OrdinalIgnoreCase))
            {
                return "El contenido no coincide con el tipo declarado.";
            }

            if (detected == "image/webp" && !declared.Equals("image/webp", StringComparison.OrdinalIgnoreCase))
            {
                return "El contenido no coincide con el tipo declarado.";
            }
        }

        normalizedContentType = detected;
        return null;
    }

    private static string? Detect(ReadOnlySpan<byte> header)
    {
        if (header.Length >= 3 && header[0] == 0xFF && header[1] == 0xD8 && header[2] == 0xFF)
        {
            return "image/jpeg";
        }

        if (header.Length >= 8
            && header[0] == 0x89 && header[1] == 0x50 && header[2] == 0x4E && header[3] == 0x47
            && header[4] == 0x0D && header[5] == 0x0A && header[6] == 0x1A && header[7] == 0x0A)
        {
            return "image/png";
        }

        // RIFF....WEBP
        if (header.Length >= 12
            && header[0] == (byte)'R' && header[1] == (byte)'I' && header[2] == (byte)'F' && header[3] == (byte)'F'
            && header[8] == (byte)'W' && header[9] == (byte)'E' && header[10] == (byte)'B' && header[11] == (byte)'P')
        {
            return "image/webp";
        }

        return null;
    }
}
