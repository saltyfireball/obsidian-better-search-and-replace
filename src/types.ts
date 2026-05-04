export interface SearchReplaceSettings {
	useRegex: boolean;
	caseSensitive: boolean;
	wholeWord: boolean;
	matchColor: string;
	matchStrikethroughColor: string;
	previewColor: string;
	currentMatchColor: string;
}

export const DEFAULT_SETTINGS: SearchReplaceSettings = {
	useRegex: false,
	caseSensitive: false,
	wholeWord: false,
	matchColor: "rgba(120, 220, 232, 0.45)",
	matchStrikethroughColor: "#FF6188",
	previewColor: "rgba(169, 220, 118, 0.45)",
	currentMatchColor: "rgba(255, 216, 102, 0.7)",
};

export interface SearchMatch {
	from: number;
	to: number;
	text: string;
}

export interface SearchState {
	query: string;
	replace: string;
	matches: SearchMatch[];
	currentIndex: number;
	useRegex: boolean;
	caseSensitive: boolean;
	wholeWord: boolean;
	regexError: string | null;
}
