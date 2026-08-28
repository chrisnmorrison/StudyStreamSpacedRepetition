import {
	MarkdownView,
	Modal,
	Notice,
	Platform,
	Plugin,
	TAbstractFile,
	TFile,
	TFolder,
} from "obsidian";
import { DEFAULT_SETTINGS, VaultRecallSettings } from "./settings";
import { VaultRecallSettingTab } from "./settingsTab";
import { collectStudyQueues, StudyQueues } from "./scanner";
import { ReviewSession } from "./session";
import { ReviewHud } from "./reviewHud";
import { QuizModal } from "./quizModal";
import { localDateString } from "./date";
import { normalizeSettings } from "./validation";
import { confirmModal } from "./confirmModal";
import { validateQuizEndpoint } from "./quizSafety";
import { remapRecordPaths } from "./records";

const STATUS_SCAN_LIMIT = 5000;

export default class VaultRecallPlugin extends Plugin {
	settings: VaultRecallSettings;
	private session: ReviewSession | null = null;
	private hud: ReviewHud | null = null;
	private quizMode = false;
	private isRating = false;
	private statusBarItem: HTMLElement | null = null;
	private saveQueue: Promise<void> = Promise.resolve();
	private statusUpdateTimer: number | null = null;
	private activeQuizModal: Modal | null = null;
	private sessionToken = 0;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.addSettingTab(new VaultRecallSettingTab(this.app, this));

		this.statusBarItem = this.addStatusBarItem();
		this.registerEvent(
			this.app.metadataCache.on("changed", () =>
				this.scheduleStatusBarUpdate(),
			),
		);
		this.registerEvent(
			this.app.vault.on("create", () => this.scheduleStatusBarUpdate()),
		);
		this.registerEvent(
			this.app.vault.on("rename", (file, oldPath) => {
				const remapped = remapRecordPaths(
					this.settings.records,
					oldPath,
					file.path,
					file instanceof TFolder,
				);
				if (remapped > 0) {
					void this.saveSettings();
				}
				this.updateStatusBar();
			}),
		);
		this.registerEvent(
			this.app.vault.on("delete", () => {
				// Keep review records until the user explicitly prunes orphans. Sync
				// providers can briefly report deletes, and automatic removal would
				// turn a transient sync event into permanent review-history loss.
				this.updateStatusBar();
			}),
		);
		this.updateStatusBar();

