const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const MAX_RENDERED_QUIZ_CHARS = 20000;

export interface EndpointValidation {
	url: URL;
	origin: string;
}

export function validateQuizEndpoint(rawUrl: string): EndpointValidation {
	const url = new URL(rawUrl);
	if (url.username || url.password) {
		throw new Error("API URL must not include embedded credentials.");
	}
	const isLocalHttp = url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname);
	if (url.protocol !== "https:" && !isLocalHttp) {
		throw new Error("API URL must use HTTPS unless it points to localhost.");
	}
	return { url, origin: url.origin };
}

export function sanitizeQuizMarkdown(markdown: string): string {
	return stripControlChars(markdown)
		.replace(/\r\n?/g, "\n")
		.replace(/<!--[\s\S]*?-->/g, "")
		.replace(/<[^>\n]*>/g, "")
		.replace(/^\s{0,3}\[[^\]\n]+\]:\s*\S+.*$/gm, "")
		.replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
		.replace(/!\[([^\]]*)\]\[[^\]]*\]/g, "$1")
		.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
		.replace(/\[\[([^\]]+)\]\]/g, "$1")
		.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
		.replace(/\[([^\]]+)\]\[[^\]]*\]/g, "$1")
		.slice(0, MAX_RENDERED_QUIZ_CHARS);
}

function stripControlChars(value: string): string {
	let result = "";
	for (const char of value) {
		const code = char.charCodeAt(0);
		if (char === "\n" || char === "\t" || (code >= 32 && code !== 127)) {
			result += char;
		}
	}
	return result;
}
