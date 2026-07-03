import { ReviewSession } from "./session";
import { RATING_BUTTONS } from "./constants";

type RateCallback = (quality: number) => void;
type VoidCallback = () => void;

export class ReviewHud {
	private el: HTMLElement;
	private keyHandler: (e: KeyboardEvent) => void;

	constructor(
		private session: ReviewSession,
		private onRate: RateCallback,
		private onFinish: VoidCallback,
		private onEdit?: VoidCallback,
		private onUndo?: VoidCallback
	) {
		this.el = document.body.createDiv({ cls: "sr-hud" });

		this.keyHandler = (e: KeyboardEvent) => {
			const target = e.target as HTMLElement;
			if (
				target.tagName === "INPUT" ||
				target.tagName === "TEXTAREA" ||
				target.isContentEditable
			)
				return;
			if (e.ctrlKey || e.metaKey || e.altKey) return;

			if (e.key === "u" && this.onUndo) {
				e.preventDefault();
				this.onUndo();
				return;
			}

			if (!["1", "2", "3", "4"].includes(e.key)) return;

			const qualities = [0, 3, 4, 5];
			const idx = parseInt(e.key) - 1;
			const q = qualities[idx];
			if (q !== undefined) {
				e.preventDefault();
				this.onRate(q);
			}
		};
		document.addEventListener("keydown", this.keyHandler);

		this.render();
	}

	update(): void {
		this.render();
	}

	remove(): void {
		document.removeEventListener("keydown", this.keyHandler);
		this.el.remove();
	}

	private render(): void {
		this.el.empty();

		const left = this.el.createDiv({ cls: "sr-hud-left" });
		left.createDiv({
			cls: "sr-hud-progress",
			text: `${this.session.progress + 1} / ${this.session.total}`,
		});

		const file = this.session.currentFile;
		if (file) {
			left.createDiv({ cls: "sr-hud-filename", text: file.basename });
		}

		const btnGroup = this.el.createDiv({ cls: "sr-hud-buttons" });
		RATING_BUTTONS.forEach(([label, quality, cls], idx) => {
			const btn = btnGroup.createEl("button", {
				cls: ["sr-btn", cls],
				text: `${label} [${idx + 1}]`,
			});
			btn.addEventListener("click", () => this.onRate(quality));
		});

		const actions = this.el.createDiv({ cls: "sr-hud-actions" });

		if (this.onUndo) {
			const undoBtn = actions.createEl("button", {
				cls: "sr-btn-undo",
				text: "Undo [u]",
			});
			undoBtn.disabled = !this.session.canUndo;
			undoBtn.addEventListener("click", () => this.onUndo?.());
		}

		if (this.onEdit) {
			const editBtn = actions.createEl("button", {
				cls: "sr-btn-edit",
				text: "Edit note",
			});
			editBtn.addEventListener("click", () => this.onEdit?.());
		}

		const finish = actions.createEl("button", {
			cls: "sr-btn-finish",
			text: "Finish session",
		});
		finish.addEventListener("click", () => this.onFinish());
	}
}
