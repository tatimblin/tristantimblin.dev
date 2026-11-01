/**
 * The homepage's widgets, on the design system's widget runtime
 * (@whois/design-system/lib/widgets; how to add one: theme/design-system/
 * src/lib/WIDGETS.md).
 *
 * Every src/widgets/<name>/client.ts is a lazy entry, its own chunk
 * (widget-<name>, named by the plugin in astro.config.mjs), loaded only when
 * a <Widget name="<name>"> on the page comes due. Importing this module starts
 * the runtime: it binds on every page load, so a page without widgets costs
 * one querySelectorAll.
 */
import { startWidgets, type WidgetModule } from "@whois/design-system/lib/widgets";

const modules = import.meta.glob<WidgetModule>("./*/client.ts");

startWidgets(
	Object.fromEntries(
		Object.entries(modules).map(([path, load]) => [path.split("/")[1], load]),
	),
);
