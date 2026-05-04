import { setIcon } from "obsidian";
import type { EventRef, MarkdownView } from "obsidian";
import { EditorView } from "@codemirror/view";
import { setSearchDecorations } from "./decorations";
import type { ObsidianEditor } from "./global.d";
import { registerSearchBar, unregisterSearchBar } from "./search-bar-registry";
import { findMatches, getReplacementPreview, validateRegex } from "./search-engine";
import type { SearchReplaceSettings, SearchMatch, SearchState } from "./types";

type ViewMode = "source" | "preview";

function waitFrames(count: number): Promise<void> {
	return new Promise((resolve) => {
		let remaining = count;
		const tick = () => {
			remaining -= 1;
			if (remaining <= 0) {
				resolve();
				return;
			}
			requestAnimationFrame(tick);
		};
		requestAnimationFrame(tick);
	});
}

const WIDGET_SELECTORS = [
	".cm-embed-block",
	".cm-html-embed",
	".HyperMD-table-row",
	"table",
].join(", ");

export class SearchBar {
	private containerEl: HTMLElement;
	private searchInput: HTMLInputElement;
	private replaceInput: HTMLInputElement;
	private matchCountEl: HTMLElement;
	private regexErrorEl: HTMLElement;
	private captureHintEl: HTMLElement;
	private regexBtn: HTMLElement;
	private caseBtn: HTMLElement;
	private wordBtn: HTMLElement;
	private prevBtn: HTMLElement;
	private nextBtn: HTMLElement;
	private replaceBtn: HTMLElement;
	private replaceAllBtn: HTMLElement;
	private closeBtn: HTMLElement;
	private replaceRow!: HTMLElement;

	private view: MarkdownView;
	private settings: SearchReplaceSettings;
	private state: SearchState;
	private mode: ViewMode = "source";
	private extensionAdded = false;
	private debounceTimer: number | null = null;
	private widgetHighlightEls: HTMLElement[] = [];
	private previewMatchSpans: HTMLElement[] = [];
	private layoutChangeRef: EventRef | null = null;
	private modeObserver: MutationObserver | null = null;

	constructor(view: MarkdownView, settings: SearchReplaceSettings) {
		this.view = view;
		this.settings = settings;
		this.state = {
			query: "",
			replace: "",
			matches: [],
			currentIndex: -1,
			useRegex: settings.useRegex,
			caseSensitive: settings.caseSensitive,
			wholeWord: settings.wholeWord,
			regexError: null,
		};

		this.containerEl = document.createElement("div");
		this.containerEl.className = "bsr-search-bar";

		this.searchInput = document.createElement("input");
		this.replaceInput = document.createElement("input");
		this.matchCountEl = document.createElement("span");
		this.regexErrorEl = document.createElement("div");
		this.captureHintEl = document.createElement("div");
		this.regexBtn = document.createElement("button");
		this.caseBtn = document.createElement("button");
		this.wordBtn = document.createElement("button");
		this.prevBtn = document.createElement("button");
		this.nextBtn = document.createElement("button");
		this.replaceBtn = document.createElement("button");
		this.replaceAllBtn = document.createElement("button");
		this.closeBtn = document.createElement("button");

		this.buildUI();
		this.attachEvents();
	}

