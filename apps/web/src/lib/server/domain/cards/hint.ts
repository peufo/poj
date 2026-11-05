/**
 * Mention d'une source (« Source : Wikipédia, 2026-11-01 »), de « Source » à la fin de la
 * ligne : la vérification des faits l'ajoute au contexte, et elle peut nommer la réponse
 * (l'article « Canberra »).
 */
const SOURCE = /\bsources?\s*:.*$/gimu;

/** Séparateurs laissés en fin de ligne par une source retirée (« Vu en cours — »). */
const TRAILING_SEPARATORS = /[\s(,;—–-]+$/u;

/**
 * Indice tiré du contexte d'une carte : le contexte sans ses mentions de source, ou `null`
 * s'il n'en reste rien.
 */
export function hintOf(context: string | null): string | null {
	if (context === null) return null;
	const hint = context
		.replace(SOURCE, '')
		.split('\n')
		.map((line) => line.replace(TRAILING_SEPARATORS, ''))
		.filter(Boolean)
		.join('\n');
	return hint || null;
}
