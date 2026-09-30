/**
 * The scene names — every `src/scenes/<name>.svg`, baked from
 * `tools/scenes/<name>/scene.ts` — as a type. Its own module (no
 * `import.meta.glob`, which only Vite provides) so the registry test can
 * hold it against the directory under plain bun. scenes.ts re-exports it;
 * import from there.
 */
export const SCENE_NAMES = ["globe", "hud", "phone"] as const;

export type SceneName = (typeof SCENE_NAMES)[number];
