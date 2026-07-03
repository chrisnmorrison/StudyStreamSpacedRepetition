export interface SRRecord {
	due: string;
	interval: number;
	ease: number;
	lapses: number;
	updatedAt?: string;
}

export interface VaultRecallSettings {
	apiKey: string;
	apiBaseUrl: string;
	aiTrustedOrigin: string;
	aiPrivacyAccepted: boolean;
	model: string;
	customPrompt: string;
	defaultFolder: string;
	reviewOrder: "due" | "random";
	dailyLimit: number;
	newCardsPerSession: number;
	leechThreshold: number;
	records: Record<string, SRRecord>;
	stats: {
		lastDate: string;
		reviewedToday: number;
	};
}

export const DEFAULT_SETTINGS: VaultRecallSettings = {
	apiKey: "",
	apiBaseUrl: "https://api.openai.com/v1/chat/completions",
	aiTrustedOrigin: "",
	aiPrivacyAccepted: false,
	model: "gpt-4o-mini",
	customPrompt: "",
	defaultFolder: "",
	reviewOrder: "due",
	dailyLimit: 0,
	newCardsPerSession: 20,
	leechThreshold: 8,
	records: {},
	stats: {
		lastDate: "",
		reviewedToday: 0,
	},
};
