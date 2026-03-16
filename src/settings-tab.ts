import { PluginSettingTab, Setting } from "obsidian";
import type { App } from "obsidian";
import type BetterSearchReplacePlugin from "./main";
import { DEFAULT_SETTINGS } from "./types";

export class SearchReplaceSettingTab extends PluginSettingTab {
	plugin: BetterSearchReplacePlugin;

	constructor(app: App, plugin: BetterSearchReplacePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl).setName("About").setHeading();

		containerEl.createEl("p", {
			text: "Enhanced search and replace for the currently open file. " +
				"Supports regular expressions with capture groups, case sensitivity, " +
				"whole word matching, and live diff preview.",
			cls: "setting-item-description",
		});

		new Setting(containerEl).setName("How to use").setHeading();

		const instructions = containerEl.createEl("div", { cls: "bsr-settings-instructions" });
		instructions.createEl("p", {
			text: "Open the search bar via the command palette " +
				"(\"Better Search and Replace: Find and replace in current file\") " +
				"or from the note toolbar helpers menu.",
		});

		const featureList = instructions.createEl("ul");
		featureList.createEl("li", { text: "Type in the search field to find matches in real time" });
		featureList.createEl("li", { text: "Use the toggle buttons to enable regex, case sensitivity, or whole word matching" });
		featureList.createEl("li", { text: "Navigate between matches with the arrow buttons or Enter/Shift+Enter" });
		featureList.createEl("li", { text: "Type replacement text to see a live diff preview (red = removed, green = inserted)" });
		featureList.createEl("li", { text: "Click the replace button to replace the current match, or replace all for all matches" });
		featureList.createEl("li", { text: "In regex mode use $1, $2 etc for capture groups in the replacement field" });
		featureList.createEl("li", { text: "Press escape or the close button to close the search bar" });

		new Setting(containerEl).setName("Keyboard shortcut").setHeading();

		const hotkeyInfo = containerEl.createEl("div", { cls: "bsr-settings-instructions" });
		hotkeyInfo.createEl("p", {
			text: "You can assign a hotkey to open this search bar instantly. " +
				"To replace the built-in Cmd/Ctrl+F with this plugin:",
		});

		const hotkeySteps = hotkeyInfo.createEl("ol");
		hotkeySteps.createEl("li", { text: "Open settings and go to the hotkeys tab" });
		hotkeySteps.createEl("li", {
			text: "Search for \"find and replace in current file\"",
		});
		hotkeySteps.createEl("li", { text: "Click the + button and press your desired key combination (e.g. Cmd/Ctrl+F)" });
		hotkeySteps.createEl("li", {
			text: "If the shortcut conflicts with the built-in search, "
				+ "Obsidian will prompt you to remove the existing binding",
		});

		new Setting(containerEl).setName("Defaults").setHeading();

		new Setting(containerEl)
			.setName("Use regular expressions by default")
			.setDesc("When enabled, the regex toggle will be on when the search bar opens.")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.useRegex).onChange(async (value) => {
					this.plugin.settings.useRegex = value;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName("Case sensitive by default")
			.setDesc("When enabled, searches will be case sensitive by default.")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.caseSensitive).onChange(async (value) => {
					this.plugin.settings.caseSensitive = value;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName("Whole word by default")
			.setDesc("When enabled, searches will match whole words only by default.")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.wholeWord).onChange(async (value) => {
					this.plugin.settings.wholeWord = value;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl).setName("Colors").setHeading();

		containerEl.createEl("p", {
			text: "Customize the highlight colors used in the editor for matches and replacement previews.",
			cls: "setting-item-description",
		});

		new Setting(containerEl)
			.setName("Match highlight color")
			.setDesc("Background color for matched text (supports rgba).")
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_SETTINGS.matchColor)
					.setValue(this.plugin.settings.matchColor)
					.onChange(async (value) => {
						this.plugin.settings.matchColor = value || DEFAULT_SETTINGS.matchColor;
						await this.plugin.saveSettings();
						this.plugin.updateStyleVariables();
					}),
			);

		new Setting(containerEl)
			.setName("Match strikethrough color")
			.setDesc("Color for the strikethrough line on matched text when replacement is shown.")
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_SETTINGS.matchStrikethroughColor)
					.setValue(this.plugin.settings.matchStrikethroughColor)
					.onChange(async (value) => {
						this.plugin.settings.matchStrikethroughColor = value || DEFAULT_SETTINGS.matchStrikethroughColor;
						await this.plugin.saveSettings();
						this.plugin.updateStyleVariables();
					}),
			);

		new Setting(containerEl)
			.setName("Replacement preview color")
			.setDesc("Background color for the replacement ghost text preview (supports rgba).")
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_SETTINGS.previewColor)
					.setValue(this.plugin.settings.previewColor)
					.onChange(async (value) => {
						this.plugin.settings.previewColor = value || DEFAULT_SETTINGS.previewColor;
						await this.plugin.saveSettings();
						this.plugin.updateStyleVariables();
					}),
			);

		new Setting(containerEl)
			.setName("Current match highlight color")
			.setDesc("Background color for the currently selected match.")
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_SETTINGS.currentMatchColor)
					.setValue(this.plugin.settings.currentMatchColor)
					.onChange(async (value) => {
						this.plugin.settings.currentMatchColor = value || DEFAULT_SETTINGS.currentMatchColor;
						await this.plugin.saveSettings();
						this.plugin.updateStyleVariables();
					}),
			);
	}
}
