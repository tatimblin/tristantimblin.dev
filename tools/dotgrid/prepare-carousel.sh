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
# Scale to 360px wide, not the source's 960+. The halftone renders at ~534px CSS
# and point-samples ONE pixel per ~4px grid cell, so it can only ever resolve
# ~130px of real detail — even 360px is still ~3x more pixels than the effect
# shows. Those extra pixels aren't free: every frame is decoded and texImage2D-
# uploaded to the GPU at full size (360x640 RGBA ≈ 0.88 MB/frame vs the old
# 540x960 ≈ 1.98 MB, and vs a 960x1706 source ≈ 6.25 MB), and that decode+upload
# bandwidth is the mobile stutter bottleneck (~2.25x less than 540px, ~7x less
# than source). We also cap output to 30fps (-r 30 below): a couple of source
# clips are 60fps, which doubles decode+upload for detail the dot grid can't show.
# 360px stays ~3x oversampled for what the grid reads, so the halftone is unchanged.
#
# We emit TWO files per clip from the same filtered frames: an H.264 .web.mp4
# (universal fallback, +faststart) and a smaller AV1 (or VP9 where SVT-AV1 is
# unavailable) .web.webm that modern browsers prefer via a <source> list. The
# dotted-grid element picks the first playable one.
#
# The chain, per clip:
#   scale 540 -> [HLG tonemap for iPhone HDR] -> atadenoise (temporal denoise:
#   kills random noise, keeps coherent light/motion) -> normalize (per-frame
#   histogram stretch to full range: restores blacks AND highlights)
#   -> luma HISTOGRAM MATCH to the reference clip (chroma-preserving, so the
#   color-reveal still has real color) -> saturation lift -> yuv420p.
#
# HISTOGRAM MATCH, not a mean target. The grid treats each frame as a value
# field — black is "nothing here", brightness is signal — so what has to be
# consistent across clips is the SHAPE of the distribution, not its average.
# The previous step multiplied luma until the MEAN hit 42, which lined up the
# averages but left every clip a different shape: most came out with their
# median sitting just under their peak (e.g. p50 0.14 / p98 0.18), so nearly
# every cell drew a near-full dot and the carousel rendered as a dense field —
# a wall of ink on the light theme. Redwoods (IMG_0360) was the one clip with
# the right shape: a dark floor and a long tail of highlights (p50 0.11 / p98
# 0.37), which is what reads as an image in the halftone. So every clip now
# gets a piecewise-linear luma curve that lands its own percentiles on
# Redwoods'. One set of grid settings then fits every clip.
#
# Usage: prepare-carousel.sh [-o out_subdir] [clip ...]
#   -o    output subdir under public/videos/website-carousel (default: web)
#   clip  basenames to process (e.g. IMG_0360); default: every clip
set -euo pipefail

SRC_DIR="public/videos/website-carousel"
OUT_SUB="web"

# The reference distribution: IMG_0360 (Redwoods) as encoded by the earlier
# mean-target recipe, the one clip whose shape reads well in the halftone.
# Raw 8-bit Y-plane values at these percentiles, sampled at 2fps over the whole
# clip — the same domain lutyuv's `val` works in. NOT format=gray: that
# converts TV range to full range on the way (Y 29 reads as 14), so measuring
# through it and correcting through lutyuv would miss by that stretch; this
# script's first draft did, and darkened every clip including Redwoods itself.
# Measured with quantiles() below on web/IMG_0360.web.mp4.
REF_PCTS="0.02 0.10 0.25 0.50 0.75 0.90 0.98"
REF_Y="10 18 27 41 64 82 100"

while getopts "o:h" opt; do
  case "$opt" in
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

# Reusable filter fragments for the per-clip overrides below.
#   HLG    — the standard HLG->SDR tonemap prefix (same as hlg_prefix() emits).
#   HLG_C15— tonemap variant with a stronger contrast lift (for flat sources).
#   POSTERn— quantize luma into N flat plateaus so neighbouring cells share a
#            tone; the shader's levels then land in fewer, BOLDER dot-size bands
#            (reads as defined light/dark blocks instead of a smooth speckle).
HLG="eq=contrast=1.18:saturation=1.25:gamma=0.92,format=yuv420p,setparams=range=tv:colorspace=bt709:color_primaries=bt709:color_trc=bt709"
HLG_C15="eq=contrast=1.5:saturation=1.25:gamma=0.92,format=yuv420p,setparams=range=tv:colorspace=bt709:color_primaries=bt709:color_trc=bt709"
POSTER6="lutyuv=y='round(val/255*5)/5*255'"   # 6 levels
POSTER4="lutyuv=y='round(val/255*3)/3*255'"   # 4 levels

# Raw Y of $1 through filter chain $2 at each of REF_PCTS, space-separated,
# sampled at 2fps over the whole clip (64px wide is plenty for a histogram).
# $SS_ARGS (set per clip) lets an override trim the input before measuring.
quantiles() {
  ffmpeg -hide_banner -loglevel error $SS_ARGS -i "$1" \
    -vf "$2,fps=2,scale=64:-2,format=yuv420p,extractplanes=y" -an -f rawvideo - \
    | od -An -tu1 -v \
    | awk -v qs="$REF_PCTS" '
        { for (i = 1; i <= NF; i++) { h[$i]++; n++ } }
        END {
          k = split(qs, q, " ")
          for (j = 1; j <= k; j++) {
            t = q[j] * n; c = 0
            for (v = 0; v < 256; v++) { c += h[v]; if (c >= t) { printf "%s%d", (j > 1 ? " " : ""), v; break } }
          }
        }'
}

