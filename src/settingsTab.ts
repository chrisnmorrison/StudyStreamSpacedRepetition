import { App, PluginSettingTab, Setting } from "obsidian";
import StudyStreamPlugin from "./main";

export class StudyStreamSettingTab extends PluginSettingTab {
	plugin: StudyStreamPlugin;

	constructor(app: App, plugin: StudyStreamPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl).setName("Review").setHeading();

		new Setting(containerEl)
			.setName("Default folder")
			.setDesc(
				'Vault folder reviewed when you click the ribbon icon (e.g. "Lectures" or "Lectures/Biology").',
			)
			.addText((text) =>
				text
					.setPlaceholder("Folder path")
					.setValue(this.plugin.settings.defaultFolder)
					.onChange(async (value) => {
						this.plugin.settings.defaultFolder = value.trim();
						await this.plugin.saveSettings();
						this.plugin.updateStatusBar();
					}),
			);

		new Setting(containerEl)
			.setName("Review order")
			.setDesc(
				"Due-date first reviews oldest-due notes first. Random shuffles the queue each session.",
			)
			.addDropdown((drop) =>
				drop
					.addOption("due", "Due-date first")
					.addOption("random", "Random")
					.setValue(this.plugin.settings.reviewOrder)
					.onChange(async (value) => {
						this.plugin.settings.reviewOrder = value as
							| "due"
							| "random";
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Daily due review limit")
			.setDesc("Maximum due cards per session. Set to 0 for no limit.")
			.addText((text) =>
				text
					.setPlaceholder("0")
					.setValue(String(this.plugin.settings.dailyLimit))
					.onChange(async (value) => {
						const n = parseInt(value, 10);
						this.plugin.settings.dailyLimit =
							isNaN(n) || n < 0 ? 0 : n;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("New cards per session")
			.setDesc("Maximum unseen notes introduced in each session.")
			.addText((text) =>
				text
					.setPlaceholder("20")
					.setValue(String(this.plugin.settings.newCardsPerSession))
					.onChange(async (value) => {
						const n = parseInt(value, 10);
						this.plugin.settings.newCardsPerSession =
							isNaN(n) || n < 0 ? 20 : n;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Leech threshold")
			.setDesc(
				"Notes that fail this many times will trigger a warning. Set to 0 to disable.",
			)
			.addText((text) =>
				text
					.setPlaceholder("8")
					.setValue(String(this.plugin.settings.leechThreshold))
					.onChange(async (value) => {
						const n = parseInt(value, 10);
						this.plugin.settings.leechThreshold =
							isNaN(n) || n < 0 ? 0 : n;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("AI quiz - bring your own key")
			.setHeading();

		new Setting(containerEl)
			.setName("API key")
			.setDesc(
				"OpenAI-compatible key. Stored in plaintext in your vault's plugin data folder. Do not use a key with an unlimited spend cap.",
			)
			.addText((text) => {
				text.inputEl.type = "password";
				text.setPlaceholder("sk-…")
					.setValue(this.plugin.settings.apiKey)
					.onChange(async (value) => {
						const nextKey = value.trim();
						if (nextKey !== this.plugin.settings.apiKey) {
							this.plugin.settings.aiPrivacyAccepted = false;
						}
						this.plugin.settings.apiKey = nextKey;
						await this.plugin.saveSettings();
					});
				new Setting(containerEl).addButton((button) =>
					button.setButtonText("Clear API key").onClick(async () => {
						this.plugin.settings.apiKey = "";
						this.plugin.settings.aiPrivacyAccepted = false;
						this.plugin.settings.aiTrustedOrigin = "";
						await this.plugin.saveSettings();
						this.display();
					}),
				);
			});

		new Setting(containerEl)
			.setName("API base URL")
			.setDesc(
				"Chat completions endpoint. Works with OpenAI, OpenRouter, Ollama, or any OpenAI-compatible API.",
			)
			.addText((text) =>
				text
					.setPlaceholder(
						"https://api.openai.com/v1/chat/completions",
					)
					.setValue(this.plugin.settings.apiBaseUrl)
					.onChange(async (value) => {
						this.plugin.settings.apiBaseUrl = value.trim();
						this.plugin.settings.aiTrustedOrigin = "";
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Model")
			.setDesc(
				'Model name to request from the API (e.g. "gpt-4o-mini", "claude-3-haiku-20240307").',
			)
			.addText((text) =>
				text
					.setPlaceholder("gpt-4o-mini")
					.setValue(this.plugin.settings.model)
					.onChange(async (value) => {
						this.plugin.settings.model = value.trim();
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Custom quiz prompt")
			.setDesc(
				"Instruction sent to the AI before each note. Leave blank to use the default (3 cloze deletions + 2 multiple-choice questions).",
			)
			.addTextArea((text) =>
				text
					.setPlaceholder(
						"Generate 3 cloze deletions and 2 multiple choice questions based on this text.",
					)
					.setValue(this.plugin.settings.customPrompt)
					.onChange(async (value) => {
						this.plugin.settings.customPrompt = value;
						await this.plugin.saveSettings();
					}),
			);
	}
}
