#!/usr/bin/env bash
# Build the site's self-hosted web fonts.
#
# Sources are the vendor-supplied desktop files (NOT in this repo — they live in
# ~/Documents/assets/, see SRC_* below). Each is subset to the latin range and
# re-emitted as woff2 into public/fonts/, which is what src/styles/fonts.css
# @font-face's. Committing the built woff2 keeps the site buildable without the
# originals; re-run this only when a source face is replaced.
#
# Subsetting is not a nicety here: fs-mondwest-bold.ttf ships at 1.0 MB (it
# carries a full kana/CJK set the site never renders) and comes out at ~7 KB.
#
# Requires `uv` (https://docs.astral.sh/uv/) — uvx fetches fonttools on demand,
# so there is nothing to install.
set -euo pipefail

ASSETS="${ASSETS:-$HOME/Documents/assets}"
OUT="$(cd "$(dirname "$0")/../.." && pwd)/public/fonts"

# Subset from the .ttf/.otf originals rather than any vendor-supplied .woff2, so
# all four faces come off one pipeline with one coverage definition.
SRC_MIGRA_BOLD="$ASSETS/migra.ttf"                                           # Migra Bold 700   — hero
SRC_MIGRA_MEDIUM="$ASSETS/migra-3.ttf"                                       # Migra Medium 500 — headings
SRC_FS_MONDWEST="$ASSETS/fs-mondwest-bold.ttf/fs-mondwest-bold.ttf"          # FS Mondwest Bold — sub-headings
SRC_PP_MONDWEST="$ASSETS/Bitmap Font Pack - Free for Personal Use/PPMondwest-Regular.otf"  # PP Mondwest — body
# PP Neue Montreal Light — UI text (widget labels/figures, the ruler's year marks).
# The OTF from Pangram Pangram's own pack, NOT the woff2 that floats around on the
# font-mirror sites: that file reports itself as usWeightClass 700 "Bold" at version
# 2.600 with 743 glyphs, i.e. a different cut of a different release from the Light
# this line names. Same rule as the four above — subset the vendor original.
SRC_NEUE_MONTREAL="$ASSETS/PP Neue Montreal - Free for Personal Use v3.0/otf/PPNeueMontreal-Light.otf"

# The google-fonts "latin" subset definition: ASCII + Latin-1, the OE/ij
# ligatures, spacing modifiers, general punctuation (curly quotes, en/em dashes,
# ellipsis), currency and the few math/arrow glyphs prose reaches for.
LATIN="U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,\
U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD"

subset() {
	local src="$1" out="$2"
	[ -f "$src" ] || { echo "missing source: $src" >&2; exit 1; }
	uvx --from "fonttools[woff]" pyftsubset "$src" \
		--unicodes="$LATIN" \
		--layout-features='*' \
		--flavor=woff2 \
		--output-file="$OUT/$out"
	printf '  %-28s %8d B\n' "$out" "$(wc -c < "$OUT/$out")"
}

mkdir -p "$OUT"
echo "building web fonts → $OUT"
subset "$SRC_MIGRA_BOLD"   migra-bold.woff2
subset "$SRC_MIGRA_MEDIUM" migra-medium.woff2
subset "$SRC_FS_MONDWEST"  fs-mondwest-bold.woff2
subset "$SRC_PP_MONDWEST"  ppmondwest-regular.woff2
subset "$SRC_NEUE_MONTREAL" neue-montreal-light.woff2

# Repair two defects in the vendor Mondwest files: FS Mondwest's collapsed word
# space and PP Mondwest's missing en-dash. Both are bugs in the sources, verified
# against the untouched originals — see the script for the reasoning.
uvx --from "fonttools[woff]" python "$(dirname "$0")/patch.py" \
	"$OUT/fs-mondwest-bold.woff2" "$OUT/ppmondwest-regular.woff2"
printf '  %-28s %8d B (patched)\n' fs-mondwest-bold.woff2 "$(wc -c < "$OUT/fs-mondwest-bold.woff2")"
