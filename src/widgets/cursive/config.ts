// The cursive card's two outside dependencies: the <cursive-terminal> bundle,
// and the agent it talks to (agent-web's bin/demo-agent).

/**
 * The bundle, without its extension: `${CURSIVE_TERMINAL}.js` is the element,
 * `${CURSIVE_TERMINAL}.css` its layout. Always the production host — the
 * element is endpoint-agnostic and served with `access-control-allow-origin: *`.
 * Floating `v1` on purpose, not a pinned `v1.x.y`: agent-web serves only the
 * current release's pinned files, so a pin would break the card on its next
 * release, while `v1` stays compatible within the major.
 */
export const CURSIVE_TERMINAL = "https://agent.cursive.info/terminal/v1";

/** Production accepts only this site's origins. */
export const CURSIVE_AGENT_PROD = "https://agent.cursive.info";
/** Staging also accepts localhost (any port) and https://*.tristantimblin.pages.dev. */
export const CURSIVE_AGENT_STAGING = "https://staging.agent.cursive.info";

/** How long the bundle, and then the agent's first reading, may take before
 *  the card gives up and says so. */
export const LOAD_TIMEOUT_MS = 8_000;

interface BuildEnv {
	/** `astro dev`. */
	dev: boolean;
	/** PUBLIC_CURSIVE_AGENT: an explicit endpoint, beating the rest. */
	override?: string;
}

/**
 * The agent a build talks to, decided at build time and rendered into the
 * element's `endpoint` attribute: staging under `astro dev`, production in a
 * build. A production build served anywhere but this site (a local
 * `astro preview`) is refused by production, so build it pointed at staging:
 *
 *   PUBLIC_CURSIVE_AGENT=https://staging.agent.cursive.info bun run build
 */
export function agentEndpoint({ dev, override }: BuildEnv): string {
	if (override) return override.replace(/\/+$/, "");
	return dev ? CURSIVE_AGENT_STAGING : CURSIVE_AGENT_PROD;
}
