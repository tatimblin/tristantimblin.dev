import * as vscode from "vscode";
import type { FleetSimulator } from "../sim/clock";
import type { Vehicle } from "../model/types";

/**
 * The "Vehicles" tree (view id `fleetExplorer`): one flat row per vehicle,
 * with a live description that makes the fleet legible at a glance — SoC,
 * gear and speed for a mover, "asleep" for the offline one, a DTC count for
 * the faulted one.
 *
 * Refresh is THROTTLED, and that throttle is not an optimisation, it is
 * correctness of feel. The simulator ticks 4×/sec and the driving vehicle
 * changes on every tick; firing `onDidChangeTreeData` for each event makes
 * VS Code re-request and re-render rows fast enough that hover highlights
 * flicker and click targets move under the cursor. One coalesced refresh per
 * second keeps the row visibly alive while staying calmer than the pointer.
 */

/** Coalescing window for tree refreshes. */
const REFRESH_THROTTLE_MS = 1000;

export class FleetTreeProvider implements vscode.TreeDataProvider<Vehicle>, vscode.Disposable {
	private readonly changeEmitter = new vscode.EventEmitter<void>();
	readonly onDidChangeTreeData: vscode.Event<void> = this.changeEmitter.event;

	private readonly subscription: { dispose(): void };
	private throttleHandle: unknown = null;
	private disposed = false;

	constructor(private readonly simulator: FleetSimulator) {
		this.subscription = simulator.onVehicleChanged(() => this.scheduleRefresh());
	}

	dispose(): void {
		this.disposed = true;
		this.subscription.dispose();
		if (this.throttleHandle !== null) {
			clearTimeout(this.throttleHandle);
			this.throttleHandle = null;
		}
		this.changeEmitter.dispose();
	}

	getChildren(element?: Vehicle): Vehicle[] {
		// Flat list: vehicles at the root, nothing beneath them. The per-vehicle
		// files live in the fleet: file system, not in this tree — duplicating
		// them here would give two competing ways to open the same thing.
		if (element) return [];
		return [...this.simulator.getVehicles()];
	}

	getTreeItem(vehicle: Vehicle): vscode.TreeItem {
		// "Atlas · …042788" — the callsign plus enough VIN to correlate the row
		// with its fleet:/<VIN> directory without the full 17 characters eating
		// the sidebar.
		const item = new vscode.TreeItem(
			`${callsign(vehicle)} · …${vehicle.vin.slice(-6)}`,
			vscode.TreeItemCollapsibleState.None
		);

		// Stable id = VIN: without it, VS Code matches rows positionally across
		// refreshes and a selected row visually "jumps" vehicles when the list
		// re-renders.
		item.id = vehicle.vin;
		item.description = describeVehicle(vehicle);
		item.tooltip = `${vehicle.displayName}\n${vehicle.vin}`;
		item.contextValue = "vehicle";
		// The vehicle's directory in the fleet: scheme — inert today, but it is
		// what lets a future FileDecorationProvider badge faulted rows, and it
		// makes "Reveal" style commands line up with the file system.
		item.resourceUri = vscode.Uri.parse(`fleet:/${vehicle.vin}`);
		item.iconPath = new vscode.ThemeIcon(iconFor(vehicle));
		item.command = {
			command: "fleet.openControls",
			title: "Open Vehicle Controls",
			arguments: [vehicle.vin]
		};
		return item;
	}

	/**
	 * Trailing-edge throttle: the first event starts a timer; every event
	 * inside the window rides along with it. (A leading-edge fire would still
	 * allow one refresh per event under a 1 Hz event stream — exactly the load
	 * pattern the simulator produces.)
	 */
	private scheduleRefresh(): void {
		if (this.disposed || this.throttleHandle !== null) return;
		this.throttleHandle = setTimeout(() => {
			this.throttleHandle = null;
			if (!this.disposed) {
				this.changeEmitter.fire();
			}
		}, REFRESH_THROTTLE_MS);
	}
}

/** "Atlas — Ocean Extreme" → "Atlas". */
export function callsign(vehicle: Vehicle): string {
	return vehicle.displayName.split(" — ")[0] ?? vehicle.displayName;
}

/**
 * The live status column. Priority: asleep > faulted > telemetry.
 *
 * Exported because the quick-pick switcher and the status-bar tooltip show
 * the same status next to the same vehicle. Two formatters would drift by a
 * separator or a rounding rule, and a user comparing the tree row against the
 * switcher entry for the vehicle they are about to open would see the demo
 * disagree with itself in the one moment they are looking hardest.
 */
export function describeVehicle(vehicle: Vehicle): string {
	if (!vehicle.online) return "asleep";
	if (vehicle.dtcs.length > 0) {
		return `⚠ ${vehicle.dtcs.length} DTC${vehicle.dtcs.length === 1 ? "" : "s"}`;
	}

	const soc = `${Math.round(vehicle.charge.soc)}%`;
	if (vehicle.speedKph > 0) {
		return `${soc} · ${vehicle.gear} · ${Math.round(vehicle.speedKph)} km/h`;
	}
	if (vehicle.charge.charging) {
		return `${soc} · ⚡ ${Math.round(vehicle.charge.powerKw)} kW`;
	}
	return `${soc} · ${vehicle.gear}`;
}

/**
 * Codicon id per personality, so states are scannable before reading a word.
 *
 * Exported for the same reason `describeVehicle` is: the quick-pick switcher
 * puts the same glyph in front of the same vehicle via `$(id)` syntax in its
 * label, and a second copy of this ladder would let the tree and the switcher
 * disagree about what a vehicle is doing.
 */
export function iconFor(vehicle: Vehicle): string {
	if (!vehicle.online) return "circle-slash";
	if (vehicle.dtcs.length > 0) return "warning";
	if (vehicle.charge.charging) return "zap";
	if (vehicle.speedKph > 0) return "arrow-right";
	return "circle-large-outline";
}
