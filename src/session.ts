import { App, Notice, TFile } from "obsidian";
import { SRScheduler } from "./scheduler";
import { SRRecord } from "./settings";

interface UndoState {
	file: TFile;
	record: SRRecord | undefined;
}

export interface RateResult {
	isLeech: boolean;
	lapses: number;
	file: TFile;
}

export interface ReviewSessionQueues {
	due: TFile[];
	new: TFile[];
}

export class ReviewSession {
	private dueQueue: TFile[];
	private newQueue: TFile[];
	private queue: TFile[];
	private current = 0;
	private undoState: UndoState | null = null;

	constructor(
		private app: App,
		files: ReviewSessionQueues,
		private records: Record<string, SRRecord>,
		private saveRecords: () => Promise<void>,
		private leechThreshold: number = 0,
	) {
		this.dueQueue = [...files.due];
		this.newQueue = [...files.new];
		this.queue = [...this.dueQueue, ...this.newQueue];
	}

	get total(): number {
		return this.queue.length;
	}

	get progress(): number {
		return this.current;
	}

	get dueTotal(): number {
		return this.dueQueue.length;
	}

	get newTotal(): number {
		return this.newQueue.length;
	}

	get currentFile(): TFile | null {
		return this.queue[this.current] ?? null;
	}

	get isDone(): boolean {
		return this.current >= this.queue.length;
	}

	get canUndo(): boolean {
		return this.undoState !== null && this.current > 0;
	}

	async openCurrent(): Promise<void> {
		const file = this.currentFile;
		if (!file) return;
		const leaf = this.app.workspace.getLeaf(false);
		await leaf.openFile(file);
		const state = leaf.getViewState();
		if (state.type === "markdown") {
			await leaf.setViewState({
				...state,
				state: { ...state.state, mode: "preview" },
			});
		}
	}

	async rateAndAdvance(quality: number): Promise<RateResult | null> {
		const file = this.currentFile;
		if (!file) return null;
		const result = await this.updateMetadata(file, quality);
		this.current++;
		return { ...result, file };
	}

	async undo(): Promise<boolean> {
		if (!this.undoState || this.current === 0) return false;

		const { file, record } = this.undoState;

		try {
			if (record) {
				this.records[file.path] = record;
			} else {
				delete this.records[file.path];
			}
			await this.saveRecords();
		} catch {
			new Notice(
							"VaultRecall SR: could not undo - failed to restore review data.",
			);
			return false;
		}

		this.current--;
		this.undoState = null;
		return true;
	}

	private async updateMetadata(
		file: TFile,
		quality: number,
	): Promise<Omit<RateResult, "file">> {
		const previous = this.records[file.path];
		const prevInterval = previous?.interval ?? 0;
		const prevEase = previous?.ease ?? 2.5;
		const prevLapses = previous?.lapses ?? 0;

		this.undoState = {
			file,
			record: previous ? { ...previous } : undefined,
		};

		const newLapses = quality < 3 ? prevLapses + 1 : prevLapses;
		const result = SRScheduler.schedule(quality, prevInterval, prevEase);

		this.records[file.path] = {
			due: result.due,
			interval: result.interval,
			ease: result.ease,
			lapses: newLapses,
			updatedAt: new Date().toISOString(),
		};

		try {
			await this.saveRecords();
		} catch {
			if (previous) {
				this.records[file.path] = previous;
			} else {
				delete this.records[file.path];
			}
			this.undoState = null;
			new Notice(
							`VaultRecall SR: failed to update review data for "${file.basename}".`,
			);
			throw new Error("Failed to save review data.");
		}

		return {
			isLeech:
				this.leechThreshold > 0 && newLapses >= this.leechThreshold,
			lapses: newLapses,
		};
	}
}
