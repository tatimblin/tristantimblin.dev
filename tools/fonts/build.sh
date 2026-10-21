#!/usr/bin/env bash
# Fetch the site's self-hosted web fonts: DM Sans 400/500/700 and Roboto Mono
# 300/400/500, each as the google-fonts "latin" and "latin-ext" woff2 subsets.
#
# Both faces are OFL and served by the Google Fonts CSS API, which already
# subsets them per unicode range — so this script only asks the API for the
# CSS (with a modern UA, so it answers woff2), pulls the latin + latin-ext URLs
# out of it and saves each file as public/fonts/<Family>-<weight>-<subset>.woff2,
# which is what src/styles/fonts.css @font-face's. Committing the woff2 keeps
# the site buildable offline; re-run this only to pick up a new font release.
#
# The unicode-range each file covers is copied into fonts.css by hand — the
# API's own ranges, so a glyph outside latin-ext never asks for a file.
set -euo pipefail

OUT="$(cd "$(dirname "$0")/../.." && pwd)/public/fonts"
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"

# fetch <Family+Name> <file-prefix> <weight...>
fetch() {
	local family="$1" prefix="$2"
	shift 2
	local w css subset url
	for w in "$@"; do
		css="$(curl -fsSL -A "$UA" "https://fonts.googleapis.com/css2?family=${family}:wght@${w}&display=swap")"
		for subset in latin latin-ext; do
			# Each block is "/* <subset> */\n@font-face { ... src: url(...) ... }".
			url="$(printf '%s\n' "$css" | awk -v s="/* $subset */" '
				$0 == s { hit = 1; next }
				hit && /src: url\(/ { match($0, /url\([^)]*\)/); print substr($0, RSTART + 4, RLENGTH - 5); exit }
			')"
			[ -n "$url" ] || { echo "no $subset subset for $family $w" >&2; exit 1; }
			curl -fsSL -o "$OUT/${prefix}-${w}-${subset}.woff2" "$url"
			printf '  %-32s %8d B\n' "${prefix}-${w}-${subset}.woff2" "$(wc -c < "$OUT/${prefix}-${w}-${subset}.woff2")"
		done
	done
}

mkdir -p "$OUT"
echo "fetching web fonts → $OUT"
fetch "DM+Sans" DMSans 400 500 700
fetch "Roboto+Mono" RobotoMono 300 400 500