	private buildUI(): void {
		const searchRow = document.createElement("div");
		searchRow.className = "bsr-row";

		const searchIcon = document.createElement("span");
		searchIcon.className = "bsr-icon";
		setIcon(searchIcon, "search");

		this.searchInput.type = "text";
		this.searchInput.className = "bsr-input";
		this.searchInput.placeholder = "Search...";
		this.searchInput.setAttribute("aria-label", "Search text");

		const toggleGroup = document.createElement("div");
		toggleGroup.className = "bsr-toggle-group";

		this.regexBtn.className = "bsr-toggle" + (this.state.useRegex ? " bsr-toggle-active" : "");
		this.regexBtn.setAttribute("aria-label", "Use regular expression");
		this.regexBtn.title = "Use regular expression";
		this.regexBtn.tabIndex = -1;
		setIcon(this.regexBtn, "regex");

		this.caseBtn.className = "bsr-toggle" + (this.state.caseSensitive ? " bsr-toggle-active" : "");
		this.caseBtn.setAttribute("aria-label", "Match case");
		this.caseBtn.title = "Match case";
		this.caseBtn.tabIndex = -1;
		setIcon(this.caseBtn, "case-sensitive");

		this.wordBtn.className = "bsr-toggle" + (this.state.wholeWord ? " bsr-toggle-active" : "");
		this.wordBtn.setAttribute("aria-label", "Match whole word");
		this.wordBtn.title = "Match whole word";
		this.wordBtn.tabIndex = -1;
		setIcon(this.wordBtn, "whole-word");

		toggleGroup.appendChild(this.regexBtn);
		toggleGroup.appendChild(this.caseBtn);
		toggleGroup.appendChild(this.wordBtn);

		this.matchCountEl.className = "bsr-match-count";

		const navGroup = document.createElement("div");
		navGroup.className = "bsr-nav-group";

		this.prevBtn.className = "bsr-nav-btn";
		this.prevBtn.setAttribute("aria-label", "Previous match");
		this.prevBtn.title = "Previous match";
		this.prevBtn.tabIndex = -1;
		setIcon(this.prevBtn, "chevron-up");

		this.nextBtn.className = "bsr-nav-btn";
		this.nextBtn.setAttribute("aria-label", "Next match");
		this.nextBtn.title = "Next match";
		this.nextBtn.tabIndex = -1;
		setIcon(this.nextBtn, "chevron-down");

		navGroup.appendChild(this.prevBtn);
		navGroup.appendChild(this.nextBtn);

		this.closeBtn.className = "bsr-close-btn";
		this.closeBtn.setAttribute("aria-label", "Close search bar");
		this.closeBtn.title = "Close (escape)";
		this.closeBtn.tabIndex = -1;
		setIcon(this.closeBtn, "x");

		searchRow.appendChild(searchIcon);
		searchRow.appendChild(this.searchInput);
		searchRow.appendChild(toggleGroup);
		searchRow.appendChild(this.matchCountEl);
		searchRow.appendChild(navGroup);
		searchRow.appendChild(this.closeBtn);

		this.replaceRow = document.createElement("div");
		this.replaceRow.className = "bsr-row";
		const replaceRow = this.replaceRow;

		const replaceIcon = document.createElement("span");
		replaceIcon.className = "bsr-icon";
		setIcon(replaceIcon, "replace");

		this.replaceInput.type = "text";
		this.replaceInput.className = "bsr-input";
		this.replaceInput.placeholder = "Replace...";
		this.replaceInput.setAttribute("aria-label", "Replacement text");

		const replaceActions = document.createElement("div");
		replaceActions.className = "bsr-replace-actions";

		this.replaceBtn.className = "bsr-action-btn";
		this.replaceBtn.textContent = "Replace";
		this.replaceBtn.setAttribute("aria-label", "Replace current match");
		this.replaceBtn.tabIndex = -1;

		this.replaceAllBtn.className = "bsr-action-btn";
		this.replaceAllBtn.textContent = "Replace all";
		this.replaceAllBtn.setAttribute("aria-label", "Replace all matches");
		this.replaceAllBtn.tabIndex = -1;

		replaceActions.appendChild(this.replaceBtn);
		replaceActions.appendChild(this.replaceAllBtn);

		replaceRow.appendChild(replaceIcon);
		replaceRow.appendChild(this.replaceInput);
		replaceRow.appendChild(replaceActions);

		this.regexErrorEl.className = "bsr-regex-error bsr-hidden";

		this.captureHintEl.className = "bsr-capture-hint" + (this.state.useRegex ? "" : " bsr-hidden");
		this.captureHintEl.textContent = "Use $1, $2 for capture groups, $<name> for named groups";

		this.containerEl.appendChild(searchRow);
		this.containerEl.appendChild(replaceRow);
		this.containerEl.appendChild(this.regexErrorEl);
		this.containerEl.appendChild(this.captureHintEl);
	}

