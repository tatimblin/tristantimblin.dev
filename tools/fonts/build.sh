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
SRC_PP_MONDWEST="$ASSETS/Bitmap Font Pack - Free for Personal Use/PPMondwest-Regular.otf"  # PP Mondwest 400
# PP Mondwest Thin (200) and Light (300) — the BODY cuts. Not vendor files: they are
# algorithmically thinned from the Regular above (see mondwest-pixel/README.md), which
# is why they come from a different directory. Weight in a bitmap face is how many grid
# pixels wide a stem is, so they were thinned in BITMAP space — 2 px stems down to 1.5 px
# (Light) and 1 px (Thin) — not by outline offsetting, which would have landed strokes
# between pixels and destroyed the crispness that is the whole point of the design.
# Drop-in by construction, and verified so: identical upm, cap height, x-height and
# advance widths to the Regular. That is what lets all three share ONE size-adjust and
# ONE metric-matched fallback in fonts.css, and it means the same text sets to exactly
# the same line length whichever cut renders it.
PPX="$ASSETS/mondwest-pixel/otf"
SRC_PP_MONDWEST_THIN="$PPX/MondwestPixel-Thin.otf"    # 200 — available, no role yet
SRC_PP_MONDWEST_LIGHT="$PPX/MondwestPixel-Light.otf"  # 300 — body text
# PP Neue Montreal — UI text (widget labels and figures, the masthead's marks). TWO
# cuts under one family, like Migra: the browser then matches by font-weight and
# never synthesises. Regular carries the labels and figures; Semibold is what the
# newsroom masthead's marks (/txt) ask for.
# The OTFs are from Pangram Pangram's own pack, NOT the woff2 that floats around on
# the font-mirror sites: that file reports itself as usWeightClass 700 "Bold" at
# version 2.600 with 743 glyphs, i.e. a different cut of a different release from
# what it is named after. Same rule as the four above — subset the vendor original.
NM="$ASSETS/PP Neue Montreal - Free for Personal Use v3.0/otf"
SRC_NEUE_MONTREAL_REGULAR="$NM/PPNeueMontreal-Regular.otf"    # 400 — UI text
SRC_NEUE_MONTREAL_SEMIBOLD="$NM/PPNeueMontreal-Semibold.otf"  # 600 — masthead marks (/txt)

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
subset "$SRC_PP_MONDWEST_THIN"  ppmondwest-thin.woff2
subset "$SRC_PP_MONDWEST_LIGHT" ppmondwest-light.woff2
subset "$SRC_NEUE_MONTREAL_REGULAR"  neue-montreal-regular.woff2
subset "$SRC_NEUE_MONTREAL_SEMIBOLD" neue-montreal-semibold.woff2

# Repair two defects in the vendor Mondwest files: FS Mondwest's collapsed word
# space and PP Mondwest's missing en-dash. Both are bugs in the sources, verified
# against the untouched originals — see the script for the reasoning.
# ALL THREE PP cuts are passed: the thinned weights are derived from the Regular, so
# they inherit its missing U+2013 exactly (verified — none of the three has the
# codepoint). Patching only the Regular would leave an en-dash in body copy falling
# through to the system sans, which is the very bug this repairs, just at weight 300.
uvx --from "fonttools[woff]" python "$(dirname "$0")/patch.py" \
	"$OUT/fs-mondwest-bold.woff2" \
	"$OUT/ppmondwest-regular.woff2" \
	"$OUT/ppmondwest-thin.woff2" \
	"$OUT/ppmondwest-light.woff2"
printf '  %-28s %8d B (patched)\n' fs-mondwest-bold.woff2 "$(wc -c < "$OUT/fs-mondwest-bold.woff2")"
