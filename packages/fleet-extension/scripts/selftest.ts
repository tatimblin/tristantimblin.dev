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
import { FleetSimulator } from "../src/common/sim/clock";
import type { AmbientEvent } from "../src/common/sim/clock";
import { decodeFrameAnnotation, encodeDiSpeed, getBitsLE } from "../src/common/sim/can";
import {
	commandLatencyMs,
	evaluateOtaPreconditions,
	evaluateVehicleCommand,
	executeVehicleCommand,
	OTA_ECUS,
	OTA_STAGE_INCREMENTS,
	OTA_TARGET_VERSION
} from "../src/common/vehicleCommands";

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


// ────────────────────────────────────────────────────────────────────────────
// Simulator. Constructed directly and driven with explicit `tick(now)` calls —
// virtual time, no interval, no sleeping — which is only possible because
// src/common/sim/ has no `vscode` import. If these lines ever fail to *load*,
// that property broke.
// ────────────────────────────────────────────────────────────────────────────

console.log("");
console.log("sim: physics");

const T0 = 1_756_857_600_000;
const sim = new FleetSimulator(T0);
const atlas = sim.getVehicles().find((v) => v.personality === "driving")!;
const beacon = sim.getVehicles().find((v) => v.personality === "charging")!;
const cinder = sim.getVehicles().find((v) => v.personality === "asleep")!;
const dune = sim.getVehicles().find((v) => v.personality === "faulted")!;

const seedLat = atlas.position.lat;
const seedLon = atlas.position.lon;
const seedOdometer = atlas.odometerKm;
const cinderBefore = JSON.stringify(cinder);
const duneBefore = JSON.stringify(dune);

const changedVins = new Set<string>();
sim.onVehicleChanged((vin) => changedVins.add(vin));

// 120 ticks × 250 ms = 30 s of virtual driving/charging.
let socMonotonic = true;
let speedInBounds = true;
let lastSoc = beacon.charge.soc;
let now = T0;
for (let i = 0; i < 120; i++) {
	now = T0 + (i + 1) * 250;
	sim.tick(now);
	if (beacon.charge.soc < lastSoc) socMonotonic = false;
	lastSoc = beacon.charge.soc;
	if (atlas.speedKph < 90 || atlas.speedKph > 115) speedInBounds = false;
}

check("atlas speed stays within 90–115 km/h across 120 ticks", speedInBounds, `${atlas.speedKph.toFixed(1)} km/h now`);
check(
	"atlas GPS advanced",
	atlas.position.lat !== seedLat || atlas.position.lon !== seedLon,
	`${seedLat},${seedLon} → ${atlas.position.lat.toFixed(5)},${atlas.position.lon.toFixed(5)}`
);
check("atlas odometer advanced", atlas.odometerKm > seedOdometer, `+${(atlas.odometerKm - seedOdometer).toFixed(3)} km`);
check("beacon SoC rose monotonically", socMonotonic && beacon.charge.soc > 54, `54% → ${beacon.charge.soc.toFixed(1)}%`);
check("beacon charge power tapers but stays positive", beacon.charge.powerKw > 0 && beacon.charge.powerKw < 147, `${beacon.charge.powerKw} kW`);
check("asleep vehicle untouched by the clock", JSON.stringify(cinder) === cinderBefore);
check("faulted vehicle untouched by the clock", JSON.stringify(dune) === duneBefore);
check(
	"onVehicleChanged fired for the movers, not the sleepers",
	changedVins.has(atlas.vin) && changedVins.has(beacon.vin) && !changedVins.has(cinder.vin) && !changedVins.has(dune.vin),
	[...changedVins].map((vin) => vin.slice(-6)).join(", ")
);

console.log("");
console.log("sim: serialization");

const stateJson = sim.serializeState(atlas.vin);
let state: Record<string, any> | null = null;
try {
	state = JSON.parse(stateJson);
} catch {
	state = null;
}
check("serializeState produces parseable JSON", state !== null, `${stateJson.length} bytes`);
check(
	"state has charge_state / climate_state / drive_state / vehicle_state",
	!!state && ["charge_state", "climate_state", "drive_state", "vehicle_state"].every((key) => typeof state![key] === "object")
);
check(
	"vehicle_state carries df/dr/pf/pr and ft/rt",
	!!state && ["df", "dr", "pf", "pr", "ft", "rt"].every((key) => typeof state!.vehicle_state[key] === "number")
);
check(
	"vehicle_state carries locked, odometer and software_update{status,version}",
	!!state &&
		typeof state.vehicle_state.locked === "boolean" &&
		typeof state.vehicle_state.odometer_km === "number" &&
		typeof state.vehicle_state.software_update?.status === "string" &&
		typeof state.vehicle_state.software_update?.version === "string"
);

