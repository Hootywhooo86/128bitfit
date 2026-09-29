"""
Build the app icon set from the heart sprite below.

Run with `python3 scripts/build-icons.py` after editing SPRITE. Requires
Pillow; it is not a build step, so the generated PNGs are committed.

The heart was supplied as an AI-rendered JPEG: soft edges, compression noise,
and "pixels" of uneven size that no grid lines up with. Scaling that would
blur at every size, so it is redrawn here by hand as a 26 x 25 grid, like the
character sprite, and rendered at whole-number scales only. Each cell becomes
an exact square of one colour at every size, which is what pixel art needs to
stay crisp on a launcher.

Two things this script gets right:

1. Android's adaptive icon crops. The launcher masks the foreground to a
   circle, squircle or rounded square depending on the phone, and only a
   66dp circle of the 108dp canvas is guaranteed to survive. The scale is
   chosen so every opaque pixel sits inside that circle, measured rather
   than assumed from the bounding box, because the heart's widest rows sit
   off-centre, where a box-based fit would clip them.

2. The themed (monochrome) icon is a silhouette Android tints itself. The
   dumbbell and heartbeat are cut out of it, so the themed icon keeps the
   design instead of becoming a plain heart.
"""
from math import floor, hypot

from PIL import Image

# T teal, N navy, W shine, L plate highlight, . transparent.
SPRITE = """
.....TTTTT......TTTTT.....
...TTTTTTTTT..TTTTTTTTT...
..TTWWTTTTTTTTTTTTTTTTTT..
.TTWTTTTTTTNTTTTTTTTTTTTT.
.TTTTTTTTTTNTTTTTTTTTTTTT.
TTTTTTTTTTNTNTTTTTTTTTTTTT
TTTNNNNTTTNTNTTTTTTNNNNTTT
TTNNNNNTTTNTNTTTTTTNNNNNTT
TTNLLNNTTTNTTNTTTTTNNLLNTT
TTNLNNNNNNNTTNTNNNNNNNLNTT
TTNNNNNNNNTTTNTNNNNNNNNNTT
TTNNNNNTTTTTTNTNTTTNNNNNTT
.TNNNNNTTTTTTTNTTTTNNNNNT.
.TTNNNNTTTTTTTNTTTTNNNNTT.
..TTTTTTTTTTTTTTTTTTTTTT..
...TTTTTTTTTTTTTTTTTTTT...
....TTTTTTTTTTTTTTTTTT....
.....TTTTTTTTTTTTTTTT.....
......TTTTTTTTTTTTTT......
.......TTTTTTTTTTTT.......
........TTTTTTTTTT........
.........TTTTTTTT.........
..........TTTTTT..........
...........TTTT...........
............TT............
"""

PALETTE = {
    'T': (36, 212, 192),
    'N': (12, 34, 73),
    'W': (214, 246, 240),
    'L': (185, 218, 217),
}
# Opaque in the themed icon; everything else is cut out.
MONO_SOLID = {'T', 'W'}

OUT = 'assets/images'
BG = (0, 0, 0)  # Matches colors.bg in lib/theme and app.json's backgrounds.

ROWS = SPRITE.strip('\n').split('\n')
W, H = len(ROWS[0]), len(ROWS)
assert all(len(r) == W for r in ROWS), 'every sprite row must be the same width'


def render(cell: int, mono: bool = False) -> Image.Image:
    """The sprite at `cell` pixels per cell, on transparent."""
    img = Image.new('RGBA', (W * cell, H * cell), (0, 0, 0, 0))
    for y, row in enumerate(ROWS):
        for x, ch in enumerate(row):
            if ch == '.':
                continue
            if mono:
                if ch not in MONO_SOLID:
                    continue
                colour = (255, 255, 255, 255)
            else:
                colour = (*PALETTE[ch], 255)
            img.paste(colour, (x * cell, y * cell, (x + 1) * cell, (y + 1) * cell))
    return img


def on_canvas(size: int, cell: int, background=None, mono: bool = False) -> Image.Image:
    art = render(cell, mono)
    canvas = Image.new('RGBA', (size, size), (*background, 255) if background else (0, 0, 0, 0))
    canvas.paste(art, ((size - art.width) // 2, (size - art.height) // 2), art)
    return canvas


def fit(size: int, coverage: float) -> int:
    """Largest whole cell size that fits the sprite in `coverage` of the canvas."""
    return max(1, floor(size * coverage / max(W, H)))


def fit_circle(size: int, diameter: float) -> int:
    """Largest whole cell size keeping every opaque pixel inside a centred circle."""
    # Farthest opaque cell corner from the sprite's centre, in cells.
    reach = max(
        hypot(cx - W / 2, cy - H / 2)
        for y, row in enumerate(ROWS)
        for x, ch in enumerate(row)
        if ch != '.'
        for cx in (x, x + 1)
        for cy in (y, y + 1)
    )
    return floor(size * diameter / 2 / reach)


# Launcher / Play icon: on the app's black, no transparency.
on_canvas(1024, fit(1024, 0.80), BG).convert('RGB').save(f'{OUT}/icon.png')

# Adaptive foreground: every pixel inside the guaranteed 66dp of 108dp.
safe = fit_circle(1024, 66 / 108)
on_canvas(1024, safe).save(f'{OUT}/android-icon-foreground.png')

# Adaptive background: flat, so the foreground never sits on a seam.
Image.new('RGB', (1024, 1024), BG).save(f'{OUT}/android-icon-background.png')

# Themed icon: same placement as the foreground, as a silhouette.
on_canvas(1024, safe, mono=True).save(f'{OUT}/android-icon-monochrome.png')

# Splash: transparent. The splash screen paints its own backgroundColor, and an
# opaque tile over it shows as a square wherever the two blacks disagree.
on_canvas(512, fit(512, 0.70)).save(f'{OUT}/splash-icon.png')
on_canvas(196, fit(196, 0.84), BG).convert('RGB').save(f'{OUT}/favicon.png')

# Top bar: drawn at 16dp, so 2px cells (52px) cover a 3x screen.
on_canvas(52, 2).save('assets/brand/logo-topbar.png')

# The master, for anything else that wants the logo.
on_canvas(W * 20 + 40, 20).save('assets/brand/logo.png')

print(f'sprite {W}x{H}; adaptive cell {safe}px')
for name in ('icon', 'android-icon-foreground', 'android-icon-background',
             'android-icon-monochrome', 'splash-icon', 'favicon'):
    im = Image.open(f'{OUT}/{name}.png')
    print(f'{name:28s} {str(im.size):12s} {im.mode}')
