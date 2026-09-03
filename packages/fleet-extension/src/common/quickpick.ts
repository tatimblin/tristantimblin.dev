import * as vscode from "vscode";
import type { FleetSimulator } from "./sim/clock";
import type { Vehicle } from "./model/types";
import type { CanStreamManager } from "./providers/canTerminal";
import { callsign, describeVehicle } from "./providers/fleetTreeProvider";

/**
 * `fleet.switchVehicle` — the palette-driven way into a vehicle, for people
 * who never open the sidebar.
 *
 * Built on `createQuickPick` rather than the one-liner `showQuickPick`,
 * because two of the things that make this feel like a real switcher are
 * simply not expressible in the convenience API:
 *
 *   - separators, so "Online" and "Asleep" are headings rather than a
 *     `[asleep]` prefix repeated down the list;
 *   - per-item buttons, so a row can offer a *second* action — open the CAN
 *     stream for that vehicle — without leaving the picker or occupying a
 *     whole extra row.
 *
 * The cost is owning the lifecycle by hand: `onDidHide` must dispose, or the
 * picker leaks its event registrations every time the user presses Escape.
 */

/** A row that stands for a vehicle; separators carry no VIN. */
interface VehicleItem extends vscode.QuickPickItem {
	vin?: string;
}

/** The button attached to every vehicle row. */
const CAN_BUTTON: vscode.QuickInputButton = {
	iconPath: new vscode.ThemeIcon("pulse"),
	tooltip: "Open CAN stream"
};

export function showVehicleQuickPick(simulator: FleetSimulator, canStreams: CanStreamManager): void {
	const picker = vscode.window.createQuickPick<VehicleItem>();
	picker.title = "Switch vehicle";
	picker.placeholder = "Name, VIN, or model";
	// The description carries the live telemetry and the detail carries the
	// full VIN and model, so filtering must reach both: typing "R1T", "5YJ" or
	// "charging" should all narrow the list, and by default the picker matches
	// the label alone.
	picker.matchOnDescription = true;
	picker.matchOnDetail = true;
	picker.items = buildItems(simulator.getVehicles());

	// Snapshot taken once, deliberately NOT refreshed on the simulator's tick:
	// reassigning `items` while a picker is open resets the active row and the
	// filter text, so a live-updating list would fight the user's typing. The
	// switcher is a moment, not a dashboard — the status bar is the thing that
	// stays current.

	picker.onDidTriggerItemButton((event) => {
		const vin = event.item.vin;
		picker.hide();
		if (vin) canStreams.open(vin);
	});

	picker.onDidAccept(() => {
		const vin = picker.selectedItems[0]?.vin;
		picker.hide();
		if (vin) {
			void vscode.commands.executeCommand("fleet.openControls", vin);
		}
	});

	picker.onDidHide(() => picker.dispose());
	picker.show();
}

/**
 * Group the fleet under "Online" / "Asleep" separators.
 *
 * A separator with nothing under it renders as a stray heading, so each group
 * is emitted only when it has members — which matters here because waking the
 * last sleeper genuinely empties one of the two groups.
 */
function buildItems(vehicles: readonly Vehicle[]): VehicleItem[] {
	const items: VehicleItem[] = [];
	const groups: Array<[string, Vehicle[]]> = [
		["Online", vehicles.filter((v) => v.online)],
		["Asleep", vehicles.filter((v) => !v.online)]
	];

	for (const [label, members] of groups) {
		if (members.length === 0) continue;
		items.push({ label, kind: vscode.QuickPickItemKind.Separator });
		for (const vehicle of members) {
			items.push({
				// The codicon renders inline in the label; `$(car)` is the one
				// glyph in the icon set that says "vehicle" without ambiguity.
				label: `$(car) ${callsign(vehicle)}`,
				description: describeVehicle(vehicle),
				// Full VIN here rather than in the label: 17 characters would
				// push the callsign off the left of a narrow picker, and the
				// detail line is also what `matchOnDetail` searches.
				detail: `${vehicle.vin} · ${vehicle.year} ${vehicle.make} ${vehicle.model}`,
				buttons: [CAN_BUTTON],
				vin: vehicle.vin
			});
		}
	}

	return items;
}
