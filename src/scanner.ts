import { App, TFile, TFolder } from "obsidian";
import { SRRecord } from "./settings";
import { localDateString } from "./date";

export interface StudyQueues {
	due: TFile[];
	new: TFile[];
	scanned?: number;
	truncated?: boolean;
}

export interface CollectStudyQueueOptions {
	maxFiles?: number;
}

export function collectStudyQueues(
	app: App,
	folder: TFolder,
	records: Record<string, SRRecord>,
	options: CollectStudyQueueOptions = {}
): StudyQueues {
	const today = localDateString();
	const all: TFile[] = [];
	let truncated = false;

	(function recurse(f: TFolder) {
		if (truncated) return;
		for (const child of f.children) {
			if (child instanceof TFolder) {
				recurse(child);
			} else if (child instanceof TFile && child.extension === "md") {
				if (options.maxFiles !== undefined && all.length >= options.maxFiles) {
					truncated = true;
					return;
				}
				all.push(child);
			}
		}
	})(folder);

	const due: TFile[] = [];
	const newFiles: TFile[] = [];

	for (const file of all) {
		const record = records[file.path];
		if (!record) {
			newFiles.push(file);
		} else if (record.due <= today) {
			due.push(file);
		}
	}

	return { due, new: newFiles, scanned: all.length, truncated };
}