	private attachEvents(): void {
		this.searchInput.addEventListener("input", () => {
			this.state.query = this.searchInput.value;
			this.scheduleUpdate();
		});

		this.replaceInput.addEventListener("input", () => {
			this.state.replace = this.replaceInput.value;
			this.scheduleUpdate();
		});

		this.regexBtn.addEventListener("click", () => {
			this.state.useRegex = !this.state.useRegex;
			this.regexBtn.classList.toggle("bsr-toggle-active", this.state.useRegex);
			this.captureHintEl.classList.toggle("bsr-hidden", !this.state.useRegex);
			this.updateMatches();
		});

		this.caseBtn.addEventListener("click", () => {
			this.state.caseSensitive = !this.state.caseSensitive;
			this.caseBtn.classList.toggle("bsr-toggle-active", this.state.caseSensitive);
			this.updateMatches();
		});

		this.wordBtn.addEventListener("click", () => {
			this.state.wholeWord = !this.state.wholeWord;
			this.wordBtn.classList.toggle("bsr-toggle-active", this.state.wholeWord);
			this.updateMatches();
		});

		this.prevBtn.addEventListener("click", () => { this.navigateMatch(-1); });
		this.nextBtn.addEventListener("click", () => { this.navigateMatch(1); });
		this.replaceBtn.addEventListener("click", () => { this.replaceCurrent(); });
		this.replaceAllBtn.addEventListener("click", () => { this.replaceAll(); });
		this.closeBtn.addEventListener("click", () => { this.dismiss(); });

		this.searchInput.addEventListener("keydown", (e) => {
			if (e.key === "Escape") {
				this.dismiss();
			} else if (e.key === "Tab") {
				e.preventDefault();
				this.replaceInput.focus();
			} else if (e.key === "Enter") {
				if (e.shiftKey) {
					this.navigateMatch(-1);
				} else {
					this.navigateMatch(1);
				}
			}
		});

		this.replaceInput.addEventListener("keydown", (e) => {
			if (e.key === "Escape") {
				this.dismiss();
			} else if (e.key === "Tab") {
				e.preventDefault();
				this.searchInput.focus();
			} else if (e.key === "Enter") {
				if (e.shiftKey) {
					this.replaceAll();
				} else {
					this.replaceCurrent();
				}
			}
		});
	}

	scheduleUpdate(): void {
		if (this.debounceTimer !== null) {
			clearTimeout(this.debounceTimer);
		}
		this.debounceTimer = setTimeout(() => {
			this.updateMatches();
		}, 150) as unknown as number;
	}

	private getEditorView(): EditorView | null {
		const editorCm = (this.view.editor as unknown as ObsidianEditor).cm;
		if (editorCm instanceof EditorView) {
			return editorCm;
		}
		return null;
	}

	private ensureExtension(): void {
		if (this.extensionAdded) return;
		this.extensionAdded = true;
	}

	updateMatches(): void {
		if (this.debounceTimer !== null) {
			clearTimeout(this.debounceTimer);
			this.debounceTimer = null;
		}

		if (this.state.useRegex && this.state.query) {
			const error = validateRegex(this.state.query);
			this.state.regexError = error;
			if (error) {
				this.regexErrorEl.textContent = error;
				this.regexErrorEl.classList.remove("bsr-hidden");
				this.matchCountEl.textContent = "";
				this.state.matches = [];
				this.state.currentIndex = -1;
				this.clearAllHighlights();
				return;
			}
		}

		this.regexErrorEl.classList.add("bsr-hidden");
		this.state.regexError = null;

		if (this.mode === "preview") {
			void this.updatePreviewMatches();
			return;
		}

		const editorView = this.getEditorView();
		if (!editorView) return;

		const docText = editorView.state.doc.toString();
		const result = findMatches(
			docText,
			this.state.query,
			this.state.useRegex,
			this.state.caseSensitive,
			this.state.wholeWord,
		);

		if (result.error) {
			this.state.regexError = result.error;
			this.regexErrorEl.textContent = result.error;
			this.regexErrorEl.classList.remove("bsr-hidden");
			this.matchCountEl.textContent = "";
			this.state.matches = [];
			this.state.currentIndex = -1;
			this.clearDecorations(editorView);
			return;
		}

		this.state.matches = result.matches;
		this.updateMatchCountUI(result.matches.length);
		this.updateDecorations(editorView);
	}

