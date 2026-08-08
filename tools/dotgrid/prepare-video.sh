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
# Output size matters more than it looks: every frame is decoded and uploaded
# to the GPU (texImage2D) at full resolution EACH frame, and the shader point-
# samples ONE pixel per grid cell — so pixels beyond ~(clientWidth / cell-size)
# columns are decoded, uploaded, and thrown away. The hero renders ~cell-size 6
# across a ≤1440px column, so it can only ever resolve ~240 columns; a 480px
# source is already ~2x oversampled. The default width is therefore 480 (was
# 960): ~4x less decode+upload bandwidth for a halftone that looks identical.
# See prepare-carousel.sh's header for the same reasoning at 360px.
#
# Two files are emitted from the same filtered frames: the H.264 .web.mp4
# (universal fallback, +faststart) and a smaller AV1 (or VP9 where SVT-AV1 is
# unavailable) .web.webm that modern browsers prefer. The <dotted-grid> element
# is pointed at both via src (mp4) + src-webm (webm) and picks the first playable
# one. Pass -W 0 to skip the WebM pass (mp4 only).
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
# luma and darkens it until it matches the target (-m, default 35), so any bright
# upload self-corrects. Darkening scales luma in YUV (chroma-preserving) rather
# than a gamma curve so color survives for the dot color-reveal; the scale is
# found by bisection on the measured output. Pass -m to aim darker (toward
# fabric's 23) or brighter.
#
# Usage:
#   prepare-video.sh [-i in] [-o out] [-w width] [-f fps] [-q crf] [-W webmcrf] [-t] [-n] [-m luma]
#
#   -i  input file      (default: public/videos/fabric.mp4)
#   -o  output file     (default: public/videos/fabric.web.mp4; the WebM
#                        companion is the same path with a .webm extension)
#   -w  target width    (default: 480; height auto to preserve aspect)
#   -f  frame rate      (default: 0 = keep source fps)
#   -q  H.264 CRF       (default: 26; lower = higher quality/larger file)
#   -W  WebM CRF        (default: 34; 0 disables the WebM companion, mp4 only)
#   -t  tonemap HDR     (HLG/BT.2020 -> BT.709 SDR contrast/saturation correction)
#   -n  normalize luma  (darken to the target mean brightness for the dot look)
#   -m  target luma     (mean luma 0-255 for -n; default 35 — a touch brighter
#                        than fabric.mp4's 23, which is a dark one-off left as-is)
#
# Examples:
#   prepare-video.sh                                                 # fabric (SDR)
#   prepare-video.sh -w 640 -q 28                                    # smaller/lighter
#   prepare-video.sh -i public/videos/beach.web.mp4 \
#     -o public/videos/beach.web.mp4 -w 480                          # re-encode in place
#   prepare-video.sh -i public/videos/IMG_0697.MOV \
#     -o public/videos/beach.web.mp4 -t -n                           # iPhone HDR, matched
#
# HDR note: the proper HLG->SDR chain wants zscale (libzimg) or libplacebo. This
# ffmpeg build has neither, so -t approximates the tonemap with an eq contrast/
# saturation/gamma curve tuned on HLG iPhone footage. Good enough for a halftone
# hero (the shader only reads luminance); revisit if a zscale build is available.
set -euo pipefail

IN="public/videos/fabric.mp4"
OUT="public/videos/fabric.web.mp4"
WIDTH=480
FPS=0
CRF=26
WEBM_CRF=34
TONEMAP=0
NORMALIZE=0
TARGET_LUMA=35
SAMPLE_FRAMES=40 # frames sampled when measuring mean luma

while getopts "i:o:w:f:q:W:tnm:h" opt; do
  case "$opt" in
    i) IN="$OPTARG" ;;
    o) OUT="$OPTARG" ;;
    w) WIDTH="$OPTARG" ;;
    f) FPS="$OPTARG" ;;
    q) CRF="$OPTARG" ;;
    W) WEBM_CRF="$OPTARG" ;;
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

