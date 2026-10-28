import { describe, expect, test } from "bun:test";
import { agentEndpoint, CURSIVE_AGENT_PROD, CURSIVE_AGENT_STAGING } from "./config";
import { usageReading } from "./cursive";

describe("agentEndpoint", () => {
	test("a build talks to production, the dev server to staging", () => {
		expect(agentEndpoint({ dev: false })).toBe(CURSIVE_AGENT_PROD);
		expect(agentEndpoint({ dev: true })).toBe(CURSIVE_AGENT_STAGING);
	});
	test("an explicit endpoint wins, without its trailing slash", () => {
		expect(agentEndpoint({ dev: false, override: "https://staging.agent.cursive.info/" })).toBe(CURSIVE_AGENT_STAGING);
	});
});

describe("usageReading", () => {
	const base = { fraction: 0.123, exhausted: false, resetsAt: "2026-10-29T00:00:00Z" };

	test("a share of the day, rounded", () => {
		expect(usageReading(base)).toEqual({ state: "ok", value: "12%", label: "used today", share: 12 });
	});
	test("high from 85%", () => {
		expect(usageReading({ ...base, fraction: 0.85 }).state).toBe("high");
		expect(usageReading({ ...base, fraction: 0.849 }).state).toBe("ok");
	});
	test("used up says so, full", () => {
		expect(usageReading({ ...base, fraction: 0.9, exhausted: true })).toEqual({
			state: "exhausted",
			value: "100%",
			label: "used up for today",
			share: 100,
		});
	});
	test("paused draws nothing it can't measure", () => {
		expect(usageReading({ ...base, exhausted: true, paused: true })).toMatchObject({ state: "paused", value: "Paused", share: 0 });
	});
	test("clamps a stray fraction", () => {
		expect(usageReading({ ...base, fraction: 1.4 }).share).toBe(100);
		expect(usageReading({ ...base, fraction: -1 }).share).toBe(0);
	});
});