		this.addRibbonIcon(
			"graduation-cap",
				"VaultRecall SR: start review session",
			() => {
				this.startDefaultFolderSession();
			},
		);

		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file: TAbstractFile) => {
				if (!(file instanceof TFolder)) return;

				menu.addItem((item) =>
					item
						.setTitle("Start review session")
						.setIcon("book-open")
						.onClick(() => this.startNavigateSession(file)),
				);

				menu.addItem((item) =>
					item
						.setTitle("Start AI quiz session")
						.setIcon("brain")
						.onClick(() => this.startQuizSession(file)),
				);
			}),
		);

		this.addCommand({
			id: "start-navigate-default",
			name: "Start review session (default folder)",
			callback: () => this.startDefaultFolderSession(),
		});

		this.addCommand({
			id: "show-stats",
			name: "Show statistics",
			callback: () => this.showStats(),
		});

		this.addCommand({
			id: "import-frontmatter-records",
			name: "Import legacy frontmatter review data",
			callback: () => void this.importFrontmatterRecords(),
		});

		this.addCommand({
			id: "strip-frontmatter-records",
			name: "Remove legacy frontmatter review data",
			callback: () => void this.stripFrontmatterRecords(),
		});

		this.addCommand({
			id: "show-orphaned-records",
			name: "Show orphaned review records",
			callback: () => this.showOrphanedRecords(),
		});

		this.addCommand({
			id: "copy-diagnostics",
			name: "Copy diagnostics",
			callback: () => void this.copyDiagnostics(),
		});

		this.addCommand({
			id: "prune-orphaned-records",
			name: "Prune orphaned review records",
			callback: () => void this.pruneOrphanedRecords(),
		});

		this.addCommand({
			id: "rate-again",
			name: "Rate: Again",
			checkCallback: (checking) => {
				if (!this.session) return false;
				if (!checking) void this.rate(0);
				return true;
			},
		});

		this.addCommand({
			id: "rate-hard",
			name: "Rate: Hard",
			checkCallback: (checking) => {
				if (!this.session) return false;
				if (!checking) void this.rate(3);
				return true;
			},
		});

		this.addCommand({
			id: "rate-good",
			name: "Rate: Good",
			checkCallback: (checking) => {
				if (!this.session) return false;
				if (!checking) void this.rate(4);
				return true;
			},
		});

		this.addCommand({
			id: "rate-easy",
			name: "Rate: Easy",
			checkCallback: (checking) => {
				if (!this.session) return false;
				if (!checking) void this.rate(5);
				return true;
			},
		});
	}

	onunload(): void {
		this.finishSession();
	}

	async loadSettings(): Promise<void> {
		this.settings = normalizeSettings(
			Object.assign(
				{},
				DEFAULT_SETTINGS,
				(await this.loadData()) as Partial<VaultRecallSettings>,
			),
		);
	}

	async saveSettings(): Promise<void> {
		this.settings = normalizeSettings(this.settings);
		const snapshot = JSON.parse(
			JSON.stringify(this.settings),
			) as VaultRecallSettings;
		const save = this.saveQueue.then(() => this.saveData(snapshot));
		this.saveQueue = save.catch(() => undefined);
		await save;
	}

	private scheduleStatusBarUpdate(): void {
		if (this.statusUpdateTimer !== null) {
			window.clearTimeout(this.statusUpdateTimer);
		}
		this.statusUpdateTimer = window.setTimeout(() => {
			this.statusUpdateTimer = null;
			this.updateStatusBar();
		}, 250);
	}

	updateStatusBar(): void {
		if (!this.statusBarItem) return;
		const folder = this.getDefaultFolder();
		if (!folder) {
			this.statusBarItem.setText("");
			return;
		}
		const queues = collectStudyQueues(
			this.app,
			folder,
			this.settings.records,
			{
				maxFiles: STATUS_SCAN_LIMIT,
			},
		);
		if (queues.due.length > 0 || queues.new.length > 0) {
			const suffix = queues.truncated ? " (partial)" : "";
			this.statusBarItem.setText(
				`SR: ${queues.due.length} due, ${queues.new.length} new${suffix}`,
			);
		} else {
			this.statusBarItem.setText("SR: all caught up");
		}
	}

	private getDefaultFolder(): TFolder | null {
		const path = this.settings.defaultFolder;
		if (!path) return null;
		const f = this.app.vault.getAbstractFileByPath(path);
		return f instanceof TFolder ? f : null;
	}

	private showStats(): void {
		const today = localDateString();
		const reviewedToday =
			this.settings.stats.lastDate === today
				? this.settings.stats.reviewedToday
				: 0;
		const folder = this.getDefaultFolder();
		const queues = folder
			? collectStudyQueues(this.app, folder, this.settings.records)
			: { due: [], new: [] };
		new Notice(
			`VaultRecall SR\nReviewed today: ${reviewedToday}\nDue in default folder: ${queues.due.length}\nNew in default folder: ${queues.new.length}`,
		);
	}

	private incrementStats(): void {
		const today = localDateString();
		if (this.settings.stats.lastDate !== today) {
			this.settings.stats.lastDate = today;
			this.settings.stats.reviewedToday = 0;
		}
		this.settings.stats.reviewedToday++;
		void this.saveSettings();
	}

	private startDefaultFolderSession(): void {
		const path = this.settings.defaultFolder;
		if (!path) {
			new Notice(
				"VaultRecall SR: set a default folder in settings first.",
			);
			return;
		}
		const abstract = this.app.vault.getAbstractFileByPath(path);
		if (!(abstract instanceof TFolder)) {
			new Notice(`VaultRecall SR: folder "${path}" not found in vault.`);
			return;
		}
		void this.startNavigateSession(abstract);
	}

	async startNavigateSession(folder: TFolder): Promise<void> {
		this.finishSession();
		this.sessionToken++;
		this.quizMode = false;

		const queues = this.applySessionSettings(
			collectStudyQueues(this.app, folder, this.settings.records),
		);
		const total = queues.due.length + queues.new.length;
		if (total === 0) {
			new Notice("VaultRecall SR: no due or new cards in this folder.");
			return;
		}

		this.session = new ReviewSession(
			this.app,
			queues,
			this.settings.records,
			() => this.saveSettings(),
			this.settings.leechThreshold,
		);
		this.hud = new ReviewHud(
			this.session,
			(q) => void this.rate(q),
			() => void this.finishWithConfirm(),
			() => this.editCurrentNote(),
			() => void this.undo(),
		);

		await this.session.openCurrent();
		new Notice(
			`VaultRecall SR: ${total} card${total === 1 ? "" : "s"} loaded (${queues.due.length} due, ${queues.new.length} new).`,
		);
	}

	async startQuizSession(folder: TFolder): Promise<void> {
		if (!this.settings.apiKey) {
			new Notice(
							"VaultRecall SR: add an API key in settings to use AI Quiz.",
			);
			return;
		}

		if (!this.settings.aiPrivacyAccepted) {
			const confirmed = await confirmModal(
				this.app,
				"AI quiz privacy",
							"VaultRecall SR stores your API key in plaintext plugin data and sends note excerpts, your quiz prompt, model name, and API key directly to your configured AI endpoint. Continue only with a restricted key and notes you are allowed to send.",
				"I understand",
			);
			if (!confirmed) return;
			this.settings.aiPrivacyAccepted = true;
			await this.saveSettings();
		}

		let endpointOrigin: string;
		try {
			endpointOrigin = validateQuizEndpoint(
				this.settings.apiBaseUrl,
			).origin;
		} catch (err) {
			const msg =
				err instanceof Error
					? err.message
					: "The configured API URL is invalid.";
					new Notice(`VaultRecall SR: ${msg}`);
			return;
		}

		if (this.settings.aiTrustedOrigin !== endpointOrigin) {
			const confirmed = await confirmModal(
				this.app,
				"Trust AI endpoint",
							`VaultRecall SR will send note excerpts and your API key to ${endpointOrigin}. Continue only if you trust this endpoint.`,
				"Trust endpoint",
			);
			if (!confirmed) return;
			this.settings.aiTrustedOrigin = endpointOrigin;
			await this.saveSettings();
		}

		this.finishSession();
		this.sessionToken++;
		this.quizMode = true;

		const queues = this.applySessionSettings(
			collectStudyQueues(this.app, folder, this.settings.records),
		);
		const total = queues.due.length + queues.new.length;
		if (total === 0) {
					new Notice("VaultRecall SR: no due or new cards in this folder.");
			return;
		}

		this.session = new ReviewSession(
			this.app,
			queues,
			this.settings.records,
			() => this.saveSettings(),
			this.settings.leechThreshold,
		);
		this.hud = new ReviewHud(
			this.session,
			(q) => void this.rate(q),
			() => void this.finishWithConfirm(),
			() => this.editCurrentNote(),
			() => void this.undo(),
		);

		await this.session.openCurrent();
		this.openQuizForCurrent();
		new Notice(
					`VaultRecall SR: ${total} card${total === 1 ? "" : "s"} loaded (${queues.due.length} due, ${queues.new.length} new).`,
		);
	}

	private openQuizForCurrent(): void {
		const file = this.session?.currentFile;
		if (file) {
			this.closeActiveQuizModal();
			const token = String(this.sessionToken);
			const modal = new QuizModal(
				this.app,
				file,
				this.settings,
				(q, path) => {
					if (!this.session || String(this.sessionToken) !== token)
						return;
					if (this.session.currentFile?.path !== path) return;
					void this.rate(q);
				},
				token,
			);
			this.activeQuizModal = modal;
			modal.open();
		}
	}

	private async rate(quality: number): Promise<void> {
		if (!this.session || this.isRating) return;
		this.isRating = true;

		try {
			const result = await this.session.rateAndAdvance(quality);
			if (!result) return;

			this.incrementStats();
			this.updateStatusBar();

			if (result.isLeech) {
				new Notice(
									`VaultRecall SR: "${result.file.basename}" has failed ${result.lapses} times. Consider rewriting this note.`,
					8000,
				);
			}

			if (this.session.isDone) {
							new Notice("VaultRecall SR: session complete!");
				this.finishSession();
				return;
			}

			this.hud?.update();
			await this.session.openCurrent();

			if (this.quizMode) {
				this.openQuizForCurrent();
			}
		} catch {
			new Notice(
							"VaultRecall SR: rating failed. Review data may not have been saved.",
			);
		} finally {
			this.isRating = false;
		}
	}

	private async undo(): Promise<void> {
		if (!this.session) return;
		const success = await this.session.undo();
		if (success) {
			if (this.settings.stats.reviewedToday > 0) {
				this.settings.stats.reviewedToday--;
				void this.saveSettings();
			}
			this.updateStatusBar();
			this.hud?.update();
			this.closeActiveQuizModal();
			await this.session.openCurrent();
			if (this.quizMode) {
				this.openQuizForCurrent();
			}
		}
	}

	private async finishWithConfirm(): Promise<void> {
		if (
			await confirmModal(
				this.app,
				"End review session",
				"End the current review session?",
				"End session",
			)
		) {
			this.finishSession();
		}
	}

	finishSession(): void {
		this.sessionToken++;
		this.closeActiveQuizModal();
		if (this.statusUpdateTimer !== null) {
			window.clearTimeout(this.statusUpdateTimer);
			this.statusUpdateTimer = null;
		}
		this.hud?.remove();
		this.hud = null;
		this.session = null;
		this.quizMode = false;
		this.isRating = false;
	}

	private applySessionSettings(queues: StudyQueues): StudyQueues {
		let due = [...queues.due];
		let newFiles = [...queues.new];
		if (this.settings.reviewOrder === "random") {
			this.shuffle(due);
			this.shuffle(newFiles);
		} else {
			due.sort((a, b) => {
				const dueA = this.settings.records[a.path]?.due ?? "0000-00-00";
				const dueB = this.settings.records[b.path]?.due ?? "0000-00-00";
				return dueA.localeCompare(dueB);
			});
			newFiles.sort((a, b) => a.path.localeCompare(b.path));
		}

		newFiles = newFiles.slice(0, this.settings.newCardsPerSession);

		if (this.settings.dailyLimit > 0) {
			due = due.slice(0, this.settings.dailyLimit);
		}

		return { due, new: newFiles };
	}

	private shuffle(files: TFile[]): void {
		for (let i = files.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			const a = files[i];
			const b = files[j];
			if (!a || !b) continue;
			files[i] = b;
			files[j] = a;
		}
	}

	private async importFrontmatterRecords(): Promise<void> {
		let imported = 0;
		let skippedExisting = 0;
		let skippedMissingDue = 0;

		for (const file of this.app.vault.getMarkdownFiles()) {
			if (this.settings.records[file.path]) {
				skippedExisting++;
				continue;
			}

			const fm = this.getFrontmatter(file);
			const due = fm?.["sr-due"];
			if (typeof due !== "string") {
				skippedMissingDue++;
				continue;
			}

			this.settings.records[file.path] = {
				due,
				interval: this.toNumber(fm?.["sr-interval"], 0),
				ease: this.toNumber(fm?.["sr-ease"], 2.5),
				lapses: this.toNumber(fm?.["sr-lapses"], 0),
			};
			imported++;
		}

		await this.saveSettings();
		this.updateStatusBar();
		new Notice(
					`VaultRecall SR: imported ${imported} review record${imported === 1 ? "" : "s"} from frontmatter. Skipped ${skippedExisting} existing and ${skippedMissingDue} without sr-due.`,
		);
	}

	private async stripFrontmatterRecords(): Promise<void> {
		const files = this.app.vault.getMarkdownFiles().filter((file) => {
			const fm = this.getFrontmatter(file);
			return Boolean(
				fm &&
				("sr-due" in fm ||
					"sr-interval" in fm ||
					"sr-ease" in fm ||
					"sr-lapses" in fm),
			);
		});

		if (files.length === 0) {
			new Notice(
							"VaultRecall SR: no legacy frontmatter review data found.",
			);
			return;
		}

		const confirmed = await confirmModal(
			this.app,
			"Remove legacy data",
			`Remove legacy SR frontmatter from ${files.length} note${files.length === 1 ? "" : "s"}? This only removes sr-due, sr-interval, sr-ease, and sr-lapses. It does not change internal review records.`,
			"Remove fields",
		);
		if (!confirmed) return;

		let stripped = 0;
		let failed = 0;
		for (const file of files) {
			try {
				await this.app.fileManager.processFrontMatter(file, (fm) => {
					const frontmatter = fm as Record<string, unknown>;
					delete frontmatter["sr-due"];
					delete frontmatter["sr-interval"];
					delete frontmatter["sr-ease"];
					delete frontmatter["sr-lapses"];
				});
				stripped++;
			} catch {
				failed++;
			}
		}

		new Notice(
			`VaultRecall SR: removed legacy frontmatter review data from ${stripped} note${stripped === 1 ? "" : "s"}. Failed: ${failed}.`,
		);
	}

	private showOrphanedRecords(): void {
		const orphaned = this.getOrphanedRecordPaths();
		if (orphaned.length === 0) {
					new Notice("VaultRecall SR: no orphaned review records found.");
			return;
		}

		const preview = orphaned.slice(0, 5).join("\n");
		const extra =
			orphaned.length > 5 ? `\n...and ${orphaned.length - 5} more.` : "";
		new Notice(
					`VaultRecall SR: ${orphaned.length} orphaned review record${orphaned.length === 1 ? "" : "s"} found.\n${preview}${extra}`,
			10000,
		);
	}

	private async pruneOrphanedRecords(): Promise<void> {
		const orphaned = this.getOrphanedRecordPaths();
		if (orphaned.length === 0) {
					new Notice("VaultRecall SR: no orphaned review records to prune.");
			return;
		}

		const confirmed = await confirmModal(
			this.app,
			"Prune orphaned records",
			`Delete ${orphaned.length} review record${orphaned.length === 1 ? "" : "s"} whose note files no longer exist?`,
			"Prune records",
		);
		if (!confirmed) return;

		for (const path of orphaned) {
			delete this.settings.records[path];
		}

		await this.saveSettings();
		this.updateStatusBar();
		new Notice(
					`VaultRecall SR: pruned ${orphaned.length} orphaned review record${orphaned.length === 1 ? "" : "s"}.`,
		);
	}

	private async copyDiagnostics(): Promise<void> {
		const folder = this.getDefaultFolder();
		const queues = folder
			? collectStudyQueues(this.app, folder, this.settings.records, {
					maxFiles: STATUS_SCAN_LIMIT,
				})
			: { due: [], new: [], scanned: 0, truncated: false };
		const appWithVersion = this.app as unknown as {
			getVersion?: () => string;
			version?: string;
		};
		const diagnostics = {
			plugin: {
				id: this.manifest.id,
				version: this.manifest.version,
			},
			obsidian: {
				version:
					appWithVersion.getVersion?.() ??
					appWithVersion.version ??
					"unknown",
				platform: {
					isDesktop: Platform.isDesktop,
					isMobile: Platform.isMobile,
					isDesktopApp: Platform.isDesktopApp,
					isMobileApp: Platform.isMobileApp,
				},
			},
			settings: {
				apiKeySet: Boolean(this.settings.apiKey),
				apiBaseOrigin: safeOrigin(this.settings.apiBaseUrl),
				aiTrustedOrigin: this.settings.aiTrustedOrigin,
				aiPrivacyAccepted: this.settings.aiPrivacyAccepted,
				model: this.settings.model,
				defaultFolder: this.settings.defaultFolder,
				reviewOrder: this.settings.reviewOrder,
				dailyLimit: this.settings.dailyLimit,
				newCardsPerSession: this.settings.newCardsPerSession,
				leechThreshold: this.settings.leechThreshold,
			},
			data: {
				recordCount: Object.keys(this.settings.records).length,
				stats: this.settings.stats,
				defaultFolderFound: Boolean(folder),
				scannedDefaultFolderFiles: queues.scanned ?? 0,
				scanTruncated: Boolean(queues.truncated),
				dueInDefaultFolder: queues.due.length,
				newInDefaultFolder: queues.new.length,
				orphanedRecordCount: this.getOrphanedRecordPaths().length,
			},
		};

		await navigator.clipboard.writeText(
			JSON.stringify(diagnostics, null, 2),
		);
			new Notice("VaultRecall SR: diagnostics copied to clipboard.");
	}

	private getOrphanedRecordPaths(): string[] {
		return Object.keys(this.settings.records)
			.filter((path) => !this.app.vault.getAbstractFileByPath(path))
			.sort((a, b) => a.localeCompare(b));
	}

	private getFrontmatter(file: TFile): Record<string, unknown> | undefined {
		return this.app.metadataCache.getFileCache(file)?.frontmatter as
			| Record<string, unknown>
			| undefined;
	}

	private toNumber(value: unknown, fallback: number): number {
		const n = typeof value === "number" ? value : parseFloat(String(value));
		return Number.isFinite(n) ? n : fallback;
	}

	private editCurrentNote(): void {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view) return;
		const state = view.leaf.getViewState();
		if (state.type === "markdown") {
			void view.leaf.setViewState({
				...state,
				state: { ...state.state, mode: "source" },
			});
		}
	}

	private closeActiveQuizModal(): void {
		this.activeQuizModal?.close();
		this.activeQuizModal = null;
	}
}

function safeOrigin(rawUrl: string): string {
	try {
		return new URL(rawUrl).origin;
	} catch {
		return "invalid-url";
	}
}
