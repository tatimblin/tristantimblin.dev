import * as vscode from "vscode";
import type { FleetSimulator } from "./sim/clock";
import { ControlsEditorProvider } from "./providers/controlsEditorProvider";

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

export function registerCommands(context: vscode.ExtensionContext, simulator: FleetSimulator): void {
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
			const affected = mutateOnlineVehicles(simulator, false);
			void vscode.window.showInformationMessage(
				`Fleet: unlocked ${affected} vehicle${affected === 1 ? "" : "s"} (asleep vehicles unreachable).`
			);
		}),

		vscode.commands.registerCommand("fleet.lockAllDoors", () => {
			const affected = mutateOnlineVehicles(simulator, true);
			void vscode.window.showInformationMessage(
				`Fleet: locked ${affected} vehicle${affected === 1 ? "" : "s"} (asleep vehicles unreachable).`
			);
		}),

		vscode.commands.registerCommand("fleet.reset", () => {
			simulator.reset();
			void vscode.window.showInformationMessage("Fleet: demo reset — six vehicles re-seeded.");
		}),

		vscode.commands.registerCommand("fleet.openCanStream", () => comingSoon("the CAN stream")),
		vscode.commands.registerCommand("fleet.switchVehicle", () => comingSoon("vehicle switching")),
		vscode.commands.registerCommand("fleet.installFirmwareUpdate", () => comingSoon("firmware updates"))
	);
}

/**
 * Lock/unlock every ONLINE vehicle; returns how many were touched. The asleep
 * vehicle is skipped — a command reaching a car that is not on the network
 * would break the fiction the personalities exist to maintain.
 */
function mutateOnlineVehicles(simulator: FleetSimulator, locked: boolean): number {
	let affected = 0;
	for (const vehicle of simulator.getVehicles()) {
		if (!vehicle.online) continue;
		simulator.setVehicleLocked(vehicle.vin, locked);
		affected++;
	}
	return affected;
}