	private async updatePreviewMatches(): Promise<void> {
		this.clearWidgetHighlights();
		this.previewMatchSpans = [];

		if (!this.state.query) {
			this.state.matches = [];
			this.updateMatchCountUI(0);
			return;
		}

		// The reading view lazy-renders chunks as you scroll, so walking the
		// rendered DOM gives a misleading count. Find matches against the source
		// text instead (gives the same count as source/edit mode) and highlight
		// whatever happens to be in the DOM right now. Navigation triggers a
		// scroll which renders the target chunk, then re-highlights.
		const sourceText = await this.getSourceText();
		const result = findMatches(
			sourceText,
			this.state.query,
			this.state.useRegex,
			this.state.caseSensitive,
			this.state.wholeWord,
		);

		if (result.error) {
			this.state.regexError = result.error;
			this.regexErrorEl.textContent = result.error;
			this.regexErrorEl.classList.remove("bsr-hidden");
			this.matchCountEl.textContent = "";
			this.state.matches = [];
			this.state.currentIndex = -1;
			return;
		}

		this.state.matches = result.matches;
		this.refreshPreviewHighlights();
		this.updateMatchCountUI(result.matches.length);
	}

	private refreshPreviewHighlights(): void {
		this.clearWidgetHighlights();
		this.previewMatchSpans = [];
		const previewEl = this.getPreviewContainer();
		if (!previewEl) return;
		const regex = this.buildSearchRegex();
		if (!regex) return;
		this.highlightTextInElement(previewEl, regex);
		this.previewMatchSpans = [...this.widgetHighlightEls];
	}

	private async getSourceText(): Promise<string> {
		const file = this.view.file;
		if (!file) return "";
		try {
			return await this.view.app.vault.cachedRead(file);
		} catch {
			return "";
		}
	}

	private async navigatePreview(): Promise<void> {
		const match = this.state.matches[this.state.currentIndex];
		if (!match) return;

		const sourceText = await this.getSourceText();
		const line = sourceText.substring(0, match.from).split("\n").length - 1;

		// Scroll the reading view to the match's line. previewMode is on
		// MarkdownView; cast through unknown since the type isn't part of the
		// public Obsidian typings.
		const previewMode = (
			this.view as unknown as {
				previewMode?: { applyScroll?: (line: number) => void };
			}
		).previewMode;
		if (previewMode?.applyScroll) {
			previewMode.applyScroll(line);
		}

		// Wait two frames for the chunk renderer to flush, then re-walk the DOM
		// so the newly rendered region gets highlighted. Pick the span closest
		// to viewport center as the visible "current" indicator.
		await waitFrames(2);
		this.refreshPreviewHighlights();
		this.markPreviewCurrentByViewport();
	}

	private markPreviewCurrentByViewport(): void {
		const previewEl = this.getPreviewContainer();
		if (!previewEl || this.previewMatchSpans.length === 0) return;

		const previewRect = previewEl.getBoundingClientRect();
		const targetY = previewRect.top + previewRect.height / 2;

		let closest: HTMLElement | null = null;
		let closestDist = Infinity;
		for (const span of this.previewMatchSpans) {
			const rect = span.getBoundingClientRect();
			const center = rect.top + rect.height / 2;
			const dist = Math.abs(center - targetY);
			if (dist < closestDist) {
				closestDist = dist;
				closest = span;
			}
		}

		for (const span of this.previewMatchSpans) {
			span.classList.toggle("bsr-widget-match-current", span === closest);
		}

		if (closest) {
			closest.scrollIntoView({ block: "center", inline: "nearest" });
		}
	}

