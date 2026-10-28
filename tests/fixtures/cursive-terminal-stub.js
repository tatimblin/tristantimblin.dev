// A stand-in for agent-web's <cursive-terminal> (the card's bundle,
// src/widgets/cursive/config.ts): the parts the card relies on and nothing
// else. On connect it renders an aria-hidden screen and the one real control
// (a labelled input, as the element does), then fires `cursive-usage` with a
// fixed reading, as the element does after /session. It records the endpoint
// it was given on window.__cursiveStub.
class CursiveTerminalStub extends HTMLElement {
	connectedCallback() {
		const log = (window.__cursiveStub ??= { connects: 0, endpoint: null });
		log.connects++;
		log.endpoint = this.getAttribute("endpoint");
		if (!this.firstChild) {
			const screen = document.createElement("div");
			screen.className = "ct-screen";
			screen.setAttribute("aria-hidden", "true");
			screen.textContent = this.getAttribute("greeting") ?? "";
			const form = document.createElement("form");
			form.className = "ct-form";
			const input = document.createElement("input");
			input.className = "ct-input";
			input.setAttribute("aria-label", "Ask the Cursive agent");
			form.append(input);
			this.append(screen, form);
		}
		const detail = { fraction: 0.42, exhausted: false, paused: false, resetsAt: "2026-10-29T00:00:00Z", used: 0, budget: 0 };
		queueMicrotask(() => this.dispatchEvent(new CustomEvent("cursive-usage", { bubbles: true, detail })));
	}
}
if (!customElements.get("cursive-terminal")) customElements.define("cursive-terminal", CursiveTerminalStub);
