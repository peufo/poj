// Données d'exemple du lab. Elles imitent le modèle du jalon 1 (cartes, deux révisions,
// historique) sans dépendre de Prisma. L'instant présent est figé pour que les maquettes
// soient stables d'un rendu à l'autre.

import { calendarDaysBetween, formatInterval } from '#lib/format/due.js';
import { masteryOf, type FsrsState, type MasteryLevel } from '#lib/format/mastery.js';
import type { Direction, Origin, Rating } from '#lib/format/labels.js';

export const LAB_NOW = new Date('2026-10-27T08:30:00');

const DAY = 86_400_000;
const at = (days: number) => new Date(LAB_NOW.getTime() + days * DAY);

export type SampleReview = {
	direction: Direction;
	due: Date;
	state: FsrsState;
	stability: number;
	reps: number;
	lastRating: Rating | null;
	isNew: boolean;
	mastery: MasteryLevel;
	intervals: Record<Rating, string>;
};

export type SampleLog = {
	at: Date;
	direction: Direction;
	rating: Rating;
	origin: Origin;
	hintUsed: boolean;
};

export type SampleCard = {
	id: string;
	french: string;
	english: string;
	context: string | null;
	origin: Origin;
	createdAt: Date;
	reviews: [SampleReview, SampleReview];
	history: SampleLog[];
};

type ReviewSpec = [
	due: number,
	state: FsrsState,
	stability: number,
	reps: number,
	last: Rating | null
];

function intervalsFor(state: FsrsState, stability: number): Record<Rating, string> {
	if (state === 0) return { again: '1 min', hard: '6 min', good: '10 min', easy: '5 j' };
	return {
		again: '10 min',
		hard: formatInterval(Math.max(1, stability * 0.8) * DAY),
		good: formatInterval((stability * 2 + 1) * DAY),
		easy: formatInterval((stability * 3.5 + 2) * DAY)
	};
}

function review(
	direction: Direction,
	[due, state, stability, reps, last]: ReviewSpec
): SampleReview {
	return {
		direction,
		due: at(due),
		state,
		stability,
		reps,
		lastRating: last,
		isNew: state === 0,
		mastery: masteryOf({ state, stability }),
		intervals: intervalsFor(state, stability)
	};
}

const pattern: Rating[] = ['good', 'good', 'again', 'good', 'hard', 'good', 'easy', 'good'];

function historyFor(card: Omit<SampleCard, 'history'>): SampleLog[] {
	const logs: SampleLog[] = [];
	const span = LAB_NOW.getTime() - card.createdAt.getTime();
	card.reviews.forEach((r, ri) => {
		for (let k = 0; k < r.reps; k++) {
			const last = k === r.reps - 1;
			const rating = last && r.lastRating ? r.lastRating : pattern[(k + ri * 3) % pattern.length];
			logs.push({
				at: new Date(
					card.createdAt.getTime() + ((k + 0.5 + ri * 0.3) / (r.reps + 0.5)) * span * 0.92
				),
				direction: r.direction,
				rating,
				origin: (k + ri) % 3 === 1 ? 'web' : card.origin,
				hintUsed: rating === 'hard' && k % 2 === 0
			});
		}
	});
	return logs.sort((a, b) => b.at.getTime() - a.at.getTime());
}

function card(
	id: string,
	french: string,
	english: string,
	context: string | null,
	origin: Origin,
	createdDaysAgo: number,
	frToEn: ReviewSpec,
	enToFr: ReviewSpec
): SampleCard {
	const base = {
		id,
		french,
		english,
		context,
		origin,
		createdAt: at(-createdDaysAgo),
		reviews: [review('fr_to_en', frToEn), review('en_to_fr', enToFr)] as [
			SampleReview,
			SampleReview
		]
	};
	return { ...base, history: historyFor(base) };
}

const NEW: ReviewSpec = [-0.001, 0, 0, 0, null];

