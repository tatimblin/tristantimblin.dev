import * as vscode from "vscode";
import type { FleetSimulator } from "./sim/clock";
import { ControlsEditorProvider } from "./providers/controlsEditorProvider";
import type { CanStreamManager } from "./providers/canTerminal";
import { executeVehicleCommand } from "./vehicleCommands";
import { runOtaFlow } from "./otaFlow";

/**
 * Every command the manifest declares, registered in one place.
 *
 * The rule that keeps this file honest: `contributes.commands` in package.json
 * and the registrations here must stay in lockstep. A declared-but-unregistered
 * command still shows in the palette and fails with "command not found" when
 * invoked — the most embarrassing possible failure for a demo — so commands
 * whose real implementation lands in the next unit are registered *here and
 * now* with a courteous placeholder toast instead of being left dangling.
 */

/** Placeholder for features that ship in the next unit. */
function comingSoon(feature: string): void {
	void vscode.window.showInformationMessage(
		`Fleet: ${feature} arrives in the next update — this build wires the explorer and controls.`
	);
}

export function registerCommands(
	context: vscode.ExtensionContext,
	simulator: FleetSimulator,
	canStreams: CanStreamManager
): void {
	context.subscriptions.push(
		/**
		 * Internal navigation command — the tree rows and future deep links call
		 * it with a VIN. Declared in the manifest (VS Code warns on undeclared
		 * commands in tree item bindings) but hidden from the palette via a
		 * `menus.commandPalette` `"when": "false"` entry, because palette users
		 * have no way to supply the argument and the no-arg fallback silently
		 * picking a vehicle would be a confusing palette experience.
		 */
		vscode.commands.registerCommand("fleet.openControls", (vin?: string) => {
			const target = vin ?? simulator.getVehicles()[0]?.vin;
			if (!target) return;
			void vscode.commands.executeCommand(
				"vscode.openWith",
				vscode.Uri.parse(`fleet:/${target}/controls.vehicle`),
				ControlsEditorProvider.viewType
			);
		}),

		vscode.commands.registerCommand("fleet.unlockAllDoors", () => {
			void mutateWholeFleet(simulator, false);
		}),

		vscode.commands.registerCommand("fleet.lockAllDoors", () => {
			void mutateWholeFleet(simulator, true);
		}),

		vscode.commands.registerCommand("fleet.reset", () => {
			simulator.reset();
			void vscode.window.showInformationMessage("Fleet: demo reset — six vehicles re-seeded.");
		}),

		/**
		 * Optionally takes a VIN (a future tree context menu / the switcher
		 * will pass one); bare palette invocations stream the current bus
		 * target, which defaults to the driving vehicle. The type guard
		 * matters: the palette invokes commands with undefined, but other
		 * surfaces can pass anything.
		 */
		vscode.commands.registerCommand("fleet.openCanStream", (vin?: unknown) => {
			canStreams.open(typeof vin === "string" ? vin : undefined);
		}),

		vscode.commands.registerCommand("fleet.installFirmwareUpdate", () => {
			void runOtaFlow(simulator);
		}),

		vscode.commands.registerCommand("fleet.switchVehicle", () => comingSoon("vehicle switching"))
	);
}

/**
 * Lock/unlock the whole fleet through the async command layer, one command
 * per vehicle, all in flight together. The layer's state-derived rejections
 * do the interesting work here: a fleet-wide lock legitimately fails for the
 * moving vehicle (IN_MOTION), the sleeping one (ASLEEP) and the one with a
 * door ajar (DOOR_OPEN), so the summary toast reads like a real dispatch
 * report — one toast, not six, because six simultaneous toasts train the
 * user to dismiss without reading.
 */
async function mutateWholeFleet(simulator: FleetSimulator, locked: boolean): Promise<void> {
	const verb = locked ? "locked" : "unlocked";
	const outcomes = await Promise.all(
		simulator.getVehicles().map(async (vehicle) => ({
			name: vehicle.displayName.split(" — ")[0] ?? vehicle.displayName,
			result: await executeVehicleCommand(simulator, vehicle.vin, { kind: "setVehicleLocked", locked })
		}))
	);

	const succeeded = outcomes.filter((o) => o.result.ok).length;
	const rejected = outcomes
		.filter((o) => !o.result.ok)
		.map((o) => `${o.name} (${o.result.ok ? "" : o.result.reason})`);

	const summary =
		`Fleet: ${verb} ${succeeded} of ${outcomes.length} vehicles` +
		(rejected.length > 0 ? ` · rejected: ${rejected.join(", ")}` : ".");
	if (rejected.length > 0) {
		void vscode.window.showWarningMessage(summary);
	} else {
		void vscode.window.showInformationMessage(summary);
	}
}