const dtcsJson = sim.serializeDtcs(dune.vin);
let dtcsDoc: Record<string, any> | null = null;
try {
	dtcsDoc = JSON.parse(dtcsJson);
} catch {
	dtcsDoc = null;
}
check("serializeDtcs produces parseable JSON with 5 codes", !!dtcsDoc && dtcsDoc.count === 5 && dtcsDoc.codes.length === 5);

console.log("");
console.log("sim: CAN ring buffer");

// 120 ticks at ~300 frames each is ~36,000 frames offered; the cap is 4,096.
check("ring buffer respects its cap under overfill", sim.bufferedFrameCount <= 4096, `${sim.bufferedFrameCount} buffered`);
check("ring buffer actually filled to its cap", sim.bufferedFrameCount === 4096, `${sim.bufferedFrameCount}`);

const oldest = sim.drainFrames(1)[0]!;
// Drop-oldest: the earliest surviving frame must postdate the early ticks
// whose frames were pushed out. 4,096 frames at ~1,200/s is ~3.4 s of tail
// out of 30 s simulated.
check("overfill dropped the oldest frames", oldest.timestamp > T0 + 20_000, `oldest at T0+${oldest.timestamp - T0} ms`);

const drained = sim.drainFrames(500);
check("drainFrames honours max", drained.length === 500, `${drained.length}`);
check("drainFrames removes what it returns", sim.bufferedFrameCount === 4096 - 1 - 500, `${sim.bufferedFrameCount} left`);
check("frames are well-formed (dlc matches data, 11-bit ids)", drained.every((f) => f.dlc === f.data.length && f.dlc <= 8 && f.id >= 0 && f.id <= 0x7ff));

// DI_speed round-trip: the last DI_speed frame in the buffer was encoded from
// atlas's post-physics speed on the final tick, which nothing has changed
// since. Decode 12|12@1+ with the real DBC scaling: kph = raw × 0.08 − 40.
const rest = sim.drainFrames(10_000);
const lastSpeedFrame = [...rest].reverse().find((f) => f.label === "DI_speed");
check("buffer contains DI_speed frames (id 599)", !!lastSpeedFrame && lastSpeedFrame.id === 599);
if (lastSpeedFrame) {
	const decodedKph = getBitsLE(lastSpeedFrame.data, 12, 12) * 0.08 - 40;
	check(
		"DI_speed round-trips through factor 0.08 / offset −40",
		Math.abs(decodedKph - atlas.speedKph) <= 0.04 + 1e-9,
		`decoded ${decodedKph.toFixed(2)} vs actual ${atlas.speedKph.toFixed(2)} km/h`
	);
}
check("drained dry", sim.bufferedFrameCount === 0);

console.log("");
console.log("sim: mtime monotonicity and mutations");

const m1 = sim.mtimeOf(atlas.vin);
check("setDoorLock mutates the door", sim.setDoorLock(atlas.vin, "FL", false) && atlas.doors.FL.locked === false);
check("vehicle-level locked reflects the doors", atlas.locked === false);
const m2 = sim.mtimeOf(atlas.vin);
sim.tick(now + 250);
const m3 = sim.mtimeOf(atlas.vin);
check("mtime strictly increases across mutations", m1 < m2 && m2 < m3, `${m1} < ${m2} < ${m3}`);
check("setDoorLock rejects unknown VINs", sim.setDoorLock("NOSUCHVIN000000000", "FL", true) === false);

console.log("");
console.log("sim: reset");

