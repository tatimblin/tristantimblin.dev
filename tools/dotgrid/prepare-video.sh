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
# Handles two source kinds:
#   * Web/SDR sources (e.g. fabric.mp4): straight scale + re-encode.
#   * Raw iPhone footage (HEVC 10-bit, HLG/BT.2020 HDR, rotated): pass -t to
#     approximate an HDR->SDR conversion and tag the output BT.709. iPhone HDR
#     transcoded as-is looks washed-out/grey; -t restores contrast/saturation.
#     Rotation metadata is applied automatically by ffmpeg, so portrait clips
#     come out upright without extra flags.
#
# Brightness normalization (-n): the halftone look is best when the source is
# mostly dark with bright highlights punching through. fabric.mp4 (mean luma
# ~23/255) is a deliberately dark one-off and is left as-is (never run with -n).
# Periodic iPhone additions are normalized a little brighter than fabric so they
# read with more midtone dots while still avoiding the blob-merging a raw bright
# clip (e.g. a sunset beach at ~113/255) produces. -n measures the source's mean
# luma and darkens it with a gamma curve until it matches the target (-m, default
# 35), so any bright upload self-corrects. The gamma is found by bisection on the
# actual measured output (the curve is convex, so a closed-form estimate
# undershoots). Pass -m to aim darker (toward fabric's 23) or brighter.
#
# Usage:
#   prepare-video.sh [-i in] [-o out] [-w width] [-f fps] [-q crf] [-t] [-n] [-m luma]
#
#   -i  input file      (default: public/videos/fabric.mp4)
#   -o  output file     (default: public/videos/fabric.web.mp4)
#   -w  target width    (default: 960; height auto to preserve aspect)
#   -f  frame rate      (default: 0 = keep source fps)
#   -q  H.264 CRF       (default: 26; lower = higher quality/larger file)
#   -t  tonemap HDR     (HLG/BT.2020 -> BT.709 SDR contrast/saturation correction)
#   -n  normalize luma  (darken to the target mean brightness for the dot look)
#   -m  target luma     (mean luma 0-255 for -n; default 35 — a touch brighter
#                        than fabric.mp4's 23, which is a dark one-off left as-is)
#
# Examples:
#   prepare-video.sh                                                 # fabric (SDR)
#   prepare-video.sh -w 640 -q 28                                    # smaller/lighter
#   prepare-video.sh -i public/videos/IMG_0697.MOV \
#     -o public/videos/beach.web.mp4 -t -n                           # iPhone HDR, matched
#
# HDR note: the proper HLG->SDR chain wants zscale (libzimg) or libplacebo. This
# ffmpeg build has neither, so -t approximates the tonemap with an eq contrast/
# saturation/gamma curve tuned on HLG iPhone footage. Good enough for a halftone
# hero (the shader only reads luminance); revisit if a zscale build is available.
#
# A WebM/AV1 companion (better compression) could be added later with a second
# ffmpeg pass; not built here to keep this single-format.
set -euo pipefail

IN="public/videos/fabric.mp4"
OUT="public/videos/fabric.web.mp4"
WIDTH=960
FPS=0
CRF=26
TONEMAP=0
NORMALIZE=0
TARGET_LUMA=35
SAMPLE_FRAMES=40 # frames sampled when measuring mean luma

while getopts "i:o:w:f:q:tnm:h" opt; do
  case "$opt" in
    i) IN="$OPTARG" ;;
    o) OUT="$OPTARG" ;;
    w) WIDTH="$OPTARG" ;;
    f) FPS="$OPTARG" ;;
    q) CRF="$OPTARG" ;;
    t) TONEMAP=1 ;;
    n) NORMALIZE=1 ;;
    m) TARGET_LUMA="$OPTARG" ;;
    h) grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option; run with -h for usage." >&2; exit 2 ;;
  esac
done

command -v ffmpeg  >/dev/null || { echo "ffmpeg not found on PATH." >&2; exit 1; }
command -v ffprobe >/dev/null || { echo "ffprobe not found on PATH." >&2; exit 1; }
[ -f "$IN" ] || { echo "Input not found: $IN" >&2; exit 1; }

