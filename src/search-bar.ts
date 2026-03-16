import { setIcon } from "obsidian";
import type { MarkdownView } from "obsidian";
import { EditorView } from "@codemirror/view";
import { setSearchDecorations } from "./decorations";
import type { ObsidianEditor } from "./global.d";
import { findMatches, getReplacementPreview, validateRegex } from "./search-engine";
import type { SearchReplaceSettings, SearchMatch, SearchState } from "./types";

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

	private view: MarkdownView;
	private settings: SearchReplaceSettings;
	private state: SearchState;
	private extensionAdded = false;
	private debounceTimer: number | null = null;

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

		const replaceRow = document.createElement("div");
		replaceRow.className = "bsr-row";

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

	private scheduleUpdate(): void {
		if (this.debounceTimer !== null) {
			clearTimeout(this.debounceTimer);
		}
		this.debounceTimer = setTimeout(() => {
			this.updateMatches();
		}, 50) as unknown as number;
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
		const editorView = this.getEditorView();
		if (!editorView) return;

		if (this.state.useRegex && this.state.query) {
			const error = validateRegex(this.state.query);
			this.state.regexError = error;
			if (error) {
				this.regexErrorEl.textContent = error;
				this.regexErrorEl.classList.remove("bsr-hidden");
				this.matchCountEl.textContent = "";
				this.state.matches = [];
				this.state.currentIndex = -1;
				this.clearDecorations(editorView);
				return;
			}
		}

		this.regexErrorEl.classList.add("bsr-hidden");
		this.state.regexError = null;

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

		if (result.matches.length > 0) {
			if (this.state.currentIndex < 0 || this.state.currentIndex >= result.matches.length) {
				this.state.currentIndex = 0;
			}
			this.matchCountEl.textContent = `${this.state.currentIndex + 1} of ${result.matches.length}`;
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

		this.updateDecorations(editorView);
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
	}

	private clearDecorations(editorView: EditorView): void {
		editorView.dispatch({
			effects: setSearchDecorations.of({
				matches: [],
				currentIndex: -1,
				replacements: [],
				showPreview: false,
			}),
		});
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

		const editorView = this.getEditorView();
		if (!editorView) return;

		this.updateDecorations(editorView);

		const match = this.state.matches[this.state.currentIndex];
		editorView.dispatch({
			effects: EditorView.scrollIntoView(match.from, { y: "center" }),
		});
	}

	private replaceCurrent(): void {
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

		const selection = this.view.editor.getSelection();
		if (selection) {
			this.searchInput.value = selection;
			this.state.query = selection;
		}

		this.searchInput.focus();
		this.searchInput.select();
		this.updateMatches();
	}

	dismiss(): void {
		const editorView = this.getEditorView();
		if (editorView) {
			this.clearDecorations(editorView);
		}

		this.containerEl.classList.remove("bsr-visible");

		setTimeout(() => {
			if (this.containerEl.parentElement) {
				this.containerEl.remove();
			}
		}, 200);

		this.view.editor.focus();
	}

	destroy(): void {
		if (this.debounceTimer !== null) {
			clearTimeout(this.debounceTimer);
		}
		const editorView = this.getEditorView();
		if (editorView) {
			this.clearDecorations(editorView);
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