const preResetMtime = sim.mtimeOf(atlas.vin);
sim.reset();
const fresh = seedFleet();
const atlasAfter = sim.getVehicle(atlas.vin)!;
const beaconAfter = sim.getVehicle(beacon.vin)!;
check("reset restores the seeded speed", atlasAfter.speedKph === fresh[0]!.speedKph, `${atlasAfter.speedKph} km/h`);
check("reset restores the seeded SoC", beaconAfter.charge.soc === fresh[1]!.charge.soc, `${beaconAfter.charge.soc}%`);
check("reset re-locks the unlocked door", atlasAfter.doors.FL.locked === true && atlasAfter.locked === true);
check("reset keeps VINs (and therefore VFS paths) stable", sim.getVehicles().map((v) => v.vin).join() === fresh.map((v) => v.vin).join());
check("reset clears the frame buffer", sim.bufferedFrameCount === 0);
// The one thing reset must NOT reset: a rewound mtime would pin stale bytes
// in any open editor (see clock.ts).
check("mtime keeps advancing across reset", sim.mtimeOf(atlas.vin) > preResetMtime, `${preResetMtime} → ${sim.mtimeOf(atlas.vin)}`);

sim.dispose();

// ────────────────────────────────────────────────────────────────────────────
// The async command layer, wake/sleep, OTA transitions and bus targeting.
// Same rule as the simulator sections above: everything here loads and runs
// without vscode, driven with injected sleep/random so every path — including
// the "async" ones — completes in microseconds and deterministically. If the
// import at the top of this file ever fails to load, vehicleCommands.ts grew
// a vscode dependency and the whole layer stopped being testable.
// ────────────────────────────────────────────────────────────────────────────

console.log("");
console.log("commands: latency");

// The latency function, not a stopwatch: executeVehicleCommand awaits exactly
// what this returns, so proving the function's bounds over a spread of seeds
// proves the layer's bounds without ever sleeping for real.
{
	let inBounds = true;
	let low = Infinity;
	let high = -Infinity;
	for (let i = 0; i < 500; i++) {
		const ms = commandLatencyMs(`VIN${i}:setDoorLock:${i * 7}`);
		if (ms < 600 || ms >= 900) inBounds = false;
		low = Math.min(low, ms);
		high = Math.max(high, ms);
	}
	check("commandLatencyMs stays within 600–900 ms across 500 seeds", inBounds, `spread ${low}–${high} ms`);
	check("commandLatencyMs actually varies", high - low > 100, `spread ${high - low} ms`);
	check(
		"commandLatencyMs is deterministic per seed",
		commandLatencyMs("seed:a:1") === commandLatencyMs("seed:a:1")
	);
}

console.log("");
console.log("commands: state-derived rejections");

const sim2 = new FleetSimulator(T0);
const atlas2 = sim2.getVehicles().find((v) => v.personality === "driving")!;
const beacon2 = sim2.getVehicles().find((v) => v.personality === "charging")!;
const cinder2 = sim2.getVehicles().find((v) => v.personality === "asleep")!;
const dune2 = sim2.getVehicles().find((v) => v.personality === "faulted")!;
const ember2 = sim2.getVehicles().find((v) => v.id === "ember")!;

// Test seams: capture the delay instead of waiting it out, and pin the
// spurious-UNREACHABLE dice so rejections stay state-derived here.
const requestedDelays: number[] = [];
const instant = (ms: number): Promise<void> => {
	requestedDelays.push(ms);
	return Promise.resolve();
};
const neverSpurious = () => 0.99;
const alwaysSpurious = () => 0.0;
const opts = { sleep: instant, random: neverSpurious };

const asleepResult = await executeVehicleCommand(sim2, cinder2.vin, { kind: "setVehicleLocked", locked: true }, opts);
check("ASLEEP: any command against Cinder", !asleepResult.ok && asleepResult.reason === "ASLEEP", JSON.stringify(asleepResult));

const motionResult = await executeVehicleCommand(sim2, atlas2.vin, { kind: "setVehicleLocked", locked: true }, opts);
check(
	"IN_MOTION: locking Atlas while it drives",
	!motionResult.ok && motionResult.reason === "IN_MOTION" && motionResult.detail.includes("km/h"),
	JSON.stringify(motionResult)
);

const doorOpenResult = await executeVehicleCommand(sim2, dune2.vin, { kind: "setVehicleLocked", locked: true }, opts);
check(
	"DOOR_OPEN: locking Dune with its FL door ajar",
	!doorOpenResult.ok && doorOpenResult.reason === "DOOR_OPEN" && doorOpenResult.detail.includes("FL"),
	JSON.stringify(doorOpenResult)
);
check("DOOR_OPEN rejection left Dune unlocked", dune2.locked === false);