	private updateMatchCountUI(total: number): void {
		if (total > 0) {
			if (this.state.currentIndex < 0 || this.state.currentIndex >= total) {
				this.state.currentIndex = 0;
			}
			this.matchCountEl.textContent = `${this.state.currentIndex + 1} of ${total}`;
			this.matchCountEl.classList.remove("bsr-no-matches");
		} else if (this.state.query) {
			this.matchCountEl.textContent = "No matches";
			this.matchCountEl.classList.add("bsr-no-matches");
			this.state.currentIndex = -1;
		} else {
			this.matchCountEl.textContent = "";
			this.matchCountEl.classList.remove("bsr-no-matches");
			this.state.currentIndex = -1;
		}
	}

	private buildSearchRegex(): RegExp | null {
		let pattern: string;
		if (this.state.useRegex) {
			pattern = this.state.query;
		} else {
			pattern = this.state.query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		}
		if (this.state.wholeWord) {
			pattern = `\\b${pattern}\\b`;
		}
		const flags = this.state.caseSensitive ? "gm" : "gim";
		try {
			return new RegExp(pattern, flags);
		} catch {
			return null;
		}
	}

	private getPreviewContainer(): HTMLElement | null {
		const direct = this.view.contentEl.querySelector(
			".markdown-reading-view .markdown-preview-view",
		);
		return direct instanceof HTMLElement ? direct : null;
	}

	private clearAllHighlights(): void {
		this.clearWidgetHighlights();
		this.previewMatchSpans = [];
		const editorView = this.getEditorView();
		if (editorView) {
			this.clearDecorations(editorView);
		}
	}

	private updateDecorations(editorView: EditorView): void {
		const showPreview = this.state.replace.length > 0;
		const replacements: string[] = [];

		if (showPreview) {
			for (const match of this.state.matches) {
				replacements.push(
					getReplacementPreview(
						match.text,
						this.state.query,
						this.state.replace,
						this.state.useRegex,
						this.state.caseSensitive,
						this.state.wholeWord,
					),
				);
			}
		}

		editorView.dispatch({
			effects: setSearchDecorations.of({
				matches: this.state.matches,
				currentIndex: this.state.currentIndex,
				replacements,
				showPreview,
			}),
		});

		this.highlightWidgetMatches(editorView);
	}

	private clearDecorations(editorView: EditorView): void {
		this.clearWidgetHighlights();
		editorView.dispatch({
			effects: setSearchDecorations.of({
				matches: [],
				currentIndex: -1,
				replacements: [],
				showPreview: false,
			}),
		});
	}

	// ------------------------------------------------------------------
	// Widget / embed-block highlighting (tables, callouts, etc.)
	// CM decorations can't penetrate rendered widgets, so we search
	// the rendered DOM inside .cm-embed-block elements and wrap
	// matching text nodes with highlight spans.
	// ------------------------------------------------------------------

	private clearWidgetHighlights(): void {
		for (const span of this.widgetHighlightEls) {
			const parent = span.parentNode;
			if (parent) {
				parent.replaceChild(
					document.createTextNode(span.textContent ?? ""),
					span,
				);
				parent.normalize();
			}
		}
		this.widgetHighlightEls = [];
	}

	private highlightWidgetMatches(editorView: EditorView): void {
		this.clearWidgetHighlights();

		if (!this.state.query || this.state.matches.length === 0) return;

		const regex = this.buildSearchRegex();
		if (!regex) return;

		// Walk widget DOM that CM decorations can't reach (callouts, embeds,
		// rendered tables in live preview). Visit each unique top-level widget
		// once; the walker dedupes nested text nodes via the bsr-widget-match
		// reject filter.
		const blocks = Array.from(editorView.dom.querySelectorAll(WIDGET_SELECTORS));
		const visited = new Set<Element>();
		for (const block of blocks) {
			if (visited.has(block)) continue;
			let isNested = false;
			for (const ancestor of visited) {
				if (ancestor.contains(block)) {
					isNested = true;
					break;
				}
			}
			if (isNested) continue;
			visited.add(block);
			this.highlightTextInElement(block, regex);
		}
	}

