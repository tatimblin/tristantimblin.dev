# How to add a widget

A homepage card is a `<Widget>` (markup, rendered at build time) plus, if it
does anything in the browser, one script: `src/widgets/<name>/client.ts`. The
runtime here (`widgets.ts`, `activity.ts`, `frame.ts`) decides when that script
loads and mounts, and keeps it from costing anything while nobody is looking.

## The pattern

1. **Markup.** `src/widgets/<name>/<Name>.astro` renders the card, readable
   before (and without) any script:

   ```astro
   <Widget size="1x1" title="github" name="github" class:list={["wx-github", className]} {...rest}>
     <CardBody>…</CardBody>
   </Widget>
   ```

   No `<script>` in the component. Data the script needs goes in the markup
   (`data-*`, or a `<script type="application/json">`).

2. **Script.** `src/widgets/<name>/client.ts` exports `mount`:

   ```ts
   import type { WidgetContext } from "@whois/design-system/lib/widgets";

   export function mount(el: HTMLElement, ctx: WidgetContext) {
     const button = el.querySelector("button")!;
     button.addEventListener("click", flip, { signal: ctx.signal });
     ctx.whileActive(() => ctx.frame(tick)); // continuous work: only while active
     return () => {}; // optional: undo what the signal can't
   }
   ```

   That's all. `src/widgets/index.ts` finds every `*/client.ts` with
   `import.meta.glob`, so there is nothing to register; each is its own chunk,
   `widget-<name>` (astro.config.mjs names them). The `name` prop must be
   the directory's name. A page that shows widgets imports the registry once
   in a `<script>` (`import "../widgets";`, as `src/pages/index.astro` does).

## The contract

`mount(el, ctx)` runs once per page load for its card (the first load and
after every view-transition navigation; never twice for one card). It may
return a destroy, which runs before the next swap. `ctx`:

- **`ctx.signal`** — aborted on teardown. Pass it to every `addEventListener`
  and anything else that takes one; then most widgets need no destroy at all.
- **`ctx.frame(fn, { phase, fps })`** — a per-frame callback on the page's one
  rAF (`frame.ts`). `fn(time, delta)` returns `false` (or call the returned
  stop) to end it; it also ends with the card. Measure in `phase: "read"`,
  mutate in `"write"` (the default): every read in a frame runs before any
  write, so no widget forces a layout another dirtied. `fps` caps it. A
  callback that throws is dropped and reported; the others keep running.
- **`ctx.activity`** — `visible` (within a quarter screen of the viewport),
  `active` (and the tab visible), `animate` (and motion allowed);
  `.subscribe(fn)` for changes. Everything starts false.
- **`ctx.whileActive(start, { when })`** — runs `start` each time the card
  becomes active (`when: "animate"`: active with motion allowed) and the stop
  it returns each time it stops being so, and on teardown. Put every loop,
  timer, clock and playing video here.

## Load modes (`<Widget load>`)

- **`near`** (default) — once the card is within a screen of the viewport,
  in an idle callback.
