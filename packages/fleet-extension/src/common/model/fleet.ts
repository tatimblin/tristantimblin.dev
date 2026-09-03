import { generateVin } from "./vin";
import type {
	DoorId,
	DoorState,
	Dtc,
	Vehicle,
	WindowState
} from "./types";

/**
 * The seeded demo fleet.
 *
 * Six vehicles, one per interesting state, chosen so that every feature the
 * extension contributes has something to point at the moment it is opened:
 * a moving vehicle for the CAN stream, a charging one for the gauges, an
 * offline one for the "asleep" empty state, a faulted one for the diagnostics
 * list, and two quiet ones so the tree does not look like every row is an
 * emergency.
 *
 * `seedFleet()` returns a *fresh* array of fresh objects on every call. This is
 * load-bearing: `fleet.reset` re-seeds by calling it again, and if it returned
 * a shared module-level constant the simulator's in-place mutations from the
 * previous session would still be sitting in it, so "Reset Demo" would reset
 * nothing.
 */

/** All four corners, in the order the controls webview lays them out. */
const DOOR_IDS: readonly DoorId[] = ["FL", "FR", "RL", "RR"];

/** Every door locked and closed — the state five of the six vehicles start in. */
function closedDoors(locked: boolean): Record<DoorId, DoorState> {
	return Object.fromEntries(
		DOOR_IDS.map((id) => [id, { locked, open: false }])
	) as Record<DoorId, DoorState>;
}

/** Every window fully up. */
function closedWindows(): Record<DoorId, WindowState> {
	return Object.fromEntries(
		DOOR_IDS.map((id) => [id, { position: 0 }])
	) as Record<DoorId, WindowState>;
}

/**
 * The faulted vehicle's stored trouble codes: real SAE codes with their real
 * titles, in the order a scan tool would list them (powertrain codes ascending,
 * then network codes).
 *
 * They tell one coherent story rather than being five unrelated codes, which is
 * what makes the diagnostics panel worth reading: the pack is degraded (P0A80)
 * and cannot hold charge (P0A7D) while running hot (P0A7E), which has dragged
 * the 12V system down (P0562) far enough that the ECM dropped off the bus
 * (U0100). A reader who knows OBD-II sees a failure chain; one who does not
 * still sees plausible codes.
 */
const FAULTED_DTC_SPECS: ReadonlyArray<{
	code: string;
	description: string;
	status: Dtc["status"];
	/** Minutes before "now" the code was set — newest last. */
	minutesAgo: number;
}> = [
	{ code: "P0A80", description: "Replace Hybrid Battery Pack", status: "confirmed", minutesAgo: 2874 },
	{ code: "P0A7D", description: "Hybrid Battery Pack State of Charge Low", status: "confirmed", minutesAgo: 1140 },
	{ code: "P0A7E", description: "Hybrid Battery Pack Over Temperature", status: "confirmed", minutesAgo: 412 },
	{ code: "P0562", description: "System Voltage Low", status: "confirmed", minutesAgo: 96 },
	{ code: "U0100", description: "Lost Communication With ECM/PCM \"A\"", status: "pending", minutesAgo: 11 }
];

const MINUTE_MS = 60_000;

/**
 * Build the demo fleet.
 *
 * @param now Epoch milliseconds treated as "the present" — injectable so tests
 *   and the selftest get stable timestamps instead of depending on wall clock.
 *   VINs do not depend on it: they are derived from the WMI/year/serial below,
 *   so a vehicle keeps the same VIN (and therefore the same VFS path) across
 *   resets and across extension-host restarts.
 */
