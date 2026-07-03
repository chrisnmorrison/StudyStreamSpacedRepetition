import test from "node:test";
import assert from "node:assert/strict";
import { localDateString } from "../src/date";
import { sanitizeQuizMarkdown, validateQuizEndpoint } from "../src/quizSafety";
import { normalizeSettings } from "../src/validation";
import { remapRecordPath, remapRecordPaths } from "../src/records";
import { SRRecord } from "../src/settings";

test("localDateString uses local calendar components", () => {
	assert.equal(localDateString(new Date(2026, 4, 26, 23, 30)), "2026-05-26");
});

test("validateQuizEndpoint rejects non-local HTTP endpoints", () => {
	assert.throws(
		() => validateQuizEndpoint("http://example.com/v1/chat/completions"),
		/HTTPS/
	);
	assert.equal(
		validateQuizEndpoint("http://localhost:11434/v1/chat/completions").origin,
		"http://localhost:11434"
	);
	assert.equal(
		validateQuizEndpoint("https://api.openai.com/v1/chat/completions").origin,
		"https://api.openai.com"
	);
	assert.throws(
		() => validateQuizEndpoint("https://user:pass@example.com/v1/chat/completions"),
		/credentials/
	);
});

test("sanitizeQuizMarkdown strips active content and all active links", () => {
	const sanitized = sanitizeQuizMarkdown(
		[
			"<script>alert(1)</script>",
			"![pixel](https://tracker.example/p.gif)",
			"[bad](javascript:alert(1))",
			"[ok](https://example.com)",
			"[ref][x]",
			"[x]: javascript:alert(1)",
			"[[Secret note|alias]]",
		].join("\n")
	);

	assert.equal(sanitized.includes("<script>"), false);
	assert.equal(sanitized.includes("![pixel]"), false);
	assert.equal(sanitized.includes("javascript:"), false);
	assert.equal(sanitized.includes("[ok](https://example.com)"), false);
	assert.equal(sanitized.includes("ok"), true);
	assert.equal(sanitized.includes("[ref][x]"), false);
	assert.equal(sanitized.includes("alias"), true);
});

test("normalizeSettings drops invalid records and clamps numeric settings", () => {
	const settings = normalizeSettings({
		dailyLimit: -10,
		newCardsPerSession: 999999,
		records: {
			"ok.md": { due: "2026-05-26", interval: 3.7, ease: 99, lapses: -4 },
			"with-updated-at.md": {
				due: "2026-05-26",
				interval: 1,
				ease: 2.5,
				lapses: 0,
				updatedAt: "2026-05-26T12:00:00.000Z",
			},
			"bad.md": { due: "tomorrow", interval: 1, ease: 2.5, lapses: 0 },
		},
	});

	assert.equal(settings.dailyLimit, 0);
	assert.equal(settings.newCardsPerSession, 10000);
	assert.equal(settings.aiPrivacyAccepted, false);
	assert.deepEqual(Object.keys(settings.records), ["ok.md", "with-updated-at.md"]);
	assert.equal(settings.records["ok.md"]?.interval, 3);
	assert.equal(settings.records["ok.md"]?.ease, 10);
	assert.equal(settings.records["ok.md"]?.lapses, 0);
	assert.equal(
		settings.records["with-updated-at.md"]?.updatedAt,
		"2026-05-26T12:00:00.000Z"
	);
});

test("remapRecordPath handles exact files and folder descendants", () => {
	assert.equal(remapRecordPath("Old/a.md", "Old", "New", true), "New/a.md");
	assert.equal(remapRecordPath("Old/Nested/a.md", "Old", "New", true), "New/Nested/a.md");
	assert.equal(remapRecordPath("Oldish/a.md", "Old", "New", true), null);
	assert.equal(remapRecordPath("Old/a.md", "Old", "New", false), null);
	assert.equal(remapRecordPath("Old.md", "Old.md", "New.md", false), "New.md");
});

test("remapRecordPaths rewrites folder records without overwriting existing records", () => {
	const records: Record<string, SRRecord> = {
		"Old/a.md": { due: "2026-05-26", interval: 1, ease: 2.5, lapses: 0 },
		"Old/b.md": { due: "2026-05-27", interval: 2, ease: 2.5, lapses: 0 },
		"New/b.md": { due: "2026-05-28", interval: 3, ease: 2.5, lapses: 0 },
	};

	assert.equal(remapRecordPaths(records, "Old", "New", true), 2);
	assert.deepEqual(Object.keys(records).sort(), ["New/a.md", "New/b.md"]);
	assert.equal(records["New/a.md"]?.due, "2026-05-26");
	assert.equal(records["New/b.md"]?.due, "2026-05-28");
});
