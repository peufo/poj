import type { Deck } from '../../db/generated/prisma/client';

export type { Deck, DeckKind } from '../../db/generated/prisma/client';

/** Deck avec son nombre de cartes non supprimées (navigation). */
export type DeckWithCount = Deck & { cardCount: number };

/**
 * Nouveau deck. Un deck de langue porte sa paire de langues et prend le nom de sa langue
 * apprise (`deckName`) ; un sujet n'a aucune langue (contrainte `decks_language_pair`) et
 * porte le nom saisi. Libellés `null` : nom de la langue, ou « Question » / « Réponse ».
 */
export type DeckInput = Pick<
	Deck,
	'languageA' | 'languageB' | 'labelA' | 'labelB' | 'bothDirections'
> &
	({ kind: 'language' } | { kind: 'subject'; name: string });

/**
 * Ce qui se modifie après la création : le type et les langues restent figés. Le nom et les
 * libellés d'un sujet restent tels quels s'ils sont absents ; une langue garde le nom de sa
 * langue apprise et n'a pas de libellés.
 */
export type DeckUpdate = Pick<Deck, 'bothDirections'> &
	Partial<Pick<Deck, 'name' | 'labelA' | 'labelB'>>;
