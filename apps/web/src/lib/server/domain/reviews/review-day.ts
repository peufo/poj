// Moitié « révision » de la journée Poj (doc/story/ajout-quotidien.md, « Suite ») : un jour
// est réussi quand chaque carte due à son ouverture a reçu au moins une réponse, ou quand
// 30 révisions ont été faites. Fonctions pures, plus le chargement de l'historique.
import type { Db } from '../db';
import type { Direction } from '../cards/types';
import { startOfDay } from '../time';
import { opposite, SIBLING_BURY_MS } from './availability';
import { parseState } from './scheduler';
import type { ReviewDay } from './types';

/** Révisions dans la journée au-delà desquelles le jour est réussi, retard ou pas. */
export const REVIEWS_CAP = 30;

/** Historique d'un sens : de quoi retrouver son échéance à n'importe quel instant. */
export interface ReviewTrack {
	cardId: string;
	direction: Direction;
	/** Sens révisé (toujours `a_to_b`, `b_to_a` si le deck est révisé dans les deux sens). */
	reviewed: boolean;
	/** Suppression de la carte (ou de son deck). */
	deletedAt: Date | null;
	/** Échéance actuelle. */
	due: Date;
	/** Réponses, de la plus ancienne à la plus récente, avec l'échéance qui les précédait. */
	logs: { at: Date; dueBefore: Date }[];
}

const NEVER = Number.POSITIVE_INFINITY;

/**
 * Jours de révision des jours civils (Europe/Zurich) qui commencent à `starts`, indexés par
 * ancienneté (0 : aujourd'hui, le jour de `now`).
 *
 * Une carte est due un jour si l'un de ses sens révisés est présentable à minuit : échue, et
 * pas mis de côté par une réponse au sens inverse dans les 24 h précédentes. C'est ce que
 * `countDue` aurait compté à l'ouverture du jour ; une carte qui échoit dans la journée
 * compte le lendemain. Une carte supprimée avant la fin du jour n'est plus due. Une réponse
 * compte quelle que soit sa note, sur le web comme par Claude, et pour n'importe quel sens.
 *
 * L'échéance d'un sens à un instant est celle qui précédait sa première réponse postérieure,
 * ou son échéance actuelle. Une réinitialisation (carte modifiée) ne laisse pas de trace :
 * avant elle, le sens passe pour non dû, ce qui ne peut que rendre un jour plus facile.
 */
export function summarizeReviewDays(tracks: ReviewTrack[], now: Date, days: Date[]): ReviewDay[] {
	const span = days.length;
	const starts = days.map((date) => date.getTime());
	const tomorrow = startOfDay(now, 1).getTime();
	const endOf = (ago: number) => (ago === 0 ? tomorrow : starts[ago - 1]);
	/** Ancienneté du jour qui contient `t` : -1 après aujourd'hui, `span` avant la période. */
	const dayOf = (t: number) => {
		if (t >= tomorrow) return -1;
		let [lo, hi] = [0, span];
		while (lo < hi) {
			const mid = (lo + hi) >> 1;
			if (starts[mid] <= t) hi = mid;
			else lo = mid + 1;
		}
		return lo;
	};
	/** Ancienneté du premier jour qui commence à `t` ou après, bornée à la période. */
	const firstDayFrom = (t: number) => {
		const ago = Math.min(dayOf(t), span);
		return ago < span && starts[ago] === t ? ago : ago - 1;
	};

	const reviews = Array.from({ length: span }, () => 0);
	const answered = Array.from({ length: span }, () => new Set<string>());
	const due = Array.from({ length: span }, () => new Set<string>());

	for (const track of tracks) {
		for (const { at } of track.logs) {
			const ago = dayOf(at.getTime());
			if (ago < 0 || ago >= span) continue;
			reviews[ago] += 1;
			answered[ago].add(track.cardId);
		}
	}

	const byCard = new Map<string, ReviewTrack[]>();
	for (const track of tracks) {
		const siblings = byCard.get(track.cardId);
		if (siblings) siblings.push(track);
		else byCard.set(track.cardId, [track]);
	}

	for (const track of tracks) {
		if (!track.reviewed) continue;
		const sibling = byCard
			.get(track.cardId)
			?.find((other) => other.reviewed && other.direction === opposite[track.direction]);
		/** Le sens inverse a été répondu dans les 24 h qui précèdent `t` : mis de côté. */
		const buried = (t: number) =>
			sibling?.logs.some(({ at }) => at.getTime() < t && at.getTime() > t - SIBLING_BURY_MS);
		const deletedAt = track.deletedAt?.getTime() ?? NEVER;
		// Entre deux réponses, l'échéance est celle qui précédait la seconde.
		for (let i = 0; i <= track.logs.length; i += 1) {
			const from = i === 0 ? -NEVER : track.logs[i - 1].at.getTime();
			const until = i < track.logs.length ? track.logs[i].at.getTime() : NEVER;
			const dueAt = (i < track.logs.length ? track.logs[i].dueBefore : track.due).getTime();
			for (let ago = firstDayFrom(Math.max(from, dueAt)); ago >= 0; ago -= 1) {
				const start = starts[ago];
				if (start >= until) break;
				if (deletedAt < endOf(ago)) continue;
				if (!buried(start)) due[ago].add(track.cardId);
			}
		}
	}

	return due.map((cards, ago) => {
		const done = [...cards].filter((cardId) => answered[ago].has(cardId)).length;
		const reached = reviews[ago] >= REVIEWS_CAP || (cards.size > 0 && done === cards.size);
		return {
			due: cards.size,
			answered: done,
			reviews: reviews[ago],
			reached,
			done: reached || cards.size === 0
		};
	});
}

/**
 * Historique des révisions du propriétaire, cartes supprimées comprises. Avec `from`, seules
 * les réponses utiles aux jours qui commencent à `from` ou après sont chargées (mise de côté
 * comprise, qui remonte aux 24 h précédentes).
 */
export async function loadReviewTracks(
	db: Db,
	ownerId: string,
	from?: Date
): Promise<ReviewTrack[]> {
	const since = from && new Date(from.getTime() - SIBLING_BURY_MS);
	const rows = await db.review.findMany({
		where: { card: { ownerId } },
		select: {
			cardId: true,
			direction: true,
			due: true,
			card: { select: { deletedAt: true, deck: { select: { bothDirections: true } } } },
			logs: {
				where: since && { reviewedAt: { gte: since } },
				select: { reviewedAt: true, stateBefore: true },
				orderBy: { reviewedAt: 'asc' }
			}
		}
	});
	return rows.map((row) => ({
		cardId: row.cardId,
		direction: row.direction,
		reviewed: row.direction === 'a_to_b' || row.card.deck.bothDirections,
		deletedAt: row.card.deletedAt,
		due: row.due,
		logs: row.logs.map((log) => ({
			at: log.reviewedAt,
			dueBefore: parseState(log.stateBefore).due
		}))
	}));
}
