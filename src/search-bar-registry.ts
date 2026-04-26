import { EditorView } from "@codemirror/view";

interface NotifiableBar {
	isVisible(): boolean;
	scheduleUpdate(): void;
}

const registry = new WeakMap<EditorView, NotifiableBar>();

export function registerSearchBar(view: EditorView, bar: NotifiableBar): void {
	registry.set(view, bar);
}

export function unregisterSearchBar(view: EditorView): void {
	registry.delete(view);
}

/**
 * CM6 extension: when an editor's document changes, notify the SearchBar
 * (if any) attached to that editor so it can re-run the search and avoid
 * navigating to stale offsets.
 */
export const docChangeListener = EditorView.updateListener.of((update) => {
	if (!update.docChanged) return;
	const bar = registry.get(update.view);
	if (bar?.isVisible()) {
		bar.scheduleUpdate();
	}
});
