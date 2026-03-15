import type { EditorView } from "@codemirror/view";

/**
 * Obsidian's internal editor wraps a CodeMirror 6 EditorView.
 * This interface exposes the `.cm` property used to dispatch effects.
 */
export interface ObsidianEditor {
	cm: EditorView;
}
