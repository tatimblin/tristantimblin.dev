import * as monaco from "monaco-editor";
import {
	initialize as initializeMonacoService,
	getService,
	IWorkbenchLayoutService,
	LogLevel,
	type IWorkbenchConstructionOptions
} from "@codingame/monaco-vscode-api";
import getWorkbenchServiceOverride, {
	Parts
} from "@codingame/monaco-vscode-workbench-service-override";
import getQuickAccessServiceOverride from "@codingame/monaco-vscode-quickaccess-service-override";
import getConfigurationServiceOverride, {
	initUserConfiguration
} from "@codingame/monaco-vscode-configuration-service-override";
import getKeybindingsServiceOverride from "@codingame/monaco-vscode-keybindings-service-override";
import getModelServiceOverride from "@codingame/monaco-vscode-model-service-override";
import getExtensionServiceOverride from "@codingame/monaco-vscode-extensions-service-override";
import getLanguagesServiceOverride from "@codingame/monaco-vscode-languages-service-override";
import getTextmateServiceOverride from "@codingame/monaco-vscode-textmate-service-override";
import getThemeServiceOverride from "@codingame/monaco-vscode-theme-service-override";
import getNotificationsServiceOverride from "@codingame/monaco-vscode-notifications-service-override";
import getDialogsServiceOverride from "@codingame/monaco-vscode-dialogs-service-override";
import getStorageServiceOverride from "@codingame/monaco-vscode-storage-service-override";
import getLifecycleServiceOverride from "@codingame/monaco-vscode-lifecycle-service-override";
import getLogServiceOverride from "@codingame/monaco-vscode-log-service-override";
import getTerminalServiceOverride from "@codingame/monaco-vscode-terminal-service-override";
import getMarkersServiceOverride from "@codingame/monaco-vscode-markers-service-override";
import getExplorerServiceOverride from "@codingame/monaco-vscode-explorer-service-override";
import {
	RegisteredFileSystemProvider,
	RegisteredMemoryFile,
	registerFileSystemOverlay
} from "@codingame/monaco-vscode-files-service-override";
import "@codingame/monaco-vscode-theme-defaults-default-extension";
import "vscode/localExtensionHost";

import { activateFleetExtension } from "./extension-host";

// ---------------------------------------------------------------------------
// Messaging back to <fleet-demo> (the page always lives in its iframe; when
// opened directly there is no listener and the posts are harmless no-ops).
// ---------------------------------------------------------------------------
function post(message: { type: string; pct?: number; message?: string }) {
	if (window.parent !== window) {
		window.parent.postMessage(message, "*");
	}
}
const progress = (pct: number) => post({ type: "fleet-demo:progress", pct });