# Mean luma (0-255) of the input after applying a given filter chain. Samples a
# handful of frames via signalstats' YAVG; used to drive -n normalization.
measure_luma() {
  local vf="$1"
  ffmpeg -hide_banner -loglevel info -i "$IN" \
    -vf "${vf},signalstats,metadata=print:key=lavfi.signalstats.YAVG" \
    -frames:v "$SAMPLE_FRAMES" -an -f null - 2>&1 \
    | sed -n 's/.*YAVG=\([0-9.]*\).*/\1/p' \
    | awk '{s+=$1; n++} END{if(n) printf "%.2f", s/n; else print "0"}'
}

# scale=WIDTH:-2 keeps aspect ratio and forces an even height (required by the
# yuv420p pixel format for maximum browser compatibility).
VF="scale=${WIDTH}:-2:flags=lanczos"

# HDR approximation: lift contrast/saturation to counter the flat HLG-as-SDR
# look, then rewrite the frame-level color tags to BT.709 so browsers treat the
# (already-corrected) pixels as plain SDR and don't re-apply an HLG curve.
# setparams is used rather than the -color_* output flags because those pass the
# source HLG/BT.2020 tags through unchanged for this input.
OUT_COLOR=()
if [ "$TONEMAP" -eq 1 ]; then
  VF="${VF},eq=contrast=1.18:saturation=1.25:gamma=0.92,format=yuv420p"
  VF="${VF},setparams=range=tv:colorspace=bt709:color_primaries=bt709:color_trc=bt709"
  OUT_COLOR=(-colorspace bt709 -color_primaries bt709 -color_trc bt709)
fi

# Brightness normalization: bisect the eq gamma (lower = darker) until the mean
# luma of the full chain lands within tolerance of the target. Monotonic in
# gamma, so a handful of steps converge. The winning gamma is appended to VF.
if [ "$NORMALIZE" -eq 1 ]; then
  src_luma=$(measure_luma "$VF")
  echo "Normalizing: source mean luma ${src_luma} -> target ${TARGET_LUMA}"
  if awk "BEGIN{exit !(${src_luma} > ${TARGET_LUMA} + 2)}"; then
    lo=0.05; hi=1.0; gamma=1.0
    for i in $(seq 1 7); do
      gamma=$(awk "BEGIN{printf \"%.4f\", ($lo + $hi) / 2}")
      m=$(measure_luma "${VF},eq=gamma=${gamma}")
      echo "  step $i: gamma=${gamma} -> luma=${m}"
      # Too bright: darken more (lower gamma). Too dark: lighten (raise gamma).
      if awk "BEGIN{exit !(${m} > ${TARGET_LUMA})}"; then
        hi=$gamma
      else
        lo=$gamma
      fi
    done
    VF="${VF},eq=gamma=${gamma}"
  else
    echo "  source already at/below target; no darkening applied."
  fi
fi

# Only add an fps filter when a rate was explicitly requested (-f > 0).
if [ "$FPS" -gt 0 ] 2>/dev/null; then
  VF="fps=${FPS},${VF}"
fi

echo "Encoding $IN -> $OUT (width=${WIDTH}, crf=${CRF}, fps=$([ "$FPS" -gt 0 ] && echo "$FPS" || echo "source"), tonemap=$([ "$TONEMAP" -eq 1 ] && echo "on" || echo "off"), normalize=$([ "$NORMALIZE" -eq 1 ] && echo "on" || echo "off"))"

ffmpeg -hide_banner -loglevel error -y \
  -i "$IN" \
  -vf "$VF" \
  -an \
  -c:v libx264 -profile:v high -pix_fmt yuv420p \
  -crf "$CRF" -preset slow \
  "${OUT_COLOR[@]}" \
  -movflags +faststart \
  "$OUT"

# Report before/after size and the resulting stream summary.
in_size=$(du -h "$IN"  | cut -f1)
out_size=$(du -h "$OUT" | cut -f1)
echo ""
echo "Done. Source: ${in_size}  ->  Optimized: ${out_size}"
echo "Output stream:"
ffprobe -v error \
  -show_entries stream=codec_name,width,height,r_frame_rate,pix_fmt,color_transfer \
  -show_entries format=duration,size \
  -of default=noprint_wrappers=1 "$OUT"
