"""Repair two defects in the vendor Mondwest files, post-subset.

Both are bugs in the source fonts, not in the subsetting — each was verified
against the untouched original. Fixing them here rather than in CSS keeps the
correction with the font, so it cannot be forgotten at a new call site.

  1. FS Mondwest's word space is 0.025 em — a SIXTH of its own period (0.077 em)
     and a fifth of a normal space. Text set in it runs together into one word:
     "AMERICANCOMPUTERPROGRAMMER". Its sibling PP Mondwest, drawn on the same
     grid by the same hand, spaces at 0.308 of its 'n' advance, which is also
     where Migra sits (0.298). We rebuild FS Mondwest's space from that ratio
     applied to its OWN 'n', so the fix follows the face's proportions instead of
     importing a number from somewhere else.

  2. PP Mondwest has no U+2013. It is the BODY face and the prose uses en-dashes,
     so each one falls through to the next family in the stack, dropping a smooth
     system-sans dash into the middle of a pixel-font sentence. Point U+2013 at
     the existing hyphen: at this resolution the two are the same mark — an
     en-dash's extra width is under one pixel of the design grid — so borrowing
     the hyphen is faithful to how the typeface draws, and it costs no bytes.

     This applies to EVERY PP Mondwest cut, not just the Regular. The Thin and
     Light weights are thinned derivatives of it and inherit the gap exactly, so
     each is passed in and patched; fixing one and shipping three would leave the
     same broken dash in body copy, which is where en-dashes actually occur.

Usage: patch.py <fs-mondwest> <pp-cut> [<pp-cut> ...]
The FIRST pp cut is the spacing reference for FS Mondwest (they share a grid and
advance widths, so any of them would give the same ratio).

Run by tools/fonts/build.sh; not useful on its own.
"""

import sys
from fontTools.ttLib import TTFont

EN_DASH = 0x2013


def load(path):
    font = TTFont(path)
    return font, font.getBestCmap(), font["head"].unitsPerEm


def glyph_for(cmap, char):
    return cmap.get(ord(char))


def fix_space(font, cmap, upm, ratio):
    """Rebuild the space advance as `ratio` of this font's own 'n'."""
    space, n = glyph_for(cmap, " "), glyph_for(cmap, "n")
    if not (space and n):
        sys.exit("no space or 'n' glyph; cannot derive a word space")
    before = font["hmtx"][space][0]
    target = round(font["hmtx"][n][0] * ratio)
    # lsb is irrelevant for a blank glyph, but hmtx wants the pair.
    font["hmtx"][space] = (target, font["hmtx"][space][1])
    print(f"  space {before} → {target} units ({target / upm:.4f} em)")


def alias_en_dash(font, cmap):
    if EN_DASH in cmap:
        print("  U+2013 already present; nothing to do")
        return
    hyphen = next(
        (n for n in ("hyphen", "hyphen-minus", "uni002D") if n in font.getGlyphOrder()),
        None,
    )
    if hyphen is None:
        sys.exit("no hyphen glyph; cannot alias U+2013")
    for table in font["cmap"].tables:  # every unicode subtable, so the mapping
        if table.isUnicode():         # holds whichever one a browser picks
            table.cmap[EN_DASH] = hyphen
    print(f"  U+2013 → {hyphen}")


fs_path, pp_paths = sys.argv[1], sys.argv[2:]
if not pp_paths:
    sys.exit("usage: patch.py <fs-mondwest> <pp-cut> [<pp-cut> ...]")

# PP Mondwest is the reference for spacing: it is the same designer's face on the
# same grid, and its ratio matches Migra's, so it is the family's own norm rather
# than an outside convention. The cuts share advance widths exactly, so the first
# one given settles the ratio for all of them.
ref, ref_cmap, ref_upm = load(pp_paths[0])
ratio = ref["hmtx"][glyph_for(ref_cmap, " ")][0] / ref["hmtx"][glyph_for(ref_cmap, "n")][0]

print(f"patch {fs_path.split('/')[-1]}")
fs, fs_cmap, fs_upm = load(fs_path)
fix_space(fs, fs_cmap, fs_upm, ratio)
fs.save(fs_path)

for i, pp_path in enumerate(pp_paths):
    note = "  (space/n ratio %.4f — the reference)" % ratio if i == 0 else ""
    print(f"patch {pp_path.split('/')[-1]}{note}")
    pp, pp_cmap, _ = load(pp_path)
    alias_en_dash(pp, pp_cmap)
    pp.save(pp_path)
