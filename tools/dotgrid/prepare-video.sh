#!/usr/bin/env bash
#
# prepare-video.sh — optimize a source video for the <dotted-grid> web hero.
#
# The dotted-grid effect samples the video as a WebGL texture, so the source
# only needs to be "web clean": scaled down, audio stripped, and fast-start so
# it autoplays instantly. Color is preserved on purpose — luminance is computed
# in the shader, and a future "restore original color inside the dot" feature
# needs the color data intact. This never mutates the input; it writes a new
# optimized file, so it is safe to re-run.
#
# Usage:
#   tools/dotgrid/prepare-video.sh [-i in] [-o out] [-w width] [-f fps] [-q crf]
#
#   -i  input file    (default: public/videos/fabric.mp4)
#   -o  output file   (default: public/videos/fabric.web.mp4)
#   -w  target width  (default: 960; height auto to preserve aspect)
#   -f  frame rate    (default: 0 = keep source fps)
#   -q  H.264 CRF     (default: 26; lower = higher quality/larger file)
#
# Examples:
#   tools/dotgrid/prepare-video.sh                 # defaults
#   tools/dotgrid/prepare-video.sh -w 640 -q 28    # smaller/lighter
#
# A WebM/AV1 companion (better compression) could be added later with a second
# ffmpeg pass writing fabric.web.webm; not built here to keep this single-format.
set -euo pipefail

IN="public/videos/fabric.mp4"
OUT="public/videos/fabric.web.mp4"
WIDTH=960
FPS=0
CRF=26

while getopts "i:o:w:f:q:h" opt; do
  case "$opt" in
    i) IN="$OPTARG" ;;
    o) OUT="$OPTARG" ;;
    w) WIDTH="$OPTARG" ;;
    f) FPS="$OPTARG" ;;
    q) CRF="$OPTARG" ;;
    h) grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option; run with -h for usage." >&2; exit 2 ;;
  esac
done

command -v ffmpeg  >/dev/null || { echo "ffmpeg not found on PATH." >&2; exit 1; }
command -v ffprobe >/dev/null || { echo "ffprobe not found on PATH." >&2; exit 1; }
[ -f "$IN" ] || { echo "Input not found: $IN" >&2; exit 1; }

# scale=WIDTH:-2 keeps aspect ratio and forces an even height (required by the
# yuv420p pixel format for maximum browser compatibility).
VF="scale=${WIDTH}:-2:flags=lanczos"
# Only add an fps filter when a rate was explicitly requested (-f > 0).
if [ "$FPS" -gt 0 ] 2>/dev/null; then
  VF="fps=${FPS},${VF}"
fi

echo "Encoding $IN -> $OUT (width=${WIDTH}, crf=${CRF}, fps=$([ "$FPS" -gt 0 ] && echo "$FPS" || echo "source"))"

ffmpeg -hide_banner -loglevel error -y \
  -i "$IN" \
  -vf "$VF" \
  -an \
  -c:v libx264 -profile:v high -pix_fmt yuv420p \
  -crf "$CRF" -preset slow \
  -movflags +faststart \
  "$OUT"

# Report before/after size and the resulting stream summary.
in_size=$(du -h "$IN"  | cut -f1)
out_size=$(du -h "$OUT" | cut -f1)
echo ""
echo "Done. Source: ${in_size}  ->  Optimized: ${out_size}"
echo "Output stream:"
ffprobe -v error \
  -show_entries stream=codec_name,width,height,r_frame_rate,pix_fmt \
  -show_entries format=duration,size \
  -of default=noprint_wrappers=1 "$OUT"
