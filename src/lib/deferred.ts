/**
 * Deferred markup: content that only exists at the breakpoint that shows it.
 *
 * <Deferred media="…"> (src/components/Deferred.astro) renders its children
 * into a <template data-deferred="<media query>"> and an inline script right
 * behind it that, during parse, inserts a copy of them before the template
 * when the query matches — so the matching variant is in the DOM before first
 * paint, exactly where it was authored, and a variant whose breakpoint hides it
 * (`display: none`) is never created at all. That is the point: a hidden
 * <dotted-grid> still makes a WebGL context and downloads its video.
 *
 * This module is the rest of the job, for the cases the parse-time script
 * cannot see: a viewport that crosses a breakpoint later (the other variant is
 * created when its query starts to match, and the first is left in place,
 * hidden by its CSS as before), and a view-transition navigation (the swapped-in
 * page's templates are materialised on astro:page-load if the inline script did
 * not already). Content is only ever added, never torn down.
 */
import { onPage } from "@whois/design-system/lib/lifecycle";

const PENDING = "template[data-deferred]:not([data-materialized])";

/** Insert one template's content before it, once. */
function insert(template: HTMLTemplateElement): void {
	if (template.hasAttribute("data-materialized")) return;
	template.before(template.content.cloneNode(true));
	template.setAttribute("data-materialized", "");
}

/**
 * Materialise every pending deferred template under `root` whose media query
 * matches now. Returns the templates still pending.
 */
export function materialize(root: ParentNode = document): HTMLTemplateElement[] {
	const pending: HTMLTemplateElement[] = [];
	for (const template of root.querySelectorAll<HTMLTemplateElement>(PENDING)) {
		const query = template.dataset.deferred ?? "";
		if (!query || window.matchMedia(query).matches) insert(template);
		else pending.push(template);
	}
	return pending;
}

/**
 * Materialise on each page load, then watch the still-pending templates'
 * queries until they match (or the page is swapped away).
 */
export function bindDeferred(): void {
	onPage(() => {
		const offs: Array<() => void> = [];
		for (const template of materialize()) {
			const mq = window.matchMedia(template.dataset.deferred!);
			const onChange = () => {
				if (!mq.matches) return;
				insert(template);
				mq.removeEventListener("change", onChange);
			};
			mq.addEventListener("change", onChange);
			offs.push(() => mq.removeEventListener("change", onChange));
		}
		return () => offs.forEach((off) => off());
	});
}