export function seedFleet(now: number = Date.now()): Vehicle[] {
	return [
		// ── Driving ──────────────────────────────────────────────────────────────
		// Northbound on US-101 through Palo Alto, heading 328° (roughly NNW toward
		// San Francisco). Real coordinates on a real road, because the map preview
		// in the controls editor plots them and a point in the ocean reads as a bug.
		{
			id: "atlas",
			vin: generateVin({ wmi: "5YJ", year: 2024, serial: 118342, plant: "F" }),
			displayName: "Atlas — Model 3 Long Range",
			make: "Tesla",
			model: "Model 3 Long Range",
			year: 2024,
			personality: "driving",
			online: true,
			locked: true,
			doors: closedDoors(true),
			windows: closedWindows(),
			gear: "D",
			speedKph: 103,
			odometerKm: 41_286,
			cabinTempC: 21,
			climateOn: true,
			charge: {
				soc: 62,
				rangeKm: 372,
				pluggedIn: false,
				charging: false,
				powerKw: 0,
				batteryTempC: 32
			},
			position: { lat: 37.4419, lon: -122.143, heading: 328 },
			dtcs: [],
			firmwareVersion: "2024.44.25.2",
			lastUpdated: now
		},

		// ── Charging ─────────────────────────────────────────────────────────────
		// Mid-range SoC and mid-taper power: a pack at 54% is past the flat 250 kW
		// plateau but not yet into the slow tail, so the gauge visibly moves during
		// a demo instead of sitting still.
		{
			id: "beacon",
			vin: generateVin({ wmi: "7SA", year: 2025, serial: 204915, plant: "A" }),
			displayName: "Beacon — Model Y Performance",
			make: "Tesla",
			model: "Model Y Performance",
			year: 2025,
			personality: "charging",
			online: true,
			locked: true,
			doors: closedDoors(true),
			windows: closedWindows(),
			gear: "P",
			speedKph: 0,
			odometerKm: 12_904,
			cabinTempC: 19,
			climateOn: false,
			charge: {
				soc: 54,
				rangeKm: 268,
				pluggedIn: true,
				charging: true,
				powerKw: 147,
				batteryTempC: 38
			},
			// Supercharger site off I-5 in Kettleman City, CA.
			position: { lat: 35.9891, lon: -119.9601, heading: 0 },
			dtcs: [],
			firmwareVersion: "2025.8.4",
			lastUpdated: now
		},

		// ── Asleep ───────────────────────────────────────────────────────────────
		// `online: false` is the point of this one: it is the fleet's empty state.
		// Its telemetry is a snapshot from the last time it was awake, and the
		// simulator must leave it alone — a sleeping vehicle whose odometer creeps
		// up is the classic mock-data tell.
		{
			id: "cinder",
			vin: generateVin({ wmi: "7PD", year: 2024, serial: 8871, plant: "N" }),
			displayName: "Cinder — R1S Adventure",
			make: "Rivian",
			model: "R1S Adventure",
			year: 2024,
			personality: "asleep",
			online: false,
			locked: true,
			doors: closedDoors(true),
			windows: closedWindows(),
			gear: "P",
			speedKph: 0,
			odometerKm: 28_431,
			cabinTempC: 8,
			climateOn: false,
			charge: {
				soc: 71,
				rangeKm: 349,
				pluggedIn: false,
				charging: false,
				powerKw: 0,
				batteryTempC: 9
			},
			// A residential street in Bend, OR.
			position: { lat: 44.0582, lon: -121.3153, heading: 92 },
			dtcs: [],
			firmwareVersion: "2024.38.1",
			lastUpdated: now - 6 * 60 * MINUTE_MS
		},

		// ── Faulted ──────────────────────────────────────────────────────────────
		// Low SoC, hot pack, doors unlocked and one ajar: the state you would
		// actually find a vehicle in after the failure chain in FAULTED_DTC_SPECS.
		{
			id: "dune",
			vin: generateVin({ wmi: "50E", year: 2023, serial: 3067, plant: "C" }),
			displayName: "Dune — Air Grand Touring",
			make: "Lucid",
			model: "Air Grand Touring",
			year: 2023,
			personality: "faulted",
			online: true,
			locked: false,
			doors: {
				...closedDoors(false),
				// Left ajar when the tech walked away from it.
				FL: { locked: false, open: true }
			},
			windows: { ...closedWindows(), FL: { position: 35 } },
			gear: "P",
			speedKph: 0,
			odometerKm: 96_772,
			cabinTempC: 27,
			climateOn: false,
			charge: {
				soc: 7,
				rangeKm: 31,
				pluggedIn: false,
				charging: false,
				powerKw: 0,
				batteryTempC: 54
			},
			// Service yard in Casa Grande, AZ.
			position: { lat: 32.8795, lon: -111.7574, heading: 180 },
			dtcs: FAULTED_DTC_SPECS.map((spec) => ({
				code: spec.code,
				description: spec.description,
				status: spec.status,
				timestamp: now - spec.minutesAgo * MINUTE_MS
			})),
			firmwareVersion: "2.4.7",
			lastUpdated: now
		},

		// ── Idle ×2 ──────────────────────────────────────────────────────────────
		// Parked, awake, nothing happening. Two of them, so the tree view has a
		// majority of boring rows and the interesting ones stand out.
		{
			id: "ember",
			vin: generateVin({ wmi: "7FC", year: 2025, serial: 15530, plant: "N" }),
			displayName: "Ember — R1T Quad-Motor",
			make: "Rivian",
			model: "R1T Quad-Motor",
			year: 2025,
			personality: "idle",
			online: true,
			locked: true,
			doors: closedDoors(true),
			windows: closedWindows(),
			gear: "P",
			speedKph: 0,
			odometerKm: 7_215,
			cabinTempC: 16,
			climateOn: false,
			charge: {
				soc: 88,
				rangeKm: 421,
				pluggedIn: true,
				// Plugged in but full enough that the charger has stopped — this is
				// why `pluggedIn` and `charging` are separate flags on ChargeState.
				charging: false,
				powerKw: 0,
				batteryTempC: 18
			},
			// Depot lot in Normal, IL.
			position: { lat: 40.5142, lon: -88.9906, heading: 270 },
			dtcs: [],
			firmwareVersion: "2025.6.0",
			lastUpdated: now
		},
		{
			id: "fathom",
			vin: generateVin({ wmi: "5YJ", year: 2022, serial: 77104, plant: "F" }),
			displayName: "Fathom — Model 3 Standard Range",
			make: "Tesla",
			model: "Model 3 Standard Range Plus",
			year: 2022,
			personality: "idle",
			online: true,
			locked: true,
			doors: closedDoors(true),
			windows: closedWindows(),
			gear: "P",
			speedKph: 0,
			odometerKm: 63_940,
			cabinTempC: 14,
			climateOn: false,
			charge: {
				soc: 45,
				rangeKm: 187,
				pluggedIn: false,
				charging: false,
				powerKw: 0,
				batteryTempC: 15
			},
			// Street parking in Seattle, WA.
			position: { lat: 47.6205, lon: -122.3493, heading: 5 },
			dtcs: [],
			firmwareVersion: "2023.44.30.4",
			lastUpdated: now
		}
	];
}
