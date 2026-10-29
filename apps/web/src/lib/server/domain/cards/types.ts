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

/** Un jour civil du calendrier d'accomplissement : cartes créées et objectif de ce jour-là. */
export interface GoalDay {
	/** Minuit (Europe/Zurich) qui commence le jour. */
	date: Date;
	/** Cartes créées ce jour-là, supprimées comprises. */
	count: number;
	/** Objectif en vigueur ce jour-là. */
	goal: number;
	reached: boolean;
}

export interface DailyProgress {
	/** Objectif en vigueur aujourd'hui. */
	goal: number;
	/** Le jour en cours, aussi en dernière position de `days`. */
	today: GoalDay;
	/** Jours réussis de la série en cours (les jours manqués tolérés n'y comptent pas). */
	streak: number;
	/** Les jours de la période, du plus ancien à aujourd'hui. */
	days: GoalDay[];
}
