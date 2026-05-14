import { MarkdownView, Plugin } from "obsidian";
import type { App } from "obsidian";
import { searchDecorationField } from "./decorations";
import { SearchBar } from "./search-bar";
import { docChangeListener } from "./search-bar-registry";
import { SearchReplaceSettingTab } from "./settings-tab";
import { DEFAULT_SETTINGS } from "./types";
import type { SearchReplaceSettings } from "./types";

declare global {
	interface Window {
		betterSearchReplaceAPI?: {
			open(app: App): void;
		};
	}
}

export default class BetterSearchReplacePlugin extends Plugin {
	settings!: SearchReplaceSettings;
	private searchBars: Map<MarkdownView, SearchBar> = new Map();

	async onload(): Promise<void> {
		await this.loadSettings();

		this.addSettingTab(new SearchReplaceSettingTab(this.app, this));

		this.registerEditorExtension([searchDecorationField, docChangeListener]);

		this.addCommand({
			id: "find-and-replace",
			name: "Find and replace in current file",
			checkCallback: (checking) => {
				const view = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (!view) return false;
				if (!checking) this.openSearchBar();
				return true;
			},
		});

		window.betterSearchReplaceAPI = {
			open: () => {
				this.openSearchBar();
			},
		};

		this.updateStyleVariables();
	}

	onunload(): void {
		for (const bar of this.searchBars.values()) {
			bar.destroy();
		}
		this.searchBars.clear();

		delete window.betterSearchReplaceAPI;

		activeDocument.body.classList.remove("bsr-colors-applied");
	}

	private openSearchBar(): void {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view) return;

		let bar = this.searchBars.get(view);
		if (bar && bar.isVisible()) {
			bar.dismiss();
			return;
		}

		if (bar) {
			bar.destroy();
		}

		bar = new SearchBar(view, this.settings);
		this.searchBars.set(view, bar);

		const editorEl = view.contentEl;
		bar.show(editorEl);
	}

	updateStyleVariables(): void {
		const root = activeDocument.body;
		root.style.setProperty("--bsr-match-color", this.settings.matchColor);
		root.style.setProperty("--bsr-match-current-color", this.settings.currentMatchColor);
		root.style.setProperty("--bsr-preview-color", this.settings.previewColor);
		root.style.setProperty("--bsr-strikethrough-color", this.settings.matchStrikethroughColor);
		root.classList.add("bsr-colors-applied");
	}

	async loadSettings(): Promise<void> {
		const data = (await this.loadData()) as Partial<SearchReplaceSettings> | null;
		this.settings = { ...DEFAULT_SETTINGS, ...(data ?? {}) };
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
