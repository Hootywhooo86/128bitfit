"""
Build the app icon set from assets/brand/logo.png.

Run with `python3 scripts/build-icons.py` after replacing that file. Requires
Pillow; it is not a build step, so the generated PNGs are committed.

The source is a JPEG of a cyan pixel apple on black. Two things matter:

1. Alpha has to be derived, because a JPEG has none. The artwork sits on pure
   black, so the brightest channel doubles as coverage — which keeps the glow
   fading out properly instead of leaving a hard rectangular edge.

2. Android's adaptive icon crops. The launcher masks the foreground to a
   circle, squircle or rounded square depending on the phone, and only the
   centre ~66% is guaranteed to survive. The logo is scaled to fit that safe
   zone rather than the full canvas, or the stem and the bottom row get cut.
"""
from PIL import Image

SRC = 'assets/brand/logo.png'
OUT = 'assets/images'
BG = (0, 0, 0)  # The artwork's own background; matches colors.bg in lib/theme.

src = Image.open(SRC).convert('RGB')

# Coverage from the brightest channel: black background -> 0, glow -> partial.
r, g, b = src.split()
alpha = Image.new('L', src.size)
alpha.putdata([max(px) for px in zip(r.getdata(), g.getdata(), b.getdata())])
logo = src.copy()
logo.putalpha(alpha)

# Trim to the artwork so scaling is about the apple, not the canvas padding.
bbox = alpha.point(lambda v: 255 if v > 12 else 0).getbbox()
logo = logo.crop(bbox)
print('source', src.size, '-> trimmed', logo.size)


def placed(size: int, coverage: float, background=None) -> Image.Image:
    """The logo centred on a square canvas, occupying `coverage` of its width."""
    target = int(size * coverage)
    scaled = logo.copy()
    scaled.thumbnail((target, target), Image.LANCZOS)
    canvas = Image.new('RGBA', (size, size), (*background, 255) if background else (0, 0, 0, 0))
    canvas.paste(
        scaled,
        ((size - scaled.width) // 2, (size - scaled.height) // 2),
        scaled,
    )
    return canvas


# Play/launcher icon: full bleed on the artwork's own black, no transparency.
placed(1024, 0.78, BG).convert('RGB').save(f'{OUT}/icon.png')

# Adaptive foreground: transparent, inside the 66% safe zone.
placed(1024, 0.62).save(f'{OUT}/android-icon-foreground.png')

# Adaptive background: flat, so the foreground never sits on a seam.
Image.new('RGB', (1024, 1024), BG).save(f'{OUT}/android-icon-background.png')

# Themed icon: Android tints this itself, so it wants a flat silhouette rather
# than the gradient — colour here would be ignored and the shape is all it uses.
mono = placed(1024, 0.62)
white = Image.new('RGBA', mono.size, (255, 255, 255, 0))
white.putalpha(mono.getchannel('A'))
white.save(f'{OUT}/android-icon-monochrome.png')

# Splash: transparent, not black-on-black-ish. The splash screen paints its own
# backgroundColor, and an opaque tile over it shows as a square wherever the two
# blacks do not match exactly — which they did not before (#000 on #0a0a0a).
placed(512, 0.70).save(f'{OUT}/splash-icon.png')
placed(196, 0.80, BG).convert('RGB').save(f'{OUT}/favicon.png')

for name in ('icon', 'android-icon-foreground', 'android-icon-background',
             'android-icon-monochrome', 'splash-icon', 'favicon'):
    im = Image.open(f'{OUT}/{name}.png')
    print(f'{name:28s} {str(im.size):12s} {im.mode}')
