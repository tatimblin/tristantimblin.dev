// A stand-in for agent-web's <cursive-terminal> (the card's bundle,
// src/widgets/cursive/config.ts): the parts the card relies on and nothing
// else. On connect it renders an aria-hidden screen and the one real control
// (a labelled input, as the element does), then asks the agent for
// /session and, as the element does, fires `cursive-usage` only if that
// answers with a usage reading — keeping the answer as `session` and firing
// through `reportUsage()`, the two the card uses to catch up on a reading
// made before it mounted. It records the endpoint on window.__cursiveStub.
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
		void this.boot();
	}

	async boot() {
		try {
			const res = await fetch(`${this.getAttribute("endpoint")}/session?profile=${this.getAttribute("profile")}`);
			if (!res.ok) return;
			// Kept on the element, as the element keeps its /session answer.
			this.sessionData = await res.json();
			if (this.sessionData.usage) this.reportUsage(this.sessionData.usage);
		} catch {
			/* the agent is down: no reading, as the element */
		}
	}

	// The element's `session` field: the last /session answer, or null.
	get session() {
		return this.sessionData ?? null;
	}

	// The element's reportUsage(): fires `cursive-usage` for a reading.
	reportUsage(usage) {
		const fraction = usage.budget > 0 ? Math.min(1, usage.used / usage.budget) : 1;
		const detail = { ...usage, fraction, paused: usage.paused === true };
		this.dispatchEvent(new CustomEvent("cursive-usage", { bubbles: true, detail }));
	}
}
if (!customElements.get("cursive-terminal")) customElements.define("cursive-terminal", CursiveTerminalStub);
