"""Export launcher PNGs from the same geometry as asambleas-mark.svg."""
from pathlib import Path
import math
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
NAVY = (14, 39, 68, 255)
RING = (231, 238, 246, 255)
TEAL = (20, 184, 166, 255)
WHITE = (255, 255, 255, 255)


def draw_mark(size: int, background, ring, accent, rounded: bool) -> Image.Image:
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    if background is not None:
        if rounded:
            radius = int(size * 0.22)
            draw.rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=background)
        else:
            draw.rectangle((0, 0, size - 1, size - 1), fill=background)
    inset = size * 0.30
    box = (inset, inset, size - inset, size - inset)
    width = max(2, int(size * 0.075))
    draw.ellipse(box, outline=ring, width=width)
    draw.arc(box, start=180, end=270, fill=accent, width=width)
    return image


def main() -> None:
    brand = ROOT / "brand" / "export"
    brand.mkdir(parents=True, exist_ok=True)
    draw_mark(1024, NAVY, RING, TEAL, True).save(brand / "mark-1024.png")
    draw_mark(1024, None, WHITE, WHITE, False).save(brand / "mark-mono-1024.png")
    draw_mark(512, NAVY, RING, TEAL, True).save(brand / "mark-circle-safe.png")
    densities = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
    for name, size in densities.items():
        folder = ROOT / "android" / "app" / "src" / "main" / "res" / f"mipmap-{name}"
        folder.mkdir(parents=True, exist_ok=True)
        draw_mark(size, NAVY, RING, TEAL, True).save(folder / "ic_launcher.png")
    print("exported", math.tau)


if __name__ == "__main__":
    main()
