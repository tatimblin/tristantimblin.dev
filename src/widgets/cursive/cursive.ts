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
	/** The meter's figure and its label. */
	value: string;
	label: string;
	/** The ruler's lit share, 0–100. */
	share: number;
}

/** Above this the lit ticks and the figure turn to the warning colour. */
export const HIGH = 0.9;

/** `label` is read after `value` by screen readers only; the header shows the figure alone. */
export function usageReading(detail: UsageDetail): UsageReading {
	if (detail.paused === true) return { state: "paused", value: "Paused", label: "the demo isn't answering right now", share: 0 };
	if (detail.exhausted) return { state: "exhausted", value: "100%", label: "today's free budget is used up", share: 100 };
	const fraction = Math.min(1, Math.max(0, detail.fraction));
	const whole = Math.round(fraction * 100);
	return { state: fraction > HIGH ? "high" : "ok", value: `${whole}%`, label: "of today's free budget used", share: whole };
}
