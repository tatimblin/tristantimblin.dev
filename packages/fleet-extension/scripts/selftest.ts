/**
 * Pure-logic selftest for the fleet model.
 *
 * Why a Bun script instead of a test runner: everything under
 * `src/common/model/` is deliberately free of any `vscode` import, so it can be
 * exercised without an extension host, a display, or a downloaded VS Code
 * build. Keeping that property verifiable is half the point of the test — the
 * moment this script cannot run, the model has grown a host dependency and the
 * webview will not be able to import it either.
 *
 * Run with `bun run selftest`. Exits non-zero on the first failure so it can be
 * wired into CI as-is.
 */

import { computeCheckDigit, generateVin, isValidVin } from "../src/common/model/vin";
import { seedFleet } from "../src/common/model/fleet";
import type { VehiclePersonality } from "../src/common/model/types";

let failures = 0;

function check(label: string, condition: boolean, detail = ""): void {
	if (condition) {
		console.log(`  ok   ${label}${detail ? ` — ${detail}` : ""}`);
	} else {
		failures++;
		console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
	}
}

console.log("vin: reference cases");

// The canonical worked example from the FMVSS 565 literature. Its weighted sum
// is 351; 351 mod 11 = 10, which is the case that must render as "X" rather
// than as the digits "10". A naive implementation that returns String(10) here
// produces an 18-character VIN and nothing downstream notices.
const REFERENCE_VIN = "1M8GDM9AXKP042788";
check("1M8GDM9AXKP042788 check digit is X", computeCheckDigit(REFERENCE_VIN) === "X", computeCheckDigit(REFERENCE_VIN));
check("1M8GDM9AXKP042788 validates", isValidVin(REFERENCE_VIN));

// All-ones: every character transliterates to 1, so the sum is just the sum of
// the weights (89), and 89 mod 11 = 1 — which happens to be the character
// already sitting in position 9. A degenerate but load-bearing case: it is the
// only reference that catches a wrong *weight* while every transliteration is
// right.
const ONES_VIN = "11111111111111111";
check("11111111111111111 check digit is 1", computeCheckDigit(ONES_VIN) === "1", computeCheckDigit(ONES_VIN));
check("11111111111111111 validates", isValidVin(ONES_VIN));

// S transliterates to 2, not 1. This is the specific value an arithmetic
// shortcut over character codes gets wrong; assert it directly so the failure
// names itself instead of surfacing as "some VIN is invalid".
check(
	"S transliterates to 2 (not 1)",
	computeCheckDigit("1S111111111111111") === computeCheckDigit("1B111111111111111"),
	"S and B must contribute the same weighted value"
);

console.log("");
console.log("vin: rejects malformed input");

check("rejects wrong length", !isValidVin("1M8GDM9AXKP04278"));
check("rejects illegal letter I", !isValidVin("1M8GDM9AXKP04278I"));
check("rejects illegal letter O", !isValidVin("OM8GDM9AXKP042788"));
check("rejects illegal letter Q", !isValidVin("QM8GDM9AXKP042788"));
check("rejects empty string", !isValidVin(""));

console.log("");
console.log("vin: single-character mutations are caught");

// A mod-11 check digit catches a single-character substitution *unless* the
// two characters transliterate to the same value — the mapping is many-to-one
// by design (1, A and J are all worth 1), so those substitutions are provably
// invisible to any check digit, not a bug in this implementation. Position 1 of
// the reference VIN holds "1", so mutating it across the whole alphabet must
// leave exactly "A" and "J" standing and nothing else.
const ALPHABET = "0123456789ABCDEFGHJKLMNPRSTUVWXYZ";
const survivors: string[] = [];
for (const char of ALPHABET) {
	if (char === REFERENCE_VIN[0]) continue;
	if (isValidVin(char + REFERENCE_VIN.slice(1))) survivors.push(char);
}
check(
	"position 1 mutations survive only on transliteration collisions",
	survivors.join("") === "AJ",
	`survivors: ${survivors.join("") || "none"} (of ${ALPHABET.length - 1} mutations)`
);

// Sweep every position and every substitution to quantify the check digit's
// real strength, rather than trusting one position.
let mutations = 0;
let falseAccepts = 0;
for (let i = 0; i < REFERENCE_VIN.length; i++) {
	// Position 9 IS the check digit; changing it is a different kind of error and
	// is covered by the reference case above.
	if (i === 8) continue;
	for (const char of ALPHABET) {
		if (char === REFERENCE_VIN[i]) continue;
		mutations++;
		const mutated = REFERENCE_VIN.slice(0, i) + char + REFERENCE_VIN.slice(i + 1);
		if (isValidVin(mutated)) falseAccepts++;
	}
}
check(
	"single-character mutations are overwhelmingly rejected",
	falseAccepts / mutations < 0.1,
	`${falseAccepts}/${mutations} accepted (${((falseAccepts / mutations) * 100).toFixed(1)}%)`
);

console.log("");
console.log("vin: generator");

