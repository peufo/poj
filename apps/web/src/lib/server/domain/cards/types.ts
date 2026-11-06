import type { Card, Deck, Review, ReviewLog } from '../../db/generated/prisma/client';

export type {
	Card,
	Direction,
	Origin,
	Rating,
	Review,
	ReviewLog
} from '../../db/generated/prisma/client';

/** Faces d'une carte : A (langue connue, ou question) et B (langue apprise, ou réponse). */
export interface CardInput {
	sideA: string;
	sideB: string;
	context?: string | null;
}

export type CardWithReviews = Card & { deck: Deck; reviews: Review[] };

/** Place d'une carte d'un lot face aux cartes du deck et à celles qui la précèdent dans le lot. */
export type BatchEntry =
	| { status: 'new' }
	/** Identique (trois champs) à une carte créée il y a moins de 10 minutes : un lot rejoué. */
	| { status: 'existing'; card: Card }
	/** Même face identifiante (`duplicateSide`) que des cartes du deck. */
	| { status: 'duplicate'; duplicates: Card[] }
	/** Même face identifiante qu'une carte précédente du lot, d'indice `of`. */
	| { status: 'duplicate_in_batch'; of: number };

/** Issue d'une carte d'un lot créé : créée, ou écartée (`BatchEntry`). */
export type BatchResult =
	Exclude<BatchEntry, { status: 'new' }> | { status: 'created'; card: Card };

export type CardDetail = Card & { deck: Deck; reviews: (Review & { logs: ReviewLog[] })[] };

export interface CardStats {
	totalCards: number;
	dueToday: number;
}

/** Un jour civil de l'échéancier : son début (minuit local) et les révisions dues ce jour-là. */
export interface HorizonDay {
	date: Date;
	count: number;
}