const chargingResult = await executeVehicleCommand(sim2, beacon2.vin, { kind: "unlatchChargePort" }, opts);
check(
	"CHARGING_IN_PROGRESS: unlatching Beacon mid-session",
	!chargingResult.ok && chargingResult.reason === "CHARGING_IN_PROGRESS",
	JSON.stringify(chargingResult)
);
check("rejection left Beacon plugged in", beacon2.charge.pluggedIn === true);

// Unlocking a door with the vehicle parked is the clean success path — and
// success must actually mutate, or the layer is latency theatre.
const successResult = await executeVehicleCommand(
	sim2,
	ember2.vin,
	{ kind: "setDoorLock", door: "FL", locked: false },
	opts
);
check("success path resolves ok", successResult.ok === true, JSON.stringify(successResult));
check("success path mutated the door", ember2.doors.FL.locked === false && ember2.locked === false);

const spuriousResult = await executeVehicleCommand(
	sim2,
	ember2.vin,
	{ kind: "setDoorLock", door: "FL", locked: true },
	{ sleep: instant, random: alwaysSpurious }
);
check(
	"spurious UNREACHABLE fires on an otherwise-valid command",
	!spuriousResult.ok && spuriousResult.reason === "UNREACHABLE",
	JSON.stringify(spuriousResult)
);
check("spurious failure did NOT mutate", ember2.doors.FL.locked === false);

const unknownResult = await executeVehicleCommand(sim2, "NOSUCHVIN000000000", { kind: "unlatchChargePort" }, opts);
check("unknown VIN resolves UNREACHABLE", !unknownResult.ok && unknownResult.reason === "UNREACHABLE");

check(
	"every command waited a 600–900 ms latency",
	requestedDelays.length >= 6 && requestedDelays.every((ms) => ms >= 600 && ms < 900),
	`${requestedDelays.length} commands, ${Math.min(...requestedDelays)}–${Math.max(...requestedDelays)} ms`
);

// The policy alone, as a pure function — the property that makes rejections
// reproducible from visible state instead of dice.
check(
	"evaluateVehicleCommand is pure over the same state",
	JSON.stringify(evaluateVehicleCommand(atlas2, { kind: "setVehicleLocked", locked: true })) ===
		JSON.stringify(evaluateVehicleCommand(atlas2, { kind: "setVehicleLocked", locked: true }))
);

console.log("");
console.log("commands: wake and sleep");

check("wake transitions Cinder asleep → online idler", sim2.wake(cinder2.vin) === true && cinder2.online && cinder2.personality === "idle");
check("wake on an awake vehicle is a no-op", sim2.wake(cinder2.vin) === false);
const awakeResult = await executeVehicleCommand(sim2, cinder2.vin, { kind: "setVehicleLocked", locked: true }, opts);
check("commands succeed against the woken vehicle", awakeResult.ok === true);
check("sleep is wake's inverse", sim2.sleep(cinder2.vin) === true && !cinder2.online && cinder2.personality === "asleep");
check("sleep refuses a moving vehicle", sim2.sleep(atlas2.vin) === false);

console.log("");
console.log("ota: precondition evaluation across all personalities");

const atlasOta = evaluateOtaPreconditions(atlas2);
check(
	"driving (Atlas): NOT_IN_PARK with the UDS shifter detail",
	atlasOta?.reason === "NOT_IN_PARK" && atlasOta.detail === "conditionsNotCorrect (0x22): shifterLeverNotInPark (0x90)",
	atlasOta?.detail ?? "null"
);
const duneOta = evaluateOtaPreconditions(dune2);
check("faulted at 7% SoC (Dune): LOW_BATTERY", duneOta?.reason === "LOW_BATTERY", duneOta?.detail ?? "null");
check("asleep (Cinder): ASLEEP", evaluateOtaPreconditions(cinder2)?.reason === "ASLEEP");
check("charging in P (Beacon) is eligible", evaluateOtaPreconditions(beacon2) === null);
check("idle (Ember) is eligible", evaluateOtaPreconditions(ember2) === null);
check(
	"progress increments sum to exactly 100",
	OTA_STAGE_INCREMENTS.download + OTA_STAGE_INCREMENTS.verify + OTA_STAGE_INCREMENTS.flash + OTA_STAGE_INCREMENTS.reboot === 100
);
check("six named ECUs to flash", OTA_ECUS.length === 6, OTA_ECUS.join(", "));

console.log("");
console.log("ota: simulator transitions");

const ambientEvents: AmbientEvent[] = [];
sim2.onAmbientEvent((event) => ambientEvents.push(event));
const versionBefore = ember2.firmwareVersion;