// Every WMI × every supported year × a spread of serials must produce a VIN
// that its own validator accepts. This is the property that actually matters:
// the generator and the validator are two independent readings of the same
// spec, and they have to agree.
const WMIS = ["5YJ", "7SA", "7FC", "7PD", "50E"];
const YEARS = [2022, 2023, 2024, 2025, 2026];
let generated = 0;
let invalid = 0;
for (const wmi of WMIS) {
	for (const year of YEARS) {
		for (const serial of [0, 1, 7, 42, 8871, 118342, 999999]) {
			const vin = generateVin({ wmi, year, serial });
			generated++;
			if (vin.length !== 17 || !isValidVin(vin)) invalid++;
		}
	}
}
check("every generated VIN is valid", invalid === 0, `${generated - invalid}/${generated} valid`);

// Determinism: the VFS keys editor URIs off the VIN, so the same inputs must
// give the same VIN forever, not just within one process.
check(
	"generation is deterministic",
	generateVin({ wmi: "5YJ", year: 2024, serial: 118342 }) ===
		generateVin({ wmi: "5YJ", year: 2024, serial: 118342 })
);

const YEAR_CODE_CASES: Array<[number, string]> = [
	[2022, "N"],
	[2023, "P"],
	[2024, "R"],
	[2025, "S"],
	[2026, "T"]
];
for (const [year, code] of YEAR_CODE_CASES) {
	const vin = generateVin({ wmi: "5YJ", year, serial: 1 });
	check(`year ${year} encodes as "${code}"`, vin[9] === code, vin);
}

console.log("");
console.log("fleet: seed");

const fleet = seedFleet(1_756_857_600_000);

check("seeds 6 vehicles", fleet.length === 6, `${fleet.length}`);
check("every VIN is valid", fleet.every((v) => isValidVin(v.vin)));
check("vehicle ids are unique", new Set(fleet.map((v) => v.id)).size === fleet.length);
check("VINs are unique", new Set(fleet.map((v) => v.vin)).size === fleet.length);

const counts = fleet.reduce<Record<string, number>>((acc, v) => {
	acc[v.personality] = (acc[v.personality] ?? 0) + 1;
	return acc;
}, {});
const EXPECTED: Record<VehiclePersonality, number> = {
	driving: 1,
	charging: 1,
	asleep: 1,
	faulted: 1,
	idle: 2
};
for (const [personality, expected] of Object.entries(EXPECTED)) {
	check(`${expected}× "${personality}"`, counts[personality] === expected, `got ${counts[personality] ?? 0}`);
}

const driving = fleet.find((v) => v.personality === "driving")!;
check("driving vehicle is in gear D", driving.gear === "D");
check("driving vehicle has nonzero speed", driving.speedKph > 0, `${driving.speedKph} km/h`);
check(
	"driving vehicle has a plausible GPS fix",
	Math.abs(driving.position.lat) <= 90 && Math.abs(driving.position.lon) <= 180,
	`${driving.position.lat}, ${driving.position.lon}`
);

const charging = fleet.find((v) => v.personality === "charging")!;
check("charging vehicle is plugged in and charging", charging.charge.pluggedIn && charging.charge.charging);
check("charging vehicle has mid-range SoC", charging.charge.soc >= 30 && charging.charge.soc <= 80, `${charging.charge.soc}%`);
check("charging vehicle draws power", charging.charge.powerKw > 0, `${charging.charge.powerKw} kW`);

const asleep = fleet.find((v) => v.personality === "asleep")!;
check("asleep vehicle is offline", asleep.online === false);
check("asleep vehicle is stationary", asleep.speedKph === 0 && asleep.gear === "P");

const faulted = fleet.find((v) => v.personality === "faulted")!;
const EXPECTED_DTCS = ["P0A80", "P0A7D", "P0A7E", "P0562", "U0100"];
check("faulted vehicle carries 5 DTCs", faulted.dtcs.length === 5, `${faulted.dtcs.length}`);
check(
	"faulted vehicle carries the expected codes",
	EXPECTED_DTCS.every((code) => faulted.dtcs.some((d) => d.code === code)),
	faulted.dtcs.map((d) => d.code).join(", ")
);
check("every DTC has a description", faulted.dtcs.every((d) => d.description.length > 0));
check("every DTC has a timestamp", faulted.dtcs.every((d) => Number.isFinite(d.timestamp) && d.timestamp > 0));
check("no other vehicle has DTCs", fleet.filter((v) => v.dtcs.length > 0).length === 1);

// `fleet.reset` re-seeds by calling seedFleet() again, so it must hand back
// fresh objects — a shared constant would carry the previous session's
// simulator mutations straight through the reset.
const a = seedFleet(0);
const b = seedFleet(0);
a[0]!.speedKph = 999;
check("seedFleet returns fresh objects", b[0]!.speedKph !== 999);
check("seedFleet is VIN-stable across calls", a.map((v) => v.vin).join() === b.map((v) => v.vin).join());

console.log("");
if (failures > 0) {
	console.log(`${failures} check(s) failed`);
	process.exit(1);
}
console.log("all checks passed");