	private highlightTextInElement(container: Element, regex: RegExp): void {
		const walker = document.createTreeWalker(
			container,
			NodeFilter.SHOW_TEXT,
			{
				acceptNode(node: Text): number {
					// Skip text inside our own highlight spans
					if (
						node.parentElement?.classList.contains(
							"bsr-widget-match",
						)
					) {
						return NodeFilter.FILTER_REJECT;
					}
					// Skip empty text nodes
					if (!node.textContent) {
						return NodeFilter.FILTER_REJECT;
					}
					return NodeFilter.FILTER_ACCEPT;
				},
			},
		);

		const textNodes: Text[] = [];
		let current = walker.nextNode();
		while (current) {
			textNodes.push(current as Text);
			current = walker.nextNode();
		}

		for (const textNode of textNodes) {
			const text = textNode.textContent ?? "";
			regex.lastIndex = 0;

			const fragments: (string | HTMLSpanElement)[] = [];
			let lastIndex = 0;
			let matched = false;
			let m: RegExpExecArray | null;

			while ((m = regex.exec(text)) !== null) {
				if (m[0].length === 0) {
					regex.lastIndex++;
					continue;
				}
				matched = true;

				if (m.index > lastIndex) {
					fragments.push(text.slice(lastIndex, m.index));
				}

				const span = document.createElement("span");
				span.className = "bsr-widget-match";
				span.textContent = m[0];
				fragments.push(span);
				this.widgetHighlightEls.push(span);

				lastIndex = regex.lastIndex;
			}

			if (!matched) continue;

			if (lastIndex < text.length) {
				fragments.push(text.slice(lastIndex));
			}

			const parent = textNode.parentNode;
			if (!parent) continue;

			for (const frag of fragments) {
				if (typeof frag === "string") {
					parent.insertBefore(
						document.createTextNode(frag),
						textNode,
					);
				} else {
					parent.insertBefore(frag, textNode);
				}
			}
			parent.removeChild(textNode);
		}
	}

	private navigateMatch(direction: number): void {
		if (this.state.matches.length === 0) return;

		this.state.currentIndex += direction;
		if (this.state.currentIndex >= this.state.matches.length) {
			this.state.currentIndex = 0;
		} else if (this.state.currentIndex < 0) {
			this.state.currentIndex = this.state.matches.length - 1;
		}

		this.matchCountEl.textContent = `${this.state.currentIndex + 1} of ${this.state.matches.length}`;

		if (this.mode === "preview") {
			void this.navigatePreview();
			return;
		}

		const editorView = this.getEditorView();
		if (!editorView) return;

		this.updateDecorations(editorView);

		const match = this.state.matches[this.state.currentIndex];
		editorView.dispatch({
			effects: EditorView.scrollIntoView(match.from, { y: "center" }),
		});
	}

	private replaceCurrent(): void {
		if (this.mode === "preview") return;
		if (this.state.matches.length === 0 || this.state.currentIndex < 0) return;

		const editorView = this.getEditorView();
		if (!editorView) return;

		const match = this.state.matches[this.state.currentIndex];
		const replacement = getReplacementPreview(
			match.text,
			this.state.query,
			this.state.replace,
			this.state.useRegex,
			this.state.caseSensitive,
			this.state.wholeWord,
		);

		editorView.dispatch({
			changes: { from: match.from, to: match.to, insert: replacement },
		});

		this.updateMatches();
	}

	private replaceAll(): void {
		if (this.mode === "preview") return;
		if (this.state.matches.length === 0) return;

		const editorView = this.getEditorView();
		if (!editorView) return;

		const changes = [];
		for (let i = this.state.matches.length - 1; i >= 0; i--) {
			const match = this.state.matches[i];
			const replacement = getReplacementPreview(
				match.text,
				this.state.query,
				this.state.replace,
				this.state.useRegex,
				this.state.caseSensitive,
				this.state.wholeWord,
			);
			changes.push({ from: match.from, to: match.to, insert: replacement });
		}

		editorView.dispatch({ changes });
		this.updateMatches();
	}

