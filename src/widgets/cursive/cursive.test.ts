import { describe, expect, test } from "bun:test";
import { agentEndpoint, CURSIVE_AGENT_PROD, CURSIVE_AGENT_STAGING } from "./config";
import { usageReading } from "./cursive";

describe("agentEndpoint", () => {
	test("a production build talks to production", () => {
		expect(agentEndpoint({ dev: false })).toBe(CURSIVE_AGENT_PROD);
		expect(agentEndpoint({ dev: false, pagesBranch: "master" })).toBe(CURSIVE_AGENT_PROD);
	});
	test("the dev server and a Pages preview talk to staging", () => {
		expect(agentEndpoint({ dev: true })).toBe(CURSIVE_AGENT_STAGING);
		expect(agentEndpoint({ dev: false, pagesBranch: "feat/cursive-card" })).toBe(CURSIVE_AGENT_STAGING);
	});
	test("an explicit endpoint wins, without its trailing slash", () => {
		expect(agentEndpoint({ dev: true, override: "http://localhost:8787/" })).toBe("http://localhost:8787");
	});
});

describe("usageReading", () => {
	const at = () => "5:00 PM";
	const base = { fraction: 0.123, exhausted: false, resetsAt: "2026-10-29T00:00:00Z" };

	test("a share of the day, rounded", () => {
		const r = usageReading(base, at);
		expect(r).toMatchObject({ state: "ok", value: "12%", label: "used today", share: 12 });
		expect(r.title).toContain("resets 5:00 PM");
	});
	test("high from 85%", () => {
		expect(usageReading({ ...base, fraction: 0.85 }, at).state).toBe("high");
		expect(usageReading({ ...base, fraction: 0.849 }, at).state).toBe("ok");
	});
	test("used up says so, full", () => {
		const r = usageReading({ ...base, fraction: 0.9, exhausted: true }, at);
		expect(r).toMatchObject({ state: "exhausted", value: "100%", label: "used up for today", share: 100 });
		expect(r.title).toContain("back at 5:00 PM");
	});
	test("paused draws nothing it can't measure", () => {
		const r = usageReading({ ...base, exhausted: true, paused: true }, at);
		expect(r).toMatchObject({ state: "paused", value: "Paused", share: 0 });
	});
	test("clamps a stray fraction", () => {
		expect(usageReading({ ...base, fraction: 1.4 }, at).share).toBe(100);
		expect(usageReading({ ...base, fraction: -1 }, at).share).toBe(0);
	});
});
