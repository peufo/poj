import type { Card, Deck, Review, ReviewLog } from '../../db/generated/prisma/client';
import type { ReviewDay } from '../reviews/types';

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

/** Moitié « ajout » de la journée Poj : cartes créées et objectif de ce jour-là. */
export interface AddDay {
	/** Cartes créées ce jour-là, supprimées comprises. */
	count: number;
	/** Objectif en vigueur ce jour-là. */
	goal: number;
	reached: boolean;
}

/**
 * Accomplissement d'une journée : pleine quand les deux objectifs sont atteints (un jour sans
 * carte due ne demande que l'ajout), claire quand un seul l'est par une action, vide sinon.
 */
export type DayLevel = 'full' | 'partial' | 'none';

/** Un jour civil du calendrier d'accomplissement (journée Poj : ajout et révision). */
export interface GoalDay {
	/** Minuit (Europe/Zurich) qui commence le jour. */
	date: Date;
	add: AddDay;
	review: ReviewDay;
	level: DayLevel;
}

export interface DailyProgress {
	/** Objectif d'ajout en vigueur aujourd'hui. */
	goal: number;
	/** Le jour en cours, aussi en dernière position de `days`. */
	today: GoalDay;
	/** Journées pleines de la série en cours (les jours manqués tolérés n'y comptent pas). */
	streak: number;
	/** Plus longue série, en cours comprise. */
	best: number;
	/** Les jours de la période, du plus ancien à aujourd'hui. */
	days: GoalDay[];
}
