import type { Card, Deck, Review, ReviewLog } from '../../db/generated/prisma/client';
import type { ForecastPoint } from '../reviews/forecast';

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

/**
 * Une carte en route sur le tapis : délai jusqu'à sa prochaine présentation, et l'état du sens
 * qui sera alors présenté.
 */
export interface BeltToken extends Pick<Review, 'state' | 'stability'> {
	delayMs: number;
}

/** Le tapis : cartes neuves en attente, cartes présentables maintenant, cartes en route. */
export interface Belt {
	/** Cartes neuves au-delà de la limite du jour de leur deck. */
	stock: number;
	/** Cartes dont un sens est présentable maintenant. */
	due: number;
	/** Une entrée par carte en route, sans ordre particulier. */
	tokens: BeltToken[];
	/** Révisions estimées par jour le long de l'axe (voir `reviews/forecast`). */
	forecast: ForecastPoint[];
}
