import type { Db } from '../db';
import { calendarDate, startOfDay, weekdayOf } from '../time';

export type ActivityService = ReturnType<typeof createActivityService>;

/** Semaines de l'historique par défaut : l'année écoulée, semaine en cours comprise. */
export const ACTIVITY_WEEKS = 53;

/** L'activité d'un jour civil (`TIME_ZONE`). */
export interface ActivityDay {
	/** `AAAA-MM-JJ`. */
	date: string;
	/** Cartes ajoutées ce jour-là, et toujours là. */
	added: number;
	/** Réponses données ce jour-là. */
	reviewed: number;
}

export interface ActivityScope {
	/** Seulement ce deck ; tous sans. */
	deckId?: string;
	/** Nombre de semaines, celle en cours comprise. */
	weeks?: number;
}

/** Indice du dernier début de jour qui précède `time` (`starts` croissant, `time` ≥ `starts[0]`). */
function dayIndex(starts: number[], time: number): number {
	let low = 0;
	let high = starts.length - 1;
	while (low < high) {
		const mid = Math.ceil((low + high) / 2);
		if ((starts[mid] ?? Infinity) <= time) low = mid;
		else high = mid - 1;
	}
	return low;
}

export function createActivityService(db: Db) {
	return {
		/**
		 * Activité jour par jour, du lundi d'il y a `weeks - 1` semaines jusqu'à aujourd'hui :
		 * les cartes ajoutées (hors supprimées) et les réponses données. Une réponse compte
		 * même si sa carte a été supprimée ou réinitialisée depuis, comme dans les vélocités :
		 * l'effort a eu lieu.
		 */
		async daily(
			ownerId: string,
			now = new Date(),
			{ deckId, weeks = ACTIVITY_WEEKS }: ActivityScope = {}
		): Promise<ActivityDay[]> {
			const count = (weeks - 1) * 7 + weekdayOf(calendarDate(now)) + 1;
			const starts = Array.from({ length: count }, (_, i) => startOfDay(now, i - count + 1));
			const [first] = starts;
			if (!first) return [];
			const range = { gte: first, lt: startOfDay(now, 1) };

			const [cards, logs] = await Promise.all([
				db.card.findMany({
					where: { ownerId, deckId, deletedAt: null, createdAt: range },
					select: { createdAt: true }
				}),
				db.reviewLog.findMany({
					where: { reviewedAt: range, review: { card: { ownerId, deckId } } },
					select: { reviewedAt: true }
				})
			]);

			const days: ActivityDay[] = starts.map((start) => ({
				date: calendarDate(start),
				added: 0,
				reviewed: 0
			}));
			const times = starts.map((start) => start.getTime());
			const dayAt = (date: Date) => days[dayIndex(times, date.getTime())];
			for (const { createdAt } of cards) {
				const day = dayAt(createdAt);
				if (day) day.added += 1;
			}
			for (const { reviewedAt } of logs) {
				const day = dayAt(reviewedAt);
				if (day) day.reviewed += 1;
			}
			return days;
		}
	};
}
