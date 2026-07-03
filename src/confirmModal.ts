import { App, Modal, Setting } from "obsidian";

export class ConfirmModal extends Modal {
	private resolved = false;

	constructor(
		app: App,
		private title: string,
		private message: string,
		private confirmText: string,
		private onResolve: (confirmed: boolean) => void
	) {
		super(app);
	}

	onOpen(): void {
		this.titleEl.setText(this.title);
		this.contentEl.createEl("p", { text: this.message });

		new Setting(this.contentEl)
			.addButton((button) =>
				button.setButtonText("Cancel").onClick(() => {
					this.resolve(false);
				})
			)
			.addButton((button) =>
				button
					.setButtonText(this.confirmText)
					.setCta()
					.onClick(() => {
						this.resolve(true);
					})
			);
	}

	onClose(): void {
		if (!this.resolved) this.onResolve(false);
		this.contentEl.empty();
	}

	private resolve(confirmed: boolean): void {
		this.resolved = true;
		this.onResolve(confirmed);
		this.close();
	}
}

export function confirmModal(
	app: App,
	title: string,
	message: string,
	confirmText: string
): Promise<boolean> {
	return new Promise((resolve) => {
		new ConfirmModal(app, title, message, confirmText, resolve).open();
	});
}