export const cards: SampleCard[] = [
	card(
		'rappel',
		'un rappel',
		'a booster shot',
		'Chez le médecin, à propos du vaccin contre la grippe.',
		'claude',
		1,
		NEW,
		NEW
	),
	card(
		'flemme',
		'avoir la flemme',
		"can't be bothered",
		'Un dimanche pluvieux, à propos du sport.',
		'claude',
		3,
		NEW,
		NEW
	),
	card(
		'se-faire-avoir',
		'se faire avoir',
		'to get ripped off',
		"Le taxi à l'aéroport, 80 € pour 10 km.",
		'claude',
		9,
		[3, 2, 4, 2, 'good'],
		[5, 2, 5, 2, 'good']
	),
	card(
		'rallonge',
		'une rallonge',
		'an extension cord',
		'Pour brancher la lampe au fond du jardin.',
		'web',
		12,
		[-0.6, 2, 2.5, 2, 'good'],
		[0.4, 2, 3, 2, 'good']
	),
	card(
		'ras-le-bol',
		'en avoir ras le bol',
		'to be fed up',
		'Dans le train, un voyageur au téléphone.',
		'claude',
		15,
		[1.2, 2, 3, 3, 'good'],
		[7, 2, 8, 3, 'good']
	),
	card(
		'devis',
		'un devis',
		'a quote',
		'Le plombier, pour la salle de bains (pas une citation).',
		'web',
		18,
		[-0.05, 1, 0.5, 2, 'again'],
		[1, 2, 2, 2, 'good']
	),
	card(
		'lechevitrine',
		'faire du lèche-vitrine',
		'to go window-shopping',
		null,
		'web',
		22,
		[11, 2, 20, 4, 'good'],
		[23, 2, 31, 4, 'easy']
	),
	card(
		'mer-a-boire',
		"c'est pas la mer à boire",
		"it's not rocket science",
		"Pour rassurer quelqu'un avant un exercice.",
		'web',
		25,
		[0.15, 2, 3, 3, 'again'],
		[9, 2, 12, 3, 'good']
	),
	card(
		'bouchon',
		'un bouchon',
		'a traffic jam',
		"À la radio, sur l'A1 entre Lausanne et Genève.",
		'claude',
		30,
		[-1.5, 2, 4, 4, 'hard'],
		[2.3, 2, 6, 3, 'good']
	),
	card(
		'trajet',
		'un trajet',
		'a commute',
		'Au travail : « Ton trajet, ça te prend combien de temps ? »',
		'web',
		36,
		[13, 2, 17, 4, 'good'],
		[-0.3, 2, 10, 4, 'good']
	),
	card(
		'tenir-le-coup',
		'tenir le coup',
		'to hang in there',
		"Un collègue, la veille d'une mise en production difficile.",
		'claude',
		41,
		[-0.2, 2, 9, 5, 'good'],
		[6, 2, 14, 4, 'good']
	),
	card(
		'bout-de-champ',
		'à tout bout de champ',
		'at every turn',
		null,
		'web',
		47,
		[4, 2, 8, 5, 'hard'],
		[15, 2, 19, 5, 'good']
	),
	card(
		'pieds-dans-le-plat',
		'mettre les pieds dans le plat',
		"to put one's foot in it",
		"Quand j'ai parlé de la fête surprise devant elle.",
		'claude',
		52,
		[38, 2, 45, 7, 'good'],
		[64, 2, 70, 6, 'good']
	),
	card(
		'tirer-au-sort',
		'tirer au sort',
		'to draw lots',
		null,
		'web',
		70,
		[120, 2, 130, 8, 'easy'],
		[95, 2, 100, 8, 'good']
	)
];

export const findCard = (id: string) => cards.find((c) => c.id === id);

export const allReviews = cards.flatMap((c) => c.reviews.map((r) => ({ card: c, review: r })));

export const dueNow = allReviews.filter(({ review: r }) => r.due <= LAB_NOW);

export const dueToday = allReviews.filter(
	({ review: r }) => calendarDaysBetween(LAB_NOW, r.due) <= 0
);

/** Révisions dues par jour civil ; le premier jour inclut le retard. */
export function horizon(days: number) {
	return Array.from({ length: days }, (_, i) => ({
		date: at(i),
		count: allReviews.filter(({ review: r }) => {
			const d = calendarDaysBetween(LAB_NOW, r.due);
			return i === 0 ? d <= 0 : d === i;
		}).length
	}));
}

export function isDueOnDay(due: Date, day: number) {
	const d = calendarDaysBetween(LAB_NOW, due);
	return day === 0 ? d <= 0 : d === day;
}

export const masteryCounts = allReviews.reduce(
	(acc, { review: r }) => {
		acc[r.mastery] += 1;
		return acc;
	},
	{ 0: 0, 1: 0, 2: 0, 3: 0 } as Record<MasteryLevel, number>
);

/** Suggestion DeepL simulée : le contexte change la traduction de « bouchon ». */
export function fakeDeepL(french: string, context: string): string {
	const text = french.trim().toLowerCase();
	if (text === 'un bouchon')
		return /route|radio|voiture|autoroute|a1/i.test(context) ? 'a traffic jam' : 'a cork';
	const known: Record<string, string> = {
		'tenir bon': 'to hang in there',
		'tenir le coup': 'to hold on',
		'un devis': 'an estimate',
		'avoir la flemme': 'to feel lazy'
	};
	return known[text] ?? 'to keep going';
}

export const normalize = (text: string) => text.trim().replace(/\s+/g, ' ').toLowerCase();