check("beginOtaUpdate marks downloading", sim2.beginOtaUpdate(ember2.vin, OTA_TARGET_VERSION) === true && ember2.softwareUpdate.status === "downloading");
check("a second begin while in flight is refused", sim2.beginOtaUpdate(ember2.vin, OTA_TARGET_VERSION) === false);
sim2.setOtaProgress(ember2.vin, { downloadPerc: 62 });
check("download progress lands in the model", ember2.softwareUpdate.downloadPerc === 62);
const otaStateJson = JSON.parse(sim2.serializeState(ember2.vin)) as Record<string, any>;
check(
	"state.json mirrors the in-flight update",
	otaStateJson.vehicle_state.software_update.status === "downloading" &&
		otaStateJson.vehicle_state.software_update.download_perc === 62 &&
		otaStateJson.vehicle_state.software_update.version === OTA_TARGET_VERSION
);
sim2.setOtaProgress(ember2.vin, { status: "installing", installPerc: 40 });
check("progress flips downloading → installing", ember2.softwareUpdate.status === "installing" && ember2.softwareUpdate.installPerc === 40);
check(
	"completeOta bumps the version and resets the update block",
	sim2.completeOta(ember2.vin) === true &&
		ember2.firmwareVersion === OTA_TARGET_VERSION &&
		ember2.softwareUpdate.status === "" &&
		ember2.softwareUpdate.downloadPerc === 0,
	`${versionBefore} → ${ember2.firmwareVersion}`
);
check(
	"completeOta emitted the ota-complete ambient event",
	ambientEvents.some((e) => e.kind === "ota-complete" && e.vin === ember2.vin && e.message.includes(OTA_TARGET_VERSION)),
	ambientEvents.map((e) => e.kind).join(", ") || "none"
);

const fathom2 = sim2.getVehicles().find((v) => v.id === "fathom")!;
const fathomVersion = fathom2.firmwareVersion;
sim2.beginOtaUpdate(fathom2.vin, OTA_TARGET_VERSION);
sim2.setOtaProgress(fathom2.vin, { downloadPerc: 30 });
check(
	"cancelOta restores idle without touching the installed version",
	sim2.cancelOta(fathom2.vin) === true && fathom2.firmwareVersion === fathomVersion && fathom2.softwareUpdate.status === "",
	fathom2.firmwareVersion
);
check("begin against an asleep vehicle is refused", sim2.beginOtaUpdate(cinder2.vin, OTA_TARGET_VERSION) === false);

console.log("");
console.log("sim: bus targeting");

sim2.drainFrames(10_000);
check("setBusTarget rejects unknown VINs", sim2.setBusTarget("NOSUCHVIN000000000") === false);
check("setBusTarget accepts a fleet VIN and flushes the ring", sim2.setBusTarget(cinder2.vin) === true && sim2.bufferedFrameCount === 0);
let now2 = T0 + 60_000;
for (let i = 0; i < 8; i++) {
	now2 += 250;
	sim2.tick(now2);
}
check("an asleep bus target yields silence", sim2.bufferedFrameCount === 0, `${sim2.bufferedFrameCount} frames`);
sim2.setBusTarget(atlas2.vin);
check("bus target resolves to the retargeted VIN", sim2.getBusTargetVin() === atlas2.vin);
for (let i = 0; i < 8; i++) {
	now2 += 250;
	sim2.tick(now2);
}
check("retargeting to an online vehicle resumes traffic", sim2.bufferedFrameCount > 0, `${sim2.bufferedFrameCount} frames`);

console.log("");
console.log("can: annotation decoding");

// Exact round trip at a lattice point of the 0.08 factor: (100+40)/0.08 is a
// whole raw value, so encode→decode must reproduce 100.0 with no tolerance.
check(
	"DI_speed annotation decodes the encoded speed",
	decodeFrameAnnotation(encodeDiSpeed(T0, 100)) === "DI_speed  100.0 km/h",
	decodeFrameAnnotation(encodeDiSpeed(T0, 100))
);
check(
	"filler frames get no annotation",
	decodeFrameAnnotation({ timestamp: T0, id: 0x123, dlc: 8, data: [1, 2, 3, 4, 5, 6, 7, 8] }) === undefined
);

sim2.dispose();
console.log("");
if (failures > 0) {
	console.log(`${failures} check(s) failed`);
	process.exit(1);
}
console.log("all checks passed");
