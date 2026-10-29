import type { Db } from '../db';
import { calendarDaysBetween, startOfDay } from '../time';
import type { DailyProgress, GoalDay } from './types';

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

/**
 * Calendrier d'accomplissement des `days` derniers jours civils (Europe/Zurich), aujourd'hui
 * compris, et série en cours, calculée sur tout l'historique.
 *
 * Un jour est réussi quand le nombre de cartes créées atteint l'objectif en vigueur ce
 * jour-là. La série compte les jours réussis consécutifs : un jour manqué est toléré (il ne
 * compte pas), deux d'affilée l'arrêtent. Aujourd'hui compte s'il est déjà réussi, et n'est
 * jamais manqué tant qu'il n'est pas fini.
 */
export function summarizeDailyGoal(
	createdAt: Date[],
	changes: GoalChange[],
	now: Date,
	days: number
): DailyProgress {
	const sorted = [...changes].sort((a, b) => a.effectiveFrom.getTime() - b.effectiveFrom.getTime());
	// Cartes créées par jour, indexées par ancienneté (0 : aujourd'hui).
	const counts = new Map<number, number>();
	for (const at of createdAt) {
		const ago = calendarDaysBetween(at, now);
		if (ago >= 0) counts.set(ago, (counts.get(ago) ?? 0) + 1);
	}
	const day = (ago: number): GoalDay => {
		const date = startOfDay(now, -ago);
		const count = counts.get(ago) ?? 0;
		const goal = goalOn(sorted, date);
		return { date, count, goal, reached: count >= goal };
	};

	const today = day(0);
	let streak = today.reached ? 1 : 0;
	// Au-delà de la plus ancienne carte, tous les jours sont manqués : la boucle s'arrête.
	for (let ago = 1, misses = 0; misses < MISSES_TO_BREAK; ago += 1) {
		if (day(ago).reached) {
			streak += 1;
			misses = 0;
		} else {
			misses += 1;
		}
	}

	return {
		goal: today.goal,
		today,
		streak,
		days: Array.from({ length: days }, (_, i) => (i === days - 1 ? today : day(days - 1 - i)))
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

	return {
		/** Objectif en vigueur aujourd'hui. */
		async goal(userId: string, now = new Date()): Promise<number> {
			return goalOn(await changes(userId), startOfDay(now));
		},

		/**
		 * Change l'objectif à partir d'aujourd'hui ; les jours passés gardent le leur. Un second
		 * changement le même jour remplace le premier.
		 */
		async setGoal(userId: string, goal: number, now = new Date()): Promise<void> {
			if (!Number.isInteger(goal) || goal < MIN_DAILY_GOAL || goal > MAX_DAILY_GOAL)
				throw new RangeError(
					`Daily goal must be an integer between ${MIN_DAILY_GOAL} and ${MAX_DAILY_GOAL}`
				);
			const effectiveFrom = startOfDay(now);
			await db.dailyGoal.upsert({
				where: { userId_effectiveFrom: { userId, effectiveFrom } },
				create: { userId, goal, effectiveFrom },
				update: { goal }
			});
		},

		/**
		 * Calendrier des `days` derniers jours (aujourd'hui compris) et série en cours. Les
		 * cartes supprimées comptent pour leur jour de création : ce qui compte, c'est l'ajout.
		 */
		async progress(userId: string, now = new Date(), days = 56): Promise<DailyProgress> {
			const [cards, goals] = await Promise.all([
				db.card.findMany({ where: { ownerId: userId }, select: { createdAt: true } }),
				changes(userId)
			]);
			return summarizeDailyGoal(
				cards.map((card) => card.createdAt),
				goals,
				now,
				days
			);
		}
	};
}