# Brightness normalization: darken toward the target mean luma while keeping
# color intact. We scale luma multiplicatively in YUV (lutyuv=y=val*k, which
# leaves the U/V chroma planes untouched) rather than gamma-crushing in RGB.
# eq=gamma pushes each pixel's weaker channels toward zero, which desaturates a
# bright clip to near-grey as it darkens (the dots then have no color to reveal);
# lutyuv preserves hue, so the halftone color-reveal still shows real color.
# A saturation lift counters the perceptual desaturation of a darker image.
# k is found by bisection on the actual measured output (linear in k, so a few
# steps converge); the winning scale + SAT_BOOST are appended to VF.
SAT_BOOST=1.5 # saturation multiplier applied with the luma scale
if [ "$NORMALIZE" -eq 1 ]; then
  src_luma=$(measure_luma "$VF")
  echo "Normalizing: source mean luma ${src_luma} -> target ${TARGET_LUMA} (chroma-preserving)"
  if awk "BEGIN{exit !(${src_luma} > ${TARGET_LUMA} + 2)}"; then
    lo=0.05; hi=1.0; scale=1.0
    for i in $(seq 1 7); do
      scale=$(awk "BEGIN{printf \"%.4f\", ($lo + $hi) / 2}")
      m=$(measure_luma "${VF},lutyuv=y=val*${scale}")
      echo "  step $i: y-scale=${scale} -> luma=${m}"
      # Too bright: scale down more. Too dark: scale up.
      if awk "BEGIN{exit !(${m} > ${TARGET_LUMA})}"; then
        hi=$scale
      else
        lo=$scale
      fi
    done
    VF="${VF},lutyuv=y=val*${scale},eq=saturation=${SAT_BOOST}"
  else
    echo "  source already at/below target; no darkening applied."
  fi
fi

# Only add an fps filter when a rate was explicitly requested (-f > 0).
if [ "$FPS" -gt 0 ] 2>/dev/null; then
  VF="fps=${FPS},${VF}"
fi

echo "Encoding $IN -> $OUT (width=${WIDTH}, crf=${CRF}, fps=$([ "$FPS" -gt 0 ] && echo "$FPS" || echo "source"), tonemap=$([ "$TONEMAP" -eq 1 ] && echo "on" || echo "off"), normalize=$([ "$NORMALIZE" -eq 1 ] && echo "on" || echo "off"))"

# Re-encoding in place (IN == OUT, e.g. downscaling an existing .web.mp4) would
# have ffmpeg -y clobber the input mid-read. Write to a temp and move on success.
mp4_target="$OUT"
same_path=0
if [ -e "$IN" ] && [ "$IN" -ef "$OUT" ] 2>/dev/null; then
  same_path=1
  mp4_target="${OUT}.tmp.mp4"
fi

ffmpeg -hide_banner -loglevel error -y \
  -i "$IN" \
  -vf "$VF" \
  -an \
  -c:v libx264 -profile:v high -pix_fmt yuv420p \
  -crf "$CRF" -preset slow \
  ${OUT_COLOR[@]+"${OUT_COLOR[@]}"} \
  -movflags +faststart \
  "$mp4_target"

# WebM companion (AV1 via SVT-AV1, else VP9) from the same filter chain. Modern
# browsers prefer it via src-webm; -W 0 skips it. Read from the just-written mp4
# so an in-place re-encode doesn't re-read a now-replaced input, and so the WebM
# is derived from identical (already-filtered) frames — a plain transcode, so no
# -vf here beyond the format the encoder needs.
webm_out=""
if [ "$WEBM_CRF" -gt 0 ] 2>/dev/null; then
  webm_out="${OUT%.*}.webm"
  if ffmpeg -hide_banner -encoders 2>/dev/null | grep -q libsvtav1; then
    webm_args=(-c:v libsvtav1 -crf "$WEBM_CRF" -preset 6 -pix_fmt yuv420p)
    webm_codec="av1 (libsvtav1)"
  else
    webm_args=(-c:v libvpx-vp9 -crf "$WEBM_CRF" -b:v 0 -row-mt 1 -pix_fmt yuv420p)
    webm_codec="vp9 (libvpx-vp9)"
  fi
  echo "Encoding WebM companion -> ${webm_out} (${webm_codec}, crf=${WEBM_CRF})"
  ffmpeg -hide_banner -loglevel error -y \
    -i "$mp4_target" \
    -an \
    "${webm_args[@]}" \
    ${OUT_COLOR[@]+"${OUT_COLOR[@]}"} \
    "$webm_out"
fi

# Move the in-place temp into its final name now that all reads are done.
if [ "$same_path" -eq 1 ]; then
  mv -f "$mp4_target" "$OUT"
fi

# Report before/after size and the resulting stream summary.
in_size=$(du -h "$IN"  | cut -f1)
out_size=$(du -h "$OUT" | cut -f1)
echo ""
echo "Done. Source: ${in_size}  ->  Optimized: ${out_size}$([ -n "$webm_out" ] && echo "  (webm: $(du -h "$webm_out" | cut -f1))")"
echo "Output stream:"
ffprobe -v error \
  -show_entries stream=codec_name,width,height,r_frame_rate,pix_fmt,color_transfer \
  -show_entries format=duration,size \
  -of default=noprint_wrappers=1 "$OUT"
