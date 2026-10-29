/** Clé de comparaison d'un texte saisi (doublons, noms de deck) : casse et espaces ignorés. */
export function comparisonKey(text: string): string {
	return text.trim().replace(/\s+/g, ' ').toLowerCase();
}
