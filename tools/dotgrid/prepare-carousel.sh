#!/usr/bin/env bash
#
# prepare-carousel.sh — batch-optimize the website-carousel clips for the
# <dotted-grid> halftone, tuned specifically for the DOT EFFECT (not for the
# video looking good on its own).
#
# Why this differs from prepare-video.sh's plain -n normalize: the shader reads
# only LUMINANCE and point-samples ONE pixel per grid cell (no area averaging).
# So a good halftone needs (a) the full black->white tonal range present, so
# every discrete dot level is reachable, and (b) sub-cell noise (sensor grain,
# compression mush) removed, or it aliases into random dot noise. Plain -n
# matched only the MEAN brightness — it left highlights crushed (dots never
# reached the top levels) and did nothing about noise. Measured dot "punch"
# (YHIGH-YLOW spread) was 17-40 on the weak clips; this chain lifts it to 90+.
#
# Denoise on the TIME axis, not space. An earlier version used smartblur (a
# SPATIAL smoother). It removed noise but also flattened fine dynamic detail —
# light shimmering through wind-blown branches, water sparkle — because that
# detail is spatially fine too, so a spatial blur can't tell it from noise.
# atadenoise averages each pixel against its own past/future frames instead:
# random noise is temporally incoherent and cancels out, while shimmer/motion is
# temporally COHERENT and survives. Measured: ~+40% more frame-to-frame activity
# preserved than smartblur, and noise-heavy clips came out cleaner, not worse.
#
# The chain, per clip:
#   scale 960 -> [HLG tonemap for iPhone HDR] -> atadenoise (temporal denoise:
#   kills random noise, keeps coherent light/motion) -> normalize (per-frame
#   histogram stretch to full range: restores blacks AND highlights)
#   -> lutyuv luma darkening bisected to a DARK mean target (chroma-preserving,
#   so the color-reveal still has real color) -> saturation lift -> yuv420p.
#
# The dark mean-target (not a fixed curve) is what keeps a big-sky clip dark
# while leaving a mostly-dark clip's small highlights intact — a dark canvas
# with highlights punching through, consistent across all clips.
#
# Usage: prepare-carousel.sh [-t target_luma] [-o out_subdir]
#   -t  dark mean-luma target for the halftone (default 42)
#   -o  output subdir under public/videos/website-carousel (default: web)
set -euo pipefail

SRC_DIR="public/videos/website-carousel"
OUT_SUB="web"
TARGET=42
SAMPLE_FRAMES=40

while getopts "t:o:h" opt; do
  case "$opt" in
    t) TARGET="$OPTARG" ;;
    o) OUT_SUB="$OPTARG" ;;
    h) grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option; -h for usage." >&2; exit 2 ;;
  esac
done

command -v ffmpeg  >/dev/null || { echo "ffmpeg not found." >&2; exit 1; }
command -v ffprobe >/dev/null || { echo "ffprobe not found." >&2; exit 1; }

OUT_DIR="${SRC_DIR}/${OUT_SUB}"
mkdir -p "$OUT_DIR"

# iPhone HLG (BT.2020, arib-std-b67) needs the HDR->SDR contrast/saturation
# approximation + BT.709 retag before anything else, exactly as prepare-video.sh
# does with -t. bt709 sources skip it. We detect per file via color_transfer.
hlg_prefix() {
  local trc
  trc=$(ffprobe -v error -select_streams v:0 \
    -show_entries stream=color_transfer -of default=nk=1:nw=1 "$1")
  if [ "$trc" = "arib-std-b67" ] || [ "$trc" = "smpte2084" ]; then
    printf '%s' "eq=contrast=1.18:saturation=1.25:gamma=0.92,format=yuv420p,setparams=range=tv:colorspace=bt709:color_primaries=bt709:color_trc=bt709,"
  fi
}

# Temporal denoise + full-range stretch. This is the fixed part of the chain
# that runs before the (bisected) luma darkening. atadenoise is purely temporal
# (averages a window of frames per pixel), so it removes random noise while
# preserving coherent light/motion — see the header note on why this replaced
# the earlier spatial smartblur.
DENOISE_STRETCH="atadenoise=0a=0.02:0b=0.04:1a=0.02:1b=0.04:s=9,normalize=independence=0:strength=0.7"

# Mean luma (0-255) of $1 through filter chain $2, sampled over SAMPLE_FRAMES.
measure() {
  ffmpeg -hide_banner -loglevel info -i "$1" \
    -vf "$2,signalstats,metadata=print:key=lavfi.signalstats.YAVG" \
    -frames:v "$SAMPLE_FRAMES" -an -f null - 2>&1 \
    | sed -n 's/.*YAVG=\([0-9.]*\).*/\1/p' \
    | awk '{s+=$1;n++} END{if(n) printf "%.2f", s/n; else print "0"}'
}

shopt -s nullglob nocaseglob
for in in "$SRC_DIR"/*.mov; do
  base=$(basename "$in"); base="${base%.*}"
  out="${OUT_DIR}/${base}.web.mp4"

  pre=$(hlg_prefix "$in")
  chain="scale=960:-2:flags=lanczos,${pre}${DENOISE_STRETCH}"

  # Bisection on the luma multiply to hit the dark TARGET after the stretch.
  lo=0.05; hi=1.0; scale=1.0
  for i in $(seq 1 7); do
    scale=$(awk "BEGIN{printf \"%.4f\", ($lo+$hi)/2}")
    m=$(measure "$in" "${chain},lutyuv=y=val*${scale}")
    if awk "BEGIN{exit !(${m} > ${TARGET})}"; then hi=$scale; else lo=$scale; fi
  done

  vf="${chain},lutyuv=y=val*${scale},eq=saturation=1.4,format=yuv420p"
  echo "Encoding ${base}  (hlg=$([ -n "$pre" ] && echo yes || echo no), y-scale=${scale} -> mean~${TARGET})"
  ffmpeg -hide_banner -loglevel error -y -i "$in" -vf "$vf" -an \
    -c:v libx264 -profile:v high -pix_fmt yuv420p -crf 26 -preset slow \
    -colorspace bt709 -color_primaries bt709 -color_trc bt709 \
    -movflags +faststart "$out"
done

echo "Done -> ${OUT_DIR}"
