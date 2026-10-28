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

export const CURSIVE_AGENT_PROD = "https://agent.cursive.info";
/** Staging allows localhost and the Pages preview origins; production only this site. */
export const CURSIVE_AGENT_STAGING = "https://staging.agent.cursive.info";

/** The branch Cloudflare Pages serves as production (build-deploy.yml deploys `--branch=master`). */
export const PRODUCTION_BRANCH = "master";

/** How long the bundle may take before the card gives up and says so. */
export const LOAD_TIMEOUT_MS = 8_000;

interface BuildEnv {
	/** `astro dev`. */
	dev: boolean;
	/** CF_PAGES_BRANCH: set when Cloudflare Pages runs the build itself. */
	pagesBranch?: string;
	/** PUBLIC_CURSIVE_AGENT: an explicit endpoint, beating the rest. */
	override?: string;
}

/**
 * The agent a build talks to, decided at build time and rendered into the
 * element's `endpoint` attribute. A production build gets production; the dev
 * server, and a Pages build of any branch but production, get staging (the
 * production agent refuses their origins).
 */
export function agentEndpoint({ dev, pagesBranch, override }: BuildEnv): string {
	if (override) return override.replace(/\/+$/, "");
	if (dev) return CURSIVE_AGENT_STAGING;
	if (pagesBranch && pagesBranch !== PRODUCTION_BRANCH) return CURSIVE_AGENT_STAGING;
	return CURSIVE_AGENT_PROD;
}
