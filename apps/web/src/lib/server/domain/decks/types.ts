import type { Deck } from '../../db/generated/prisma/client';

export type { Deck, DeckKind } from '../../db/generated/prisma/client';

/** Deck avec son nombre de cartes non supprimées (navigation). */
export type DeckWithCount = Deck & { cardCount: number };

/**
 * Nouveau deck. Un deck de langue porte sa paire de langues, un sujet n'en a aucune
 * (contrainte `decks_language_pair`). Libellés `null` : nom de la langue, ou
 * « Question » / « Réponse ».
 */
export type DeckInput = Pick<
	Deck,
	'name' | 'kind' | 'languageA' | 'languageB' | 'labelA' | 'labelB' | 'bothDirections'
>;

/** Ce qui se modifie après la création : le type et les langues restent figés. */
export type DeckUpdate = Pick<Deck, 'name' | 'bothDirections'> &
	Partial<Pick<Deck, 'labelA' | 'labelB'>>;
