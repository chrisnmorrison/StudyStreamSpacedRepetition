import { DEFAULT_SETTINGS, SRRecord, VaultRecallSettings } from "./settings";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
const MAX_INTERVAL_DAYS = 36500;
const MAX_LAPSES = 100000;

function stringValue(value: unknown, fallback: string): string {
	return typeof value === "string" ? value : fallback;
}

function numberValue(
	value: unknown,
	fallback: number,
	min: number,
	max: number,
): number {
	const n = typeof value === "number" ? value : Number(value);
	if (!Number.isFinite(n)) return fallback;
	return Math.min(max, Math.max(min, Math.trunc(n)));
}

function easeValue(value: unknown): number {
	const n = typeof value === "number" ? value : Number(value);
	if (!Number.isFinite(n)) return 2.5;
	return Math.min(10, Math.max(1.3, n));
}

function reviewOrderValue(value: unknown): "due" | "random" {
	return value === "random" ? "random" : "due";
}

function booleanValue(value: unknown, fallback: boolean): boolean {
	return typeof value === "boolean" ? value : fallback;
}

export function normalizeRecord(value: unknown): SRRecord | null {
	if (!value || typeof value !== "object") return null;
	const record = value as Partial<SRRecord>;
	if (typeof record.due !== "string" || !DATE_RE.test(record.due))
		return null;

	const normalized: SRRecord = {
		due: record.due,
		interval: numberValue(record.interval, 0, 0, MAX_INTERVAL_DAYS),
		ease: easeValue(record.ease),
		lapses: numberValue(record.lapses, 0, 0, MAX_LAPSES),
	};

	if (
		typeof record.updatedAt === "string" &&
		ISO_DATE_RE.test(record.updatedAt)
	) {
		normalized.updatedAt = record.updatedAt;
	}

	return normalized;
}

export function normalizeSettings(value: unknown): VaultRecallSettings {
	const raw =
		value && typeof value === "object"
			? (value as Partial<VaultRecallSettings>)
			: {};
	const records: Record<string, SRRecord> = {};
	const rawRecords =
		raw.records && typeof raw.records === "object"
			? (raw.records as Record<string, unknown>)
			: {};

	for (const [path, record] of Object.entries(rawRecords)) {
		if (!path || path.includes("\0")) continue;
		const normalized = normalizeRecord(record);
		if (normalized) records[path] = normalized;
	}

	return {
		apiKey: stringValue(raw.apiKey, DEFAULT_SETTINGS.apiKey).trim(),
		apiBaseUrl: stringValue(
			raw.apiBaseUrl,
			DEFAULT_SETTINGS.apiBaseUrl,
		).trim(),
		aiTrustedOrigin: stringValue(
			raw.aiTrustedOrigin,
			DEFAULT_SETTINGS.aiTrustedOrigin,
		),
		aiPrivacyAccepted: booleanValue(
			raw.aiPrivacyAccepted,
			DEFAULT_SETTINGS.aiPrivacyAccepted,
		),
		model:
			stringValue(raw.model, DEFAULT_SETTINGS.model).trim() ||
			DEFAULT_SETTINGS.model,
		customPrompt: stringValue(
			raw.customPrompt,
			DEFAULT_SETTINGS.customPrompt,
		),
		defaultFolder: stringValue(
			raw.defaultFolder,
			DEFAULT_SETTINGS.defaultFolder,
		).trim(),
		reviewOrder: reviewOrderValue(raw.reviewOrder),
		dailyLimit: numberValue(
			raw.dailyLimit,
			DEFAULT_SETTINGS.dailyLimit,
			0,
			10000,
		),
		newCardsPerSession: numberValue(
			raw.newCardsPerSession,
			DEFAULT_SETTINGS.newCardsPerSession,
			0,
			10000,
		),
		leechThreshold: numberValue(
			raw.leechThreshold,
			DEFAULT_SETTINGS.leechThreshold,
			0,
			10000,
		),
		records,
		stats: {
			lastDate:
				typeof raw.stats?.lastDate === "string" &&
				DATE_RE.test(raw.stats.lastDate)
					? raw.stats.lastDate
					: "",
			reviewedToday: numberValue(raw.stats?.reviewedToday, 0, 0, 1000000),
		},
	};
}
