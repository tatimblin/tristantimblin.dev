/**
 * The light/dark chips ([data-theme-toggle], src/components/ThemeToggle.astro):
 * pressed = light, the label naming the theme a click switches to. A click
 * calls window.__setTheme (Layout's inline head script, the one attribute
 * write) and stores the choice; <dotted-grid> observes data-theme on <html>
 * itself, so no event is needed.
 *
 * Binding is this module's side effect, so it happens once however many
 * scripts import it: ThemeToggle's own, and a page whose toggle sits in a DS
 * Card slot (Card renders a slot twice to test it is filled, and the
 * component's script goes out with the discarded render).
 */
import { onPage } from "@whois/design-system/lib/lifecycle";

const isLight = () => document.documentElement.dataset.theme !== "dark";

onPage(() => {
	const buttons = [...document.querySelectorAll<HTMLButtonElement>("[data-theme-toggle]")];
	if (!buttons.length) return;
	const sync = () => {
		const light = isLight();
		for (const btn of buttons) {
			btn.setAttribute("aria-pressed", String(light));
			btn.setAttribute("aria-label", light ? "Switch to dark theme" : "Switch to light theme");
			const label = btn.querySelector("[data-theme-toggle-label]");
			if (label) label.textContent = light ? "Dark" : "Light";
		}
	};
	const onClick = () => {
		const next = isLight() ? "dark" : "light";
		window.__setTheme(next);
		try {
			localStorage.setItem("theme", next);
		} catch {
			/* storage unavailable: the choice lasts the page */
		}
		sync();
	};
	for (const btn of buttons) btn.addEventListener("click", onClick);
	sync();
	return () => buttons.forEach((btn) => btn.removeEventListener("click", onClick));
});
