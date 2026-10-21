# tristantimblin.dev

Tristan Timblin's personal site — an Astro static site, with its design system
and Web Components as Bun workspace packages under `packages/`.

## Develop

```sh
bun install
bun run dev           # copy the fleet-demo embed, then `bunx astro dev` (Node — not `--bun`, which breaks HMR)
```

## Build and test

```sh
bun run build         # copy the prebuilt fleet-demo embed, then astro build
bun run test          # Playwright, against the built site
bun run test:unit     # unit tests beside the code
```

See [AGENTS.md](AGENTS.md) for the repo layout, the build chain, and the design
system rules. The VS Code embed is built in
[tatimblin/vscode-fleet](https://github.com/tatimblin/vscode-fleet).
