// Planification FSRS (doc/specs/repetition.md) : fonctions pures autour de ts-fsrs,
// sans accès à la base. Le reste du domaine ne manipule que `FsrsState`.
import {
	createEmptyCard,
	fsrs,
	Rating as FsrsRating,
	State,
	type Card as FsrsCard,
	type Grade
} from 'ts-fsrs';
import type { Rating, ReviewState } from '../../db/generated/prisma/client';

/** Champs FSRS d'une ligne `Review` : une `Review` Prisma s'y conforme telle quelle. */
export interface FsrsState {
	due: Date;
	stability: number;
	difficulty: number;
	scheduledDays: number;
	learningSteps: number;
	reps: number;
	lapses: number;
	state: ReviewState;
	lastReview: Date | null;
}

const scheduler = fsrs({ request_retention: 0.9, enable_fuzz: true });

const toFsrsRating: Record<Rating, Grade> = {
	again: FsrsRating.Again,
	hard: FsrsRating.Hard,
	good: FsrsRating.Good,
	easy: FsrsRating.Easy
};

const toFsrsState: Record<ReviewState, State> = {
	new: State.New,
	learning: State.Learning,
	review: State.Review,
	relearning: State.Relearning
};

const fromFsrsState: Record<State, ReviewState> = {
	[State.New]: 'new',
	[State.Learning]: 'learning',
	[State.Review]: 'review',
	[State.Relearning]: 'relearning'
};

/** Copie les seuls champs FSRS, pour pouvoir passer une ligne `Review` complète. */
export function pickState(s: FsrsState): FsrsState {
	return {
		due: s.due,
		stability: s.stability,
		difficulty: s.difficulty,
		scheduledDays: s.scheduledDays,
		learningSteps: s.learningSteps,
		reps: s.reps,
		lapses: s.lapses,
		state: s.state,
		lastReview: s.lastReview
	};
}

export function toFsrsCard(s: FsrsState): FsrsCard {
	return {
		due: s.due,
		stability: s.stability,
		difficulty: s.difficulty,
		// Déprécié : ts-fsrs 5 le recalcule depuis `last_review`.
		elapsed_days: 0,
		scheduled_days: s.scheduledDays,
		learning_steps: s.learningSteps,
		reps: s.reps,
		lapses: s.lapses,
		state: toFsrsState[s.state],
		last_review: s.lastReview ?? undefined
	};
}

export function fromFsrsCard(card: FsrsCard): FsrsState {
	return {
		due: card.due,
		stability: card.stability,
		difficulty: card.difficulty,
		scheduledDays: card.scheduled_days,
		learningSteps: card.learning_steps,
		reps: card.reps,
		lapses: card.lapses,
		state: fromFsrsState[card.state],
		lastReview: card.last_review ?? null
	};
}

/** État d'une révision neuve, due immédiatement. */
export function emptyState(now: Date): FsrsState {
	return fromFsrsCard(createEmptyCard(now));
}

/** Après un indice, la note est au mieux `hard`. */
export function capRating(rating: Rating, hintUsed: boolean): Rating {
	return hintUsed && (rating === 'good' || rating === 'easy') ? 'hard' : rating;
}

/** Applique une note et renvoie le nouvel état ainsi que la note effectivement retenue. */
export function applyRating(
	state: FsrsState,
	rating: Rating,
	now: Date,
	{ hintUsed }: { hintUsed: boolean }
): { state: FsrsState; rating: Rating } {
	const retained = capRating(rating, hintUsed);
	const { card } = scheduler.next(toFsrsCard(state), now, toFsrsRating[retained]);
	return { state: fromFsrsCard(card), rating: retained };
}

/**
 * Échéance que donnerait chaque note, sans l'appliquer (intervalles affichés sous les
 * boutons de note). Avec le même `now`, elle coïncide avec celle d'`applyRating`.
 */
export function previewDue(state: FsrsState, now: Date): Record<Rating, Date> {
	const log = scheduler.repeat(toFsrsCard(state), now);
	return {
		again: log[FsrsRating.Again].card.due,
		hard: log[FsrsRating.Hard].card.due,
		good: log[FsrsRating.Good].card.due,
		easy: log[FsrsRating.Easy].card.due
	};
}

/** Forme JSON de l'état, stockée dans `ReviewLog.stateBefore`. */
export type SerializedState = Omit<FsrsState, 'due' | 'lastReview'> & {
	due: string;
	lastReview: string | null;
};

export function serializeState(s: FsrsState): SerializedState {
	return {
		...pickState(s),
		due: s.due.toISOString(),
		lastReview: s.lastReview?.toISOString() ?? null
	};
}

export function parseState(json: SerializedState): FsrsState {
	return {
		...json,
		due: new Date(json.due),
		lastReview: json.lastReview ? new Date(json.lastReview) : null
	};
}