async function boot() {
	progress(5);

	// --- workers -------------------------------------------------------------
	const workers: Partial<Record<string, () => Worker>> = {
		editorWorkerService: () =>
			new Worker(new URL("monaco-editor/esm/vs/editor/editor.worker.js", import.meta.url), {
				type: "module"
			}),
		extensionHostWorkerMain: () =>
			new Worker(
				new URL("@codingame/monaco-vscode-api/workers/extensionHost.worker", import.meta.url),
				{ type: "module" }
			),
		TextMateWorker: () =>
			new Worker(
				new URL("@codingame/monaco-vscode-textmate-service-override/worker", import.meta.url),
				{ type: "module" }
			)
	};

	self.MonacoEnvironment = {
		getWorker(_, label) {
			const factory = workers[label];
			if (factory == null) throw new Error(`Unknown worker: ${label}`);
			return factory();
		}
	};

	// --- workspace (in-memory) ----------------------------------------------
	// A tiny memfs folder keeps the Explorer meaningful; the fleet: virtual
	// file system arrives when the extension activates. Opening fleet:/ as the
	// workspace instead would race the provider registration, so the folder
	// stays local and the Fleet activity-bar view carries the demo.
	const fsProvider = new RegisteredFileSystemProvider(false);
	fsProvider.registerFile(
		new RegisteredMemoryFile(
			monaco.Uri.file("/workspace/README.md"),
			[
				"# Fleet demo",
				"",
				"This is real VS Code running in your browser, with a fleet-management",
				"extension installed. Open the Fleet icon in the activity bar, pick a",
				"vehicle, and poke around: the CAN stream, the vehicle controls, the",
				"trouble codes in the Problems panel — all simulated, all live.",
				""
			].join("\n")
		)
	);
	registerFileSystemOverlay(1, fsProvider);

	// BEFORE init, per the monaco-vscode-api contract: the configuration
	// service reads this snapshot during initialize. gpuAcceleration off keeps
	// the terminal DOM-rendered (screen-reader- and Playwright-visible text
	// instead of a canvas).
	await initUserConfiguration(
		JSON.stringify({
			"workbench.colorTheme": "Default Dark Modern",
			"window.commandCenter": false,
			"workbench.activityBar.location": "default",
			"terminal.integrated.gpuAcceleration": "off"
		})
	);
	progress(20);

	// --- construct + init ----------------------------------------------------
	const constructOptions: IWorkbenchConstructionOptions = {
		workspaceProvider: {
			trusted: true,
			async open() {
				return false;
			},
			workspace: { folderUri: monaco.Uri.file("/workspace") }
		},
		developmentOptions: { logLevel: LogLevel.Error },
		defaultLayout: {
			editors: [{ uri: monaco.Uri.file("/workspace/README.md") }],
			force: true
		},
		productConfiguration: {
			nameShort: "Fleet demo",
			nameLong: "Fleet demo — VS Code in the browser"
		}
	};

	const container = document.getElementById("workbench")!;

	// NOTE deliberately absent: views-service-override. It silently corrupts
	// the workbench grid when combined with workbench-service-override (editor
	// collapses to 0px). Workbench only — webviews ride in transitively.
	await initializeMonacoService(
		{
			...getLogServiceOverride(),
			...getExtensionServiceOverride(),
			...getModelServiceOverride(),
			...getConfigurationServiceOverride(),
			...getKeybindingsServiceOverride(),
			...getTextmateServiceOverride(),
			...getThemeServiceOverride(),
			...getLanguagesServiceOverride(),
			...getNotificationsServiceOverride(),
			...getDialogsServiceOverride(),
			...getStorageServiceOverride(),
			...getLifecycleServiceOverride(),
			...getTerminalServiceOverride(),
			...getMarkersServiceOverride(),
			...getExplorerServiceOverride(),
			...getWorkbenchServiceOverride(),
			...getQuickAccessServiceOverride({
				isKeybindingConfigurationVisible: () => true,
				shouldUseGlobalPicker: () => true
			})
		},
		container,
		constructOptions,
		{}
	);
	progress(60);
	document.getElementById("boot-indicator")?.remove();

	// Fresh profiles start with the bottom panel collapsed; give it real
	// height so the CAN stream terminal has somewhere visible to land.
	const layoutService = await getService(IWorkbenchLayoutService);
	layoutService.setPartHidden(false, Parts.PANEL_PART);
	layoutService.resizePart(Parts.PANEL_PART, 0, 260);

	// --- the fleet extension --------------------------------------------------
	const api = await activateFleetExtension();
	progress(80);

	// Land the reader in the Fleet view container so the vehicle tree is the
	// first thing they see. (The manifest's walkthrough is NOT opened here:
	// monaco-vscode-api 36.2.7 stubs the walkthroughs extension point — its
	// handler is a no-op, so extension-contributed walkthroughs can never
	// register in the embed. The contribution still works in real VS Code and
	// vscode-test-web; the README stands in as the demo's opening editor.)
	await api.commands.executeCommand("workbench.view.extension.fleet");
	progress(90);

	// Playwright / debugging probe.
	(window as unknown as Record<string, unknown>).__fleetDemo = { api };

	// "Ready" means the vehicle tree actually rendered rows, not merely that
	// activate() returned — the parent swaps its poster for the iframe on this
	// signal and must never reveal an empty sidebar.
	const deadline = Date.now() + 30_000;
	while (Date.now() < deadline) {
		const rows = container.querySelectorAll(".part.sidebar .monaco-list-row");
		if (rows.length > 0) {
			post({ type: "fleet-demo:ready" });
			return;
		}
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
	throw new Error("fleet tree never rendered");
}

boot().catch((error) => {
	console.error("[fleet-demo] boot failed", error);
	const indicator = document.getElementById("boot-indicator");
	if (indicator != null) indicator.textContent = "The demo failed to start.";
	post({ type: "fleet-demo:error", message: error instanceof Error ? error.message : String(error) });
});
