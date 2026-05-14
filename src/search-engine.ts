import type { SearchMatch } from "./types";

function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Decode common backslash escapes in a replacement string so users can type
 * `\n`, `\r`, `\t` and get the actual control characters. `\\` produces a
 * literal backslash; the two-pass-with-placeholder approach keeps `\\n` from
 * being decoded as a newline.
 */
function decodeReplacementEscapes(input: string): string {
	// "\uE000" is a Unicode private-use character, almost never appearing in
	// real text, used as a placeholder so we can decode \\ and \n in two
	// passes without one interfering with the other.
	const PLACEHOLDER = "\uE000";
	return input
		.replace(/\\\\/g, PLACEHOLDER)
		.replace(/\\n/g, "\n")
		.replace(/\\r/g, "\r")
		.replace(/\\t/g, "\t")
		.replace(new RegExp(PLACEHOLDER, "g"), "\\");
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
		return text.replace(regex, decodeReplacementEscapes(replacement));
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
	const decoded = decodeReplacementEscapes(replacement);

	if (!useRegex) {
		return decoded;
	}

	let pattern = query;
	if (wholeWord) {
		pattern = `\\b${pattern}\\b`;
	}

	const flags = caseSensitive ? "m" : "im";

	try {
		const regex = new RegExp(pattern, flags);
		return matchText.replace(regex, decoded);
	} catch {
		return decoded;
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
