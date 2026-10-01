# tristantimblin.dev

Tristan Timblin's personal site — an Astro static site, with its design system
and Web Components as Bun workspace packages under `packages/`.

## Develop

```sh
bun install
bunx astro dev        # Node — not `bunx --bun astro dev`, which breaks HMR
```

## Build and test

```sh
bun run build         # the fleet-demo embed, then astro build
bun run test          # Playwright, against the built site
bun run test:unit     # unit tests beside the code
```

See [AGENTS.md](AGENTS.md) for the repo layout, the build chain, and the design
system rules.
