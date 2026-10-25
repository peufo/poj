import type { Card, Review, ReviewLog } from '../../db/generated/prisma/client';

export type {
	Card,
	Direction,
	Origin,
	Rating,
	Review,
	ReviewLog
} from '../../db/generated/prisma/client';

export interface CardInput {
	french: string;
	english: string;
	context?: string | null;
}

export type CardWithReviews = Card & { reviews: Review[] };

export type CardDetail = Card & { reviews: (Review & { logs: ReviewLog[] })[] };

export interface CardStats {
	totalCards: number;
	dueToday: number;
}
