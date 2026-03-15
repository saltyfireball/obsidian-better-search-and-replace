import { EditorView, Decoration, WidgetType } from "@codemirror/view";
import type { DecorationSet } from "@codemirror/view";
import { StateField, StateEffect } from "@codemirror/state";
import type { Range } from "@codemirror/state";
import type { SearchMatch } from "./types";

interface DecorationState {
	matches: SearchMatch[];
	currentIndex: number;
	replacements: string[];
	showPreview: boolean;
}

export const setSearchDecorations = StateEffect.define<DecorationState>();

class ReplacementPreviewWidget extends WidgetType {
	constructor(readonly text: string) {
		super();
	}

	toDOM(): HTMLElement {
		const span = document.createElement("span");
		span.className = "bsr-replacement-preview";
		span.textContent = this.text;
		return span;
	}

	eq(other: ReplacementPreviewWidget): boolean {
		return this.text === other.text;
	}
}

function buildDecorations(state: DecorationState): DecorationSet {
	const decorations: Range<Decoration>[] = [];
	const { matches, currentIndex, replacements, showPreview } = state;

	for (let i = 0; i < matches.length; i++) {
		const match = matches[i];
		const isCurrent = i === currentIndex;

		let cls = "bsr-match";
		if (showPreview) cls += " bsr-match-diff";
		if (isCurrent) cls += " bsr-match-current";

		decorations.push(
			Decoration.mark({ class: cls }).range(match.from, match.to),
		);

		if (showPreview && replacements[i] !== undefined) {
			decorations.push(
				Decoration.widget({
					widget: new ReplacementPreviewWidget(replacements[i]),
					side: 1,
				}).range(match.to),
			);
		}
	}

	decorations.sort((a, b) => a.from - b.from || a.value.startSide - b.value.startSide);

	return Decoration.set(decorations);
}

export const searchDecorationField = StateField.define<DecorationSet>({
	create() {
		return Decoration.none;
	},
	update(value, tr) {
		for (const effect of tr.effects) {
			if (effect.is(setSearchDecorations)) {
				return buildDecorations(effect.value);
			}
		}
		if (tr.docChanged) {
			return value.map(tr.changes);
		}
		return value;
	},
	provide(field) {
		return EditorView.decorations.from(field);
	},
});
