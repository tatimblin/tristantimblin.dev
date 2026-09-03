import type { Vehicle } from "./types";

/**
 * Derived *presentation status* for a vehicle: the badge a file decoration
 * paints, and the severity a trouble code deserves in the Problems panel.
 *
 * Both live here, in `model/`, rather than beside the providers that consume
 * them, for the same reason everything else in this directory does: no
 * `vscode` import, so the Bun selftest can assert on them directly. That is
 * not a stylistic preference here — the badge rule below is a *hard host
 * constraint* whose violation is silent (see `VehicleDecoration.badge`), and
 * a constraint nothing can test is a constraint nobody keeps.
 */

/** A file decoration, expressed without touching `vscode.FileDecoration`. */
export interface VehicleDecoration {
	/**
	 * The badge text. MUST be at most two grapheme clusters: VS Code validates
	 * this in `FileDecoration.validate`, and a longer badge does not render
	 * small — it throws inside the extension host and the decoration is
	 * dropped for that URI with no visible error. Two characters is also all
	 * the room the explorer gutter actually gives you.
	 */
	badge: string;
	tooltip: string;
	/** A `ThemeColor` id; the provider wraps it, so this file stays host-free. */
	colorId: string;
}

/** Below this state of charge a vehicle gets the low-battery badge. */
export const LOW_SOC_PERCENT = 20;

/**
 * Every badge this module can emit, as a flat list for the selftest to sweep
 * against the two-grapheme rule. Kept next to the function that produces them
 * so adding a fifth rule without adding its badge here is visible in review.
 */
export const DECORATION_BADGES: readonly string[] = ["!", "⚡", "%", "zz"];

/**
 * The decoration for one vehicle, or undefined for a vehicle with nothing
 * worth saying about it.
 *
 * Priority is strict and ordered worst-first: a faulted vehicle that also sits
 * below 20% SoC is a *fault*, and showing it the low-battery badge would bury
 * the more urgent fact under the less urgent one. Only one badge fits in the
 * gutter, so the ordering here is the whole design.
 */
export function decorationFor(vehicle: Vehicle): VehicleDecoration | undefined {
	if (vehicle.dtcs.length > 0) {
		return {
			badge: "!",
			tooltip: `${vehicle.dtcs.length} DTC${vehicle.dtcs.length === 1 ? "" : "s"}`,
			colorId: "list.errorForeground"
		};
	}
	if (vehicle.charge.charging) {
		return {
			badge: "⚡",
			tooltip: `Charging · ${Math.round(vehicle.charge.powerKw)} kW`,
			colorId: "charts.blue"
		};
	}
	if (vehicle.charge.soc < LOW_SOC_PERCENT) {
		return {
			badge: "%",
			tooltip: `Charge ${Math.round(vehicle.charge.soc)}%`,
			colorId: "list.warningForeground"
		};
	}
	if (!vehicle.online) {
		return {
			badge: "zz",
			tooltip: "Asleep",
			colorId: "list.deemphasizedForeground"
		};
	}
	return undefined;
}

/**
 * Severity tier for a stored trouble code, as a plain string the diagnostics
 * provider maps onto `vscode.DiagnosticSeverity`.
 *
 * The tiers are not arbitrary and they are not "P codes are worse than U
 * codes": they follow what the code actually costs the operator.
 *
 *   P0A80 (replace the pack) is a vehicle-out-of-service parts job — Error.
 *   P0562 (12V system voltage low) and U0100 (ECM off the bus) are the codes
 *     that make the *rest* of the diagnostics untrustworthy, because a browned
 *     -out module reports garbage — Warning, i.e. read me before you believe
 *     anything else here.
 *   Everything else — the pack temperature and state-of-charge codes — is
 *     downstream evidence of the first three. Information: real, logged, not
 *     independently actionable.
 */
export type DtcSeverity = "error" | "warning" | "information";

export function dtcSeverity(code: string): DtcSeverity {
	if (code === "P0A80") return "error";
	if (code === "P0562" || code === "U0100") return "warning";
	return "information";
}
