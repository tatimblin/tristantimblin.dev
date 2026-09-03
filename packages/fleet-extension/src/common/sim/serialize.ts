import type { Vehicle } from "../model/types";

/**
 * Serializers for the virtual file system's file contents.
 *
 * The shape imitates the Tesla Owner API's `vehicle_data` response — nested
 * `charge_state` / `climate_state` / `drive_state` / `vehicle_state` blocks,
 * snake_case keys, the cryptic `df`/`pf`/`dr`/`pr` door fields — because that
 * is the JSON a reader poking at `state.json` may have actually seen before.
 * Recognition is the goal: a bespoke pretty schema would be *easier* to read
 * and less convincing for it.
 *
 * Departures from the real API, on purpose:
 *   - distances stay in kilometres (`battery_range_km`, `odometer_km` …). The
 *     real API reports miles; silently emitting km under mile-named keys would
 *     corrupt the one thing a decoder-savvy reader checks, and converting
 *     would violate the repo rule that canonical units convert only at the
 *     display edge. The `_km` suffix makes the unit self-describing instead.
 *   - `timestamp` fields are epoch milliseconds, matching the model types.
 *
 * These are pure functions over a `Vehicle` so the Bun selftest can assert on
 * the JSON without an extension host; the simulator wraps them as methods.
 */

/** Tesla door values: 0 = closed, nonzero = open. */
const door = (open: boolean): number => (open ? 1 : 0);

function chargingState(vehicle: Vehicle): string {
	if (!vehicle.charge.pluggedIn) return "Disconnected";
	if (vehicle.charge.charging) return "Charging";
	// Plugged in, not drawing: full enough that the charger stopped.
	return vehicle.charge.soc >= 90 ? "Complete" : "Stopped";
}

export function serializeVehicleState(vehicle: Vehicle): string {
	return JSON.stringify(
		{
			vin: vehicle.vin,
			display_name: vehicle.displayName,
			state: vehicle.online ? "online" : "asleep",
			charge_state: {
				battery_level: Math.round(vehicle.charge.soc),
				usable_battery_level: Math.max(0, Math.round(vehicle.charge.soc) - 2),
				battery_range_km: Math.round(vehicle.charge.rangeKm),
				charging_state: chargingState(vehicle),
				charge_port_door_open: vehicle.charge.pluggedIn,
				charger_power: Math.round(vehicle.charge.powerKw),
				battery_temp_c: Number(vehicle.charge.batteryTempC.toFixed(1)),
				timestamp: vehicle.lastUpdated
			},
			climate_state: {
				inside_temp: Number(vehicle.cabinTempC.toFixed(1)),
				is_climate_on: vehicle.climateOn,
				timestamp: vehicle.lastUpdated
			},
			drive_state: {
				// The real API reports `shift_state: null` while parked; mirroring
				// that quirk (rather than "P") is the kind of detail readers notice.
				shift_state: vehicle.gear === "P" ? null : vehicle.gear,
				speed_kph: Math.round(vehicle.speedKph),
				latitude: Number(vehicle.position.lat.toFixed(6)),
				longitude: Number(vehicle.position.lon.toFixed(6)),
				heading: Math.round(vehicle.position.heading),
				gps_as_of: vehicle.lastUpdated
			},
			vehicle_state: {
				// Doors, in the Owner API's harness order: driver front, driver
				// rear, passenger front, passenger rear. This demo's fleet is
				// left-hand drive, so driver = left.
				df: door(vehicle.doors.FL.open),
				dr: door(vehicle.doors.RL.open),
				pf: door(vehicle.doors.FR.open),
				pr: door(vehicle.doors.RR.open),
				// Front trunk / rear trunk. The model does not simulate them yet,
				// so they are honestly always closed rather than absent — a missing
				// key reads as a serializer bug, a closed trunk reads as a car.
				ft: 0,
				rt: 0,
				locked: vehicle.locked,
				odometer_km: Number(vehicle.odometerKm.toFixed(1)),
				car_version: vehicle.firmwareVersion,
				software_update: {
					status: "",
					version: " ",
					download_perc: 0,
					install_perc: 0
				},
				timestamp: vehicle.lastUpdated
			}
		},
		null,
		"\t"
	);
}

/**
 * `dtcs.json` — the stored trouble codes, newest last, as a scan tool would
 * dump them. Only vehicles that actually carry codes get this file at all (the
 * FS provider omits it otherwise): an empty-array file on five healthy
 * vehicles would train the reader to stop opening it.
 */
export function serializeDtcs(vehicle: Vehicle): string {
	return JSON.stringify(
		{
			vin: vehicle.vin,
			count: vehicle.dtcs.length,
			codes: vehicle.dtcs.map((dtc) => ({
				code: dtc.code,
				description: dtc.description,
				status: dtc.status,
				set_at: dtc.timestamp
			}))
		},
		null,
		"\t"
	);
}
