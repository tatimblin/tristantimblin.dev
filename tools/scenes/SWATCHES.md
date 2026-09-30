# Scene swatches — the hand-vector route

Draw a scene in Figma or Illustrator with **these colours and nothing else**;
`importVector` (`lib/import-vector.ts`) swaps each for its `var(--art-*)`
token and refuses any other colour, naming every one it found and the
swatch nearest it. Import [`swatches.svg`](swatches.svg) into the editor
(File → Import in Figma, File → Place in Illustrator) for the chips, the
wash, the weights and the dashes; [`lib/swatches.ts`](lib/swatches.ts) is
the table the importer reads, and its test holds this page and the sheet to
it.

| Swatch | Hex | Becomes | For |
| --- | --- | --- | --- |
| ink | `#F6F5EB` | `var(--art-ink)` | the line work, the white faces |
| ink-2 | `#8B8A86` | `var(--art-ink-2)` | the dimmed ink: guides, back edges — the one dimming |
| lavender | `#BCA2E9` | `var(--art-lavender)` | a fill colour |
| coral | `#EE5B2E` | `var(--art-coral)` | a fill colour (the accent) |
| cyan | `#5A8CEE` | `var(--art-cyan)` | a fill colour (the kit's "blue") |
| green | `#5DE17E` | `var(--art-green)` | a fill colour (the console's phosphor) |
| plate | `#17161C` | dropped | the artboard's background rect only |

Each is its token's dark-theme colour one step off in every channel: the
artboard looks like the scene, and no one types these by accident. A real
token hex pasted from the CSS is one step away and is refused, with the
swatch named.

**The wash** is not a swatch: a colour swatch (lavender, coral, cyan,
green) with a **fill opacity of 25% or less** — the layer's opacity, the
fill's opacity and the colour's own alpha multiplied — becomes
`color-mix(in oklab, var(--art-<colour>) N%, transparent)`. Between 25% and
100% is refused (a wash is faint, a fill is flat). Ink and ink-2 never
wash; a stroke is never translucent — dim a line with ink-2.

**Weights and dashes** are drawn at the export's scale: on a 2× frame
(640×360 for the 320×180 plate, 800×800 for the 400×400 panel) a **2** is
the hair (1) and a **3** the line (1.5); the dashes **8 8**, **4 12** and
**12 6 2 6** are the scene's `4 4`, `2 6` and the dot-dash `6 3 1 3`.
Anything else is refused with the value to draw instead.

**Everything else**: no text (the readouts are HTML over the scene), no
images, no effects (shadows, blurs, blend modes), no gradients, no masks
or clips but the frame's own; outline and flatten in the editor. Name a
layer that should move (Figma writes the name as the id when *Include "id"
attribute* is ticked) and give it to `importVector`'s `motion`. The whole
contract is CONVENTIONS, "L4 — scenes", the hand-vector route.
