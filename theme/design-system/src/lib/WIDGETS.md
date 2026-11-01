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
- **Never resize the card from inside.** The grid sizes it.