- **`idle`** — once the page has loaded, in an idle callback: for a card
  whose data should be live before it is seen (now playing's stream).
- **`eager`** — at once, ahead of the rest: only for a card that must be
  placed before the page can scroll (the videos card's dock lift).

Mounts run one at a time with a yield between them. A module that fails to
load, or a mount that throws, marks that card `data-widget-state="failed"` and
nothing else. The card walks `queued → loading → mounted | failed` in
`data-widget-state` and fires `widget:settled`; `whenMounted(el)` waits for it
(the page's reveal does, so no card fades in half-built).

## Containment (`<Widget contain>`)

- **`auto`** (default) — `contain: style`, and `content-visibility: auto`
  while the card is more than a screen away, so a far card's subtree costs no
  style, layout or paint. The runtime marks a card `data-widget-far` while it
  is beyond a screen (from its first observation, after the first paint), and
  the mark comes off before the card can be seen. (Not all the time:
  layout/paint containment pixel-snaps a card's contents, and the cards sit
  on fractional pixels — see widget-grid.css. A static card, with no `name`,
  is never marked, so never skipped.)
- **`layout`** — `contain: layout style`, always rendered: for a card whose
  content overhangs it (the videos card's ruler) and that is on its own
  compositing layer already.

A card's size comes from its size class and the grid, never from its
content — keep it that way; it is what makes the containment safe.

## Rules

- **No continuous work while inactive.** Off screen, in a background tab, or
  (for decoration) under reduced motion, a widget runs no frame callback, no
  interval, no playing media. Use `whileActive`; a finite animation the
  visitor started (a glide, a shuffle) may use `ctx.frame` directly.
- **Animate `transform` and `opacity` only.** Anything else re-lays out or
  repaints every frame. A scroll-linked effect is a CSS scroll-driven
  animation, with a script only as the fallback for engines without scroll
  timelines (`theme/stories-heading`, `src/widgets/videos`).
- **Read, then write.** Measure in a `read` frame or a ResizeObserver, write
  in a `write` frame; never interleave.
- **No `requestAnimationFrame` of your own.** Use `ctx.frame` (or `onFrame`
  from `frame.ts` outside a widget), so the page has one loop that can stop.
- **No scroll-blocking listeners.** A `wheel`, `touchstart` or `touchmove`
  listener is `{ passive: true }` unless it must `preventDefault`, and then it
  goes on the smallest element that needs it, never on `window` (Lenis's own
  are the one exception: smoothing the wheel is the point of it).
- **Never resize the card from inside.** The grid sizes it.

The build holds every one of these: see below.

## Performance budgets

Once a widget is added, CI fails if it breaks the page's performance
contract. The budgets are COUNTS and STRUCTURE (contexts, requests, chunks,
nodes, frame callbacks, layouts), never wall-clock time, so they read the
same on a laptop and on CI's software renderer. Two suites:

**The CSS lint** — `tools/lint/composited.test.ts`, in `bun run test:unit`.
Every `transition`, `transition-property` and `@keyframes` in the widgets'
and the theme's CSS (`src/widgets`, `src/styles`, `src/components`,
`src/layouts`, `theme`; stylesheets and `.astro` `<style>` blocks) may name
only properties the compositor can animate. A geometry property (width,
height, top/left, inset, margin, padding, block/inline-size, gap, font-size…,
and `transition: all`) fails it, unless it is in the file's `ALLOWED` list
with the reason it has to be (today: Volo's schedule tray, `block-size`). An
allowlist entry the code no longer needs fails it too.

**The perf project** — `tests/perf`, `bun run test --project=perf` (one
worker, its own CI step). The numbers are all in `tests/perf/budgets.ts`.
The homepage is loaded with every outside service answered locally (media,
TMDB, Cursive, the Spotify stream and its cover art), as a 1440×900 desktop
and as a touch phone (Pixel 7), with a probe (`tests/perf/probe.ts`)
injected before any script; `frame.ts` hands the probe its counters
(`frameStats`) when it finds it, and does nothing otherwise.

| Budget | What it checks | Spec |
| --- | --- | --- |
| CLS | ≤ 0.01 over a load and a scroll through every card | `load.spec.ts` |
| WebGL contexts | at load: desktop 2, phone 1 | `load.spec.ts` |
| Media requests | videos fetched in the load window (the first 6s) | `load.spec.ts` |
| Scripts before the first scroll | how many files, in the load window, and which widget chunks may be among them | `load.spec.ts` |
| Engine work | CDP layout and style-recalc counts over a fixed load window and over a scroll pass: a ceiling 1.5× the most seen | `load.spec.ts`, `scroll.spec.ts` |
| DOM nodes | the page, and each card (a card with no line fails) | `load.spec.ts` |
| Containment | every named card mounted, with a load mode, style-contained (layout too for `contain="layout"`), an intrinsic size, and `content-visibility: auto` while far | `load.spec.ts` |
| Every widget covered | each `src/widgets/<name>/client.ts` is a card on the page | `load.spec.ts` |
| Gzip per widget chunk | `widget-<name>.*.js`, gzipped; a new one gets a default | `bundle.spec.ts` |
| Idle | settled at the top (desktop): 0 frame callbacks, 0 rAF | `idle.spec.ts` |
| Hidden tab | faked with `visibilitychange`: 0 frame callbacks, 0 rAF, 0 video frames, 0 DOM changes in any card | `idle.spec.ts` |
| Inactive widget | a card out of sight changes no DOM and runs no frame callback | `idle.spec.ts` |
| Reduced motion | settled anywhere: no frames of any kind | `idle.spec.ts` |
| Lenis | 0 frames while idle; runs on the wheel; 0 again once settled | `idle.spec.ts` |
| Long script | no animation frame holds 50ms of script during a scroll pass | `scroll.spec.ts` |
| Blocking listeners | no non-passive wheel/touch listener but Lenis's own (found by identity) and the allowlisted ones, each with why | `scroll.spec.ts` |
| Lifecycle | a view-transition round trip mounts each card once per load, and leaves the same observers, window/document listeners and frame callbacks behind every time | `lifecycle.spec.ts` |

The long-script budget is the one in milliseconds. It is held on the SCRIPT
time inside each long animation frame (the Long Animation Frames API), not
on the frame's length: rendering is what SwiftShader slows most, and it is
held by count instead (engine work). Script slows with CI's CPU too, but no
frame of the pass comes near 50ms even with the CPU throttled 6×
(`PERF_CPU=6`), so only a real regression trips it.

The halftones' video loop is the one thing allowed to run on an idle page,
while a halftone is on screen and playing; in a background tab
`src/lib/pause-hidden.ts` pauses every one. The copy's wobble is the one
continuous decoration (30fps while the copy is in view), and is held by the
reduced-motion and hidden-tab budgets instead.

### Changing a budget

A budget moves deliberately, never to turn a red build green:

1. Run `PERF_LOG=1 bun run test --project=perf` (add `PW_PORT=<port>` to
   serve elsewhere). Every observed value prints next to its budget; the
   report carries them as annotations. Add `PERF_CPU=4` to run on a CPU
   four times slower, about CI's runner, before pushing a new number.
2. Change the number in `tests/perf/budgets.ts` in the same commit as the
   change that needs it, and say why in the commit. For an engine ceiling,
   run the project a few times and use 1.5× the most seen.
3. A new widget: give it its `DOM` and `WIDGET_GZIP` lines. If it is `near`
   and within a screen of the top (or `idle`/`eager`), it loads before the
   first scroll: add it to `JS_BEFORE_SCROLL`'s `widgets` and raise `files`
   by its chunk and any new shared chunk it pulls in — or, better, move it.
   A new blocking listener or geometry animation needs an allowlist entry
   with its reason, in `budgets.ts` or the lint.
