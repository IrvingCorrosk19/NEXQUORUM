using Asambleas.Infrastructure.Storage;
using FluentAssertions;
using ImageMagick;

namespace Asambleas.UnitTests.Storage;

public class AvatarImageProcessorTests
{
    [Fact]
    public async Task ProcessAsync_ConvertsLandscapeJpeg_ToSquareWebpThumbnail()
    {
        await using var source = CreateJpeg(1800, 1200, quality: 88);
        var sourceBytes = source.Length;

        var result = await AvatarImageProcessor.ProcessAsync(source, sourceBytes);

        result.ContentType.Should().Be("image/webp");
        result.SourceWidth.Should().Be(1800);
        result.SourceHeight.Should().Be(1200);
        result.SourceBytes.Should().Be(sourceBytes);
        result.OutputWidth.Should().Be(256);
        result.OutputHeight.Should().Be(256);
        result.OutputBytes.Should().BeGreaterThan(0);
        result.OutputBytes.Should().BeLessThanOrEqualTo(AvatarImageProcessor.TargetBytes);

        result.Content.Position = 0;
        using var output = new MagickImage(result.Content);
        output.Format.Should().Be(MagickFormat.WebP);
        output.Width.Should().Be(256);
        output.Height.Should().Be(256);
        output.GetExifProfile().Should().BeNull();
        output.GetIptcProfile().Should().BeNull();
        output.GetXmpProfile().Should().BeNull();
    }

    [Fact]
    public async Task ProcessAsync_CorrectsOrientationAndCropsWithoutStretching()
    {
        await using var source = CreateJpeg(400, 200, quality: 90, Orientation.RightTop);

        var result = await AvatarImageProcessor.ProcessAsync(source, source.Length);

        result.SourceWidth.Should().Be(200);
        result.SourceHeight.Should().Be(400);
        result.OutputWidth.Should().Be(200);
        result.OutputHeight.Should().Be(200);
        result.ContentType.Should().Be("image/webp");
    }

    [Fact]
    public async Task ProcessAsync_RejectsTinyImages()
    {
        await using var source = CreateJpeg(16, 16, quality: 80);

        var act = async () => await AvatarImageProcessor.ProcessAsync(source, source.Length);

        await act.Should().ThrowAsync<AvatarProcessingException>()
            .WithMessage("*32*");
    }

    private static MemoryStream CreateJpeg(uint width, uint height, uint quality, Orientation? orientation = null)
    {
        using var image = new MagickImage(MagickColors.Teal, width, height);
        using var bar = new MagickImage(MagickColors.Coral, Math.Max(1, width / 4), height);
        image.Composite(bar, Gravity.West, CompositeOperator.Over);
        if (orientation.HasValue)
        {
            image.Orientation = orientation.Value;
            var exif = new ExifProfile();
            exif.SetValue(ExifTag.Orientation, (ushort)orientation.Value);
            image.SetProfile(exif);
        }

        image.Quality = quality;
        image.Format = MagickFormat.Jpeg;
        var ms = new MemoryStream();
        image.Write(ms);
        ms.Position = 0;
        return ms;
    }
}
