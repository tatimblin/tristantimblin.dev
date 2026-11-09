/**
 * The light/dark chips ([data-theme-toggle], src/components/ThemeToggle.astro):
 * what a chip says is CSS off data-theme, so this only handles the click. It
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

onPage(() => {
	const buttons = [...document.querySelectorAll<HTMLButtonElement>("[data-theme-toggle]")];
	if (!buttons.length) return;
	const onClick = () => {
		const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
		window.__setTheme(next);
		try {
			localStorage.setItem("theme", next);
		} catch {
			/* storage unavailable: the choice lasts the page */
		}
	};
	for (const btn of buttons) btn.addEventListener("click", onClick);
	return () => buttons.forEach((btn) => btn.removeEventListener("click", onClick));
});
