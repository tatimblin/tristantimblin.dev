/**
 * How a live demo in a post starts — one rule for every one (<Embed>, the
 * fleet demo, whatever comes next):
 *
 *   desktop  it launches by itself as it scrolls into view;
 *   phone    it waits behind its poster for a tap on its launch button, so
 *            a heavy scene never boots on a phone unasked.
 *
 * "Desktop" is the page's own desktop step, the width the ruled post goes
 * to four columns at.
 */
export const DESKTOP = "(min-width: 1024px)";

/** Whether a demo should launch on its own right now (else: on a tap). */
export const launchesOnView = () => matchMedia(DESKTOP).matches;
