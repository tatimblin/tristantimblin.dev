import type * as vscode from "vscode";

/**
 * The shared activation path.
 *
 * Everything the extension actually does lives under `src/common/` and is
 * entered from here, so the desktop (Node) and browser (Web Worker) entry
 * points differ only in their thin wrapper. That split is what lets the same
 * build power both a real `--extensionDevelopmentPath` F5 session and the
 * monaco-vscode-api embed in the blog post without a second implementation
 * drifting away from the first.
 *
 * Right now this is a stub: it proves the two entry points, the two esbuild
 * bundles and the manifest all line up before any providers exist. The next
 * unit replaces the log with the virtual file system, the tree view, the
 * simulator clock and the controls webview — all registered against
 * `context.subscriptions` so that a reload disposes them.
 */
export function activateCommon(context: vscode.ExtensionContext): void {
	console.log(`[fleet] activated (extension mode ${context.extensionMode})`);
}

/**
 * Symmetric teardown hook. Anything created in `activateCommon` should be
 * pushed onto `context.subscriptions` and disposed by the host instead of being
 * torn down here; this exists so the entry points have something to delegate to
 * when a future resource genuinely cannot be a `Disposable`.
 */
export function deactivateCommon(): void {
	// Nothing to release yet.
}