# A lutyuv luma expression mapping the clip's percentiles ($1, from quantiles)
# onto REF_Y: piecewise-linear between them, anchored at 0 -> 0, and extended
# past the top percentile along the last segment's slope (clamped to 255) so
# highlights keep the reference's proportions instead of jumping to white.
# Tied source percentiles (a clip whose bottom 10% is all one black value) keep
# the FIRST — lowest — target, so a black floor stays black rather than being
# lifted into the dot field.
match_lut() {
  awk -v s="$1" -v r="$REF_Y" 'BEGIN {
    ns = split(s, S, " "); split(r, R, " ")
    n = 1; X[1] = 0; Y[1] = 0
    for (i = 1; i <= ns; i++) if (S[i] > X[n]) { n++; X[n] = S[i]; Y[n] = R[i] }
    slope = (n > 1) ? (Y[n] - Y[n-1]) / (X[n] - X[n-1]) : 1
    e = sprintf("min(255,%.4f+(val-%d)*%.4f)", Y[n], X[n], slope)
    for (k = n - 1; k >= 1; k--)
      e = sprintf("if(lt(val,%d),%.4f+(val-%d)*%.4f,%s)", X[k+1], Y[k], X[k], (Y[k+1] - Y[k]) / (X[k+1] - X[k]), e)
    print e
  }'
}

# Pick the WebM encoder once: prefer AV1 (SVT-AV1) for the best size/quality, fall
# back to VP9 where the build lacks libsvtav1. Both are widely supported by the
# browsers that get the .webm; anything older falls back to the H.264 .mp4.
if ffmpeg -hide_banner -encoders 2>/dev/null | grep -q libsvtav1; then
  WEBM_ARGS=(-c:v libsvtav1 -crf 34 -preset 6 -pix_fmt yuv420p)
  WEBM_CODEC="av1 (libsvtav1)"
else
  WEBM_ARGS=(-c:v libvpx-vp9 -crf 34 -b:v 0 -row-mt 1 -pix_fmt yuv420p)
  WEBM_CODEC="vp9 (libvpx-vp9)"
fi
echo "WebM codec: ${WEBM_CODEC}"

# Only the named clips, when any are given.
ONLY=" $* "

shopt -s nullglob nocaseglob
for in in "$SRC_DIR"/*.mov; do
  base=$(basename "$in"); base="${base%.*}"
  [ "$#" -eq 0 ] || [[ "$ONLY" == *" $base "* ]] || continue
  out="${OUT_DIR}/${base}.web.mp4"

  # Per-clip overrides: three clips can't be served by the uniform recipe (each
  # fails the halftone in a different way — verified by measurement + live A/B;
  # see docs/plans/2026-07-30-001). Each sets its own pre-darken CHAIN, and may
  # set SS_ARGS (input trim). Everything after (histogram match, saturation,
  # encode) is shared. The seals clip used to carry a brighter mean target too;
  # the histogram match now gives it the same tonal separation as every clip.
  SS_ARGS=""
  case "$base" in
    IMG_0722)  # banyan: fine branches alias into speckle. Center crop + 360px
               # AREA downscale (each pixel pre-averages sub-cell detail so the
               # grid resolves masses) + 6-level posterize for bold blocks.
      chain="crop=iw*0.6:ih*0.6,scale=360:-2:flags=area,${HLG},eq=contrast=1.3,${POSTER6},${DENOISE_STRETCH}" ;;
    IMG_1514)  # seals: flat mid-grey, no highlights. Stronger contrast + a
               # highlight curve so tones separate, then 6-level posterize for
               # defined blocks.
      chain="scale=360:-2:flags=lanczos,${HLG_C15},curves=master='0/0 0.5/0.45 0.8/0.9 1/1',${POSTER6},${DENOISE_STRETCH}" ;;
    IMG_7644)  # golf: nearly static. Trim to the swing (t6.5, 4.5s) + 4-level
               # posterize for bold snapping shapes on a low-motion subject.
      SS_ARGS="-ss 6.5 -t 4.5"
      chain="scale=360:-2:flags=lanczos,eq=contrast=1.3,${POSTER4},${DENOISE_STRETCH}" ;;
    *)         # every other clip: the uniform recipe, unchanged.
      pre=$(hlg_prefix "$in")
      chain="scale=360:-2:flags=lanczos,${pre}${DENOISE_STRETCH}" ;;
  esac

  # Match this clip's luma distribution to the reference's.
  q=$(quantiles "$in" "$chain")
  vf="${chain},lutyuv=y='$(match_lut "$q")',eq=saturation=1.4,format=yuv420p"
  echo "Encoding ${base}  (luma p[${REF_PCTS}] ${q} -> ${REF_Y}$([ -n "$SS_ARGS" ] && echo ", trimmed")$([ "$base" = IMG_0722 -o "$base" = IMG_1514 -o "$base" = IMG_7644 ] && echo ", override"))"
  ffmpeg -hide_banner -loglevel error -y $SS_ARGS -i "$in" -vf "$vf" -an \
    -c:v libx264 -profile:v high -pix_fmt yuv420p -crf 26 -preset slow -r 30 \
    -colorspace bt709 -color_primaries bt709 -color_trc bt709 \
    -movflags +faststart "$out"

  # Second pass: same filtered frames -> a smaller AV1/VP9 .web.webm that modern
  # browsers prefer. No +faststart (WebM streams progressively without it).
  webm="${OUT_DIR}/${base}.web.webm"
  ffmpeg -hide_banner -loglevel error -y $SS_ARGS -i "$in" -vf "$vf" -an \
    "${WEBM_ARGS[@]}" -r 30 \
    -colorspace bt709 -color_primaries bt709 -color_trc bt709 "$webm"
done

echo "Done -> ${OUT_DIR}"