	show(editorEl: HTMLElement): void {
		this.ensureExtension();

		if (!this.containerEl.parentElement) {
			editorEl.insertBefore(this.containerEl, editorEl.firstChild);
		}

		this.containerEl.classList.add("bsr-visible");

		this.applyMode();

		const editorView = this.getEditorView();
		if (editorView) {
			registerSearchBar(editorView, this);
		}

		// Try to seed the search input with the current selection if there is one.
		// In preview mode there's no editor selection, so just rely on focused/empty state.
		try {
			const selection = this.view.editor.getSelection();
			if (selection) {
				this.searchInput.value = selection;
				this.state.query = selection;
			}
		} catch {
			// view.editor not available in preview mode
		}

		this.layoutChangeRef = this.view.app.workspace.on("layout-change", () => {
			this.applyMode();
		});

		// layout-change does not fire for in-leaf mode toggles (edit <-> reading).
		// Watch the view container for class/style mutations as a backup signal,
		// then debounce since modes also rearrange unrelated DOM during the
		// switch. applyMode() is idempotent when the mode hasn't actually changed.
		this.modeObserver = new MutationObserver(() => {
			this.applyMode();
		});
		this.modeObserver.observe(this.view.contentEl, {
			attributes: true,
			subtree: true,
			attributeFilter: ["class", "style"],
		});

		this.searchInput.focus();
		this.searchInput.select();
		this.updateMatches();
	}

	private applyMode(): void {
		const newMode: ViewMode = this.view.getMode() === "preview" ? "preview" : "source";
		const changed = newMode !== this.mode;
		this.mode = newMode;

		this.containerEl.classList.toggle("bsr-mode-preview", this.mode === "preview");
		this.replaceRow.classList.toggle("bsr-hidden", this.mode === "preview");

		if (changed) {
			// Tear down highlights produced for the prior mode, reset cursor,
			// and re-run against the new mode's content.
			this.clearAllHighlights();
			this.state.matches = [];
			this.state.currentIndex = -1;
			this.updateMatches();
		}
	}

	dismiss(): void {
		const editorView = this.getEditorView();
		if (editorView) {
			this.clearDecorations(editorView);
			unregisterSearchBar(editorView);
		}
		this.clearWidgetHighlights();
		this.previewMatchSpans = [];

		if (this.layoutChangeRef) {
			this.view.app.workspace.offref(this.layoutChangeRef);
			this.layoutChangeRef = null;
		}
		if (this.modeObserver) {
			this.modeObserver.disconnect();
			this.modeObserver = null;
		}

		this.containerEl.classList.remove("bsr-visible");

		setTimeout(() => {
			if (this.containerEl.parentElement) {
				this.containerEl.remove();
			}
		}, 200);

		try {
			this.view.editor.focus();
		} catch {
			// editor not available in preview mode
		}
	}

	destroy(): void {
		if (this.debounceTimer !== null) {
			clearTimeout(this.debounceTimer);
		}
		this.clearWidgetHighlights();
		this.previewMatchSpans = [];
		const editorView = this.getEditorView();
		if (editorView) {
			this.clearDecorations(editorView);
			unregisterSearchBar(editorView);
		}
		if (this.layoutChangeRef) {
			this.view.app.workspace.offref(this.layoutChangeRef);
			this.layoutChangeRef = null;
		}
		if (this.modeObserver) {
			this.modeObserver.disconnect();
			this.modeObserver = null;
		}
		if (this.containerEl.parentElement) {
			this.containerEl.remove();
		}
	}

	isVisible(): boolean {
		return this.containerEl.classList.contains("bsr-visible");
	}

	getMatches(): SearchMatch[] {
		return this.state.matches;
	}

	updateSettings(settings: SearchReplaceSettings): void {
		this.settings = settings;
	}
}
