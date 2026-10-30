import type { Db } from '../db';
import { calendarDaysBetween, startOfDay } from '../time';
import { loadReviewTracks, summarizeReviewDays, type ReviewTrack } from '../reviews/review-day';
import type { ReviewDay } from '../reviews/types';
import type { AddDay, DailyProgress, DayLevel, GoalDay } from './types';

export type DailyGoalService = ReturnType<typeof createDailyGoalService>;

/** Objectif quotidien tant que l'utilisateur ne l'a pas changé. */
export const DEFAULT_DAILY_GOAL = 2;
export const MIN_DAILY_GOAL = 1;
export const MAX_DAILY_GOAL = 20;

/** Jours manqués d'affilée qui arrêtent la série (un seul est toléré). */
const MISSES_TO_BREAK = 2;

/** Un changement d'objectif, applicable à partir de `effectiveFrom` (minuit local). */
export interface GoalChange {
	goal: number;
	effectiveFrom: Date;
}

/** Objectif en vigueur le jour qui commence à `dayStart`. `changes` est trié par date. */
function goalOn(changes: GoalChange[], dayStart: Date): number {
	let goal = DEFAULT_DAILY_GOAL;
	for (const change of changes) {
		if (change.effectiveFrom.getTime() > dayStart.getTime()) break;
		goal = change.goal;
	}
	return goal;
}

/** Niveau d'une journée : l'ajout, et la révision (sans objet quand rien n'était dû). */
function levelOf(add: AddDay, review: ReviewDay): DayLevel {
	if (add.reached && review.done) return 'full';
	return add.reached || review.reached ? 'partial' : 'none';
}

/**
 * Série en cours et record, sur des journées pleines ou non, de la plus ancienne à
 * aujourd'hui. Un jour non plein est toléré (il ne compte pas), deux d'affilée arrêtent la
 * série. Aujourd'hui compte s'il est déjà plein, et n'est jamais manqué tant qu'il n'est pas
 * fini.
 */
export function streaksOf(full: boolean[]): { streak: number; best: number } {
	let streak = 0;
	let best = 0;
	let misses = 0;
	full.forEach((isFull, i) => {
		if (isFull) {
			streak += 1;
			misses = 0;
		} else if (i < full.length - 1) {
			misses += 1;
			if (misses >= MISSES_TO_BREAK) streak = 0;
		}
		best = Math.max(best, streak);
	});
	return { streak, best };
}

/**
 * Calendrier d'accomplissement des `days` derniers jours civils (Europe/Zurich), aujourd'hui
 * compris, avec la série en cours et le record, calculés sur tout l'historique.
 *
 * La journée Poj réunit deux objectifs : l'ajout (le nombre de cartes créées atteint
 * l'objectif en vigueur ce jour-là) et la révision (voir `summarizeReviewDays`). Seules les
 * journées pleines comptent pour la série.
 */
export function summarizeDailyGoal(
	createdAt: Date[],
	changes: GoalChange[],
	tracks: ReviewTrack[],
	now: Date,
	days: number
): DailyProgress {
	const sorted = [...changes].sort((a, b) => a.effectiveFrom.getTime() - b.effectiveFrom.getTime());
	// Cartes créées par jour, indexées par ancienneté (0 : aujourd'hui).
	const counts = new Map<number, number>();
	// Avant la première carte, aucune journée ne peut être pleine : l'historique s'arrête là.
	let span = days;
	for (const at of createdAt) {
		const ago = calendarDaysBetween(at, now);
		if (ago < 0) continue;
		counts.set(ago, (counts.get(ago) ?? 0) + 1);
		span = Math.max(span, ago + 1);
	}
	// Minuit de chaque jour, indexé par ancienneté.
	const dates = Array.from({ length: span }, (_, ago) => startOfDay(now, -ago));

	// Du plus ancien jour à aujourd'hui.
	const all = summarizeReviewDays(tracks, now, dates)
		.map((review, ago): GoalDay => {
			const date = dates[ago];
			const count = counts.get(ago) ?? 0;
			const goal = goalOn(sorted, date);
			const add = { count, goal, reached: count >= goal };
			return { date, add, review, level: levelOf(add, review) };
		})
		.reverse();
	const today = all[all.length - 1];

	return {
		goal: today.add.goal,
		today,
		...streaksOf(all.map((day) => day.level === 'full')),
		days: all.slice(-days)
	};
}

export function createDailyGoalService(db: Db) {
	function changes(userId: string): Promise<GoalChange[]> {
		return db.dailyGoal.findMany({
			where: { userId },
			select: { goal: true, effectiveFrom: true },
			orderBy: { effectiveFrom: 'asc' }
		});
	}

	/** Journées des `days` derniers jours ; avec `from`, sans l'historique d'avant `from`. */
	async function summarize(userId: string, now: Date, days: number, from?: Date) {
		const [cards, goals, tracks] = await Promise.all([
			db.card.findMany({
				where: { ownerId: userId, createdAt: from && { gte: from } },
				select: { createdAt: true }
			}),
			changes(userId),
			loadReviewTracks(db, userId, from)
		]);
		return summarizeDailyGoal(
			cards.map((card) => card.createdAt),
			goals,
			tracks,
			now,
			days
		);
	}

	return {
		/** Objectif en vigueur aujourd'hui. */
		async goal(userId: string, now = new Date()): Promise<number> {
			return goalOn(await changes(userId), startOfDay(now));
		},

		/**
		 * Change l'objectif à partir d'aujourd'hui ; les jours passés gardent le leur. Un second
		 * changement le même jour remplace le premier. L'objectif arrive validé
		 * (`dailyGoalSchema`), entre `MIN_DAILY_GOAL` et `MAX_DAILY_GOAL`.
		 */
		async setGoal(userId: string, goal: number, now = new Date()): Promise<void> {
			const effectiveFrom = startOfDay(now);
			await db.dailyGoal.upsert({
				where: { userId_effectiveFrom: { userId, effectiveFrom } },
				create: { userId, goal, effectiveFrom },
				update: { goal }
			});
		},

		/**
		 * Calendrier des `days` derniers jours (aujourd'hui compris), série en cours et record.
		 * Les cartes supprimées comptent pour leur jour de création : ce qui compte, c'est
		 * l'ajout. Les révisions comptent toutes, sur le web comme par Claude, tous decks
		 * confondus.
		 */
		progress(userId: string, now = new Date(), days = 56): Promise<DailyProgress> {
			return summarize(userId, now, days);
		},

		/**
		 * La journée en cours seule : de quoi savoir, après une réponse ou un ajout, si elle
		 * vient de devenir pleine. Ne charge que l'historique utile à aujourd'hui.
		 */
		async today(userId: string, now = new Date()): Promise<GoalDay> {
			return (await summarize(userId, now, 1, startOfDay(now))).today;
		}
	};
}
