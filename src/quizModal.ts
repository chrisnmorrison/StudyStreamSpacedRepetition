import { App, Modal, Notice, TFile, requestUrl } from "obsidian";
import { VaultRecallSettings } from "./settings";
import { RATING_BUTTONS } from "./constants";
import { sanitizeQuizMarkdown } from "./quizSafety";

const MAX_CHARS = 8000;
const MAX_NOTE_BYTES = 200_000;
const TIMEOUT_MS = 30_000;
const DEFAULT_PROMPT =
	"Generate 3 cloze deletions and 2 multiple choice questions based on this text. Keep output straightforward and don't send anything else. Format the output in Markdown.";

export class QuizModal extends Modal {
	private closed = false;
	private requestId = 0;

	constructor(
		app: App,
		private file: TFile,
		private settings: VaultRecallSettings,
		private onRate?: (quality: number, filePath: string) => void,
		private requestToken = ""
	) {
		super(app);
	}

	async onOpen(): Promise<void> {
		this.closed = false;
		const requestId = ++this.requestId;
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", { text: `Quiz: ${this.file.basename}` });

		const statusEl = contentEl.createDiv({
			cls: "sr-quiz-status",
			text: "Generating questions…",
		});

		try {
			if (this.file.stat.size > MAX_NOTE_BYTES) {
				throw new Error(
					`Note is too large for AI quiz generation (${Math.ceil(this.file.stat.size / 1024)} KB).`
				);
			}
			const raw = await this.app.vault.read(this.file);
			if (this.closed || requestId !== this.requestId) return;

			const content = raw.slice(0, MAX_CHARS);
			const markdown = sanitizeQuizMarkdown(await this.fetchQuiz(content));
			if (this.closed || requestId !== this.requestId) return;

			statusEl.remove();
			const resultEl = contentEl.createDiv({ cls: "sr-quiz-result" });
			this.renderQuizText(resultEl, markdown);

			if (this.onRate) {
				const ratingSection = contentEl.createDiv({ cls: "sr-quiz-rating" });
				ratingSection.createEl("p", {
					text: "Rate this note:",
					cls: "sr-quiz-rating-label",
				});
				const btnRow = ratingSection.createDiv({ cls: "sr-quiz-rating-buttons" });
				RATING_BUTTONS.forEach(([label, quality, cls]) => {
					const btn = btnRow.createEl("button", { cls, text: label });
					btn.addEventListener("click", () => {
						this.close();
						this.onRate!(quality, this.file.path);
					});
				});
			}
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			statusEl.setText(`Error: ${msg}`);
			new Notice(`StudyStream SR quiz error: ${msg}`);
		}
	}

	onClose(): void {
		this.closed = true;
		this.requestId++;
		this.contentEl.empty();
	}

	private renderQuizText(container: HTMLElement, markdown: string): void {
		for (const block of markdown.split(/\n{2,}/)) {
			const text = block.trim();
			if (!text) continue;

			const heading = text.match(/^#{1,4}\s+(.+)$/);
			if (heading?.[1]) {
				container.createEl("h3", { text: heading[1] });
				continue;
			}

			container.createEl("pre", {
				cls: "sr-quiz-text-block",
				text,
			});
		}
	}

	private async fetchQuiz(content: string): Promise<string> {
		const prompt = this.settings.customPrompt.trim() || DEFAULT_PROMPT;

		const timeoutPromise = new Promise<never>((_, reject) =>
			setTimeout(
				() => reject(new Error("Request timed out after 30 seconds")),
				TIMEOUT_MS
			)
		);

		const fetchPromise = requestUrl({
			url: this.settings.apiBaseUrl,
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${this.settings.apiKey}`,
			},
			body: JSON.stringify({
				model: this.settings.model,
				messages: [
					{
						role: "system",
						content: "You are a study assistant. Output only Markdown.",
					},
					{
						role: "user",
						content: `${prompt}\n\n---\n\n${content}`,
					},
				],
				max_tokens: 1000,
				user: this.requestToken || undefined,
			}),
		});

		const response = await Promise.race([fetchPromise, timeoutPromise]);

		if (response.status < 200 || response.status >= 300) {
			throw new Error(`API returned status ${response.status}`);
		}

		type ChatResponse = {
			choices: { message: { content: string } }[];
		};
		const data = response.json as ChatResponse;
		const text = data.choices[0]?.message?.content;
		if (!text) throw new Error("Empty response from API");
		return text;
	}
}
