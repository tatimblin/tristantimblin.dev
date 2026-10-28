// The budget meter's reading, from the terminal's `cursive-usage` event. Pure,
// so the wording is testable without a DOM.

/** The event's detail (agent-web packages/cursive-terminal/src/usage.ts). */
export interface UsageDetail {
	/** Today's share of the free allocation used, 0–1. */
	fraction: number;
	/** Used up: questions are refused until `resetsAt`. */
	exhausted: boolean;
	/** The backend can't measure usage, so it refuses every question. Absent from older servers. */
	paused?: boolean;
	resetsAt: string;
}

export type UsageState = "ok" | "high" | "exhausted" | "paused";

export interface UsageReading {
	state: UsageState;
	/** The Stat's value and label. */
	value: string;
	label: string;
	/** The ruler's lit share, 0–100. */
	share: number;
	/** The long form, for the meter's tooltip and accessible name. */
	title: string;
}

/** From here up the lit stretch turns to the warning colour. */
export const HIGH = 0.85;

export function usageReading(detail: UsageDetail, at: (iso: string) => string): UsageReading {
	if (detail.paused === true) {
		return {
			state: "paused",
			value: "Paused",
			label: "not answering",
			share: 0,
			title: "The demo is paused: it can't confirm today's usage, so it isn't answering right now",
		};
	}
	const resets = at(detail.resetsAt);
	if (detail.exhausted) {
		return {
			state: "exhausted",
			value: "100%",
			label: "used up for today",
			share: 100,
			title: `All of today's free tokens are used · back at ${resets}`,
		};
	}
	const fraction = Math.min(1, Math.max(0, detail.fraction));
	const whole = Math.round(fraction * 100);
	return {
		state: fraction >= HIGH ? "high" : "ok",
		value: `${whole}%`,
		label: "used today",
		share: whole,
		title: `${whole}% of today's free tokens used · resets ${resets}`,
	};
}
