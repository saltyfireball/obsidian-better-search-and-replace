import type { SearchMatch } from "./types";

function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface SearchResult {
	matches: SearchMatch[];
	error: string | null;
}

export function findMatches(
	text: string,
	query: string,
	useRegex: boolean,
	caseSensitive: boolean,
	wholeWord: boolean,
): SearchResult {
	if (!query) {
		return { matches: [], error: null };
	}

	let pattern: string;
	if (useRegex) {
		pattern = query;
	} else {
		pattern = escapeRegex(query);
	}

	if (wholeWord) {
		pattern = `\\b${pattern}\\b`;
	}

	const flags = caseSensitive ? "gm" : "gim";

	let regex: RegExp;
	try {
		regex = new RegExp(pattern, flags);
	} catch (e: unknown) {
		const msg = e instanceof Error ? e.message : "Invalid regex";
		return { matches: [], error: msg };
	}

	if (regex.source === "(?:)" || (regex.test("") && query === "")) {
		return { matches: [], error: null };
	}

	const matches: SearchMatch[] = [];
	let match: RegExpExecArray | null;
	let safety = 0;
	const maxMatches = 10000;

	while ((match = regex.exec(text)) !== null && safety < maxMatches) {
		if (match[0].length === 0) {
			regex.lastIndex++;
			continue;
		}
		matches.push({
			from: match.index,
			to: match.index + match[0].length,
			text: match[0],
		});
		safety++;
	}

	return { matches, error: null };
}

export function computeReplacement(
	text: string,
	query: string,
	replacement: string,
	useRegex: boolean,
	caseSensitive: boolean,
	wholeWord: boolean,
): string {
	if (!query) return text;

	let pattern: string;
	if (useRegex) {
		pattern = query;
	} else {
		pattern = escapeRegex(query);
	}

	if (wholeWord) {
		pattern = `\\b${pattern}\\b`;
	}

	const flags = caseSensitive ? "gm" : "gim";

	try {
		const regex = new RegExp(pattern, flags);
		return text.replace(regex, replacement);
	} catch {
		return text;
	}
}

export function getReplacementPreview(
	matchText: string,
	query: string,
	replacement: string,
	useRegex: boolean,
	caseSensitive: boolean,
	wholeWord: boolean,
): string {
	if (!useRegex) {
		return replacement;
	}

	let pattern = query;
	if (wholeWord) {
		pattern = `\\b${pattern}\\b`;
	}

	const flags = caseSensitive ? "" : "i";

	try {
		const regex = new RegExp(pattern, flags);
		return matchText.replace(regex, replacement);
	} catch {
		return replacement;
	}
}

export function validateRegex(pattern: string): string | null {
	if (!pattern) return null;
	try {
		new RegExp(pattern);
		return null;
	} catch (e: unknown) {
		return e instanceof Error ? e.message : "Invalid regex";
	}
}
