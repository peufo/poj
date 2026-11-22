// Historique d'activité : les jours de l'année écoulée en colonnes de semaines, du lundi au
// dimanche, et leur intensité.

/** Activité d'un jour civil, telle que le domaine la renvoie. */
export interface ActivityDay {
	/** `AAAA-MM-JJ`. */
	date: string;
	added: number;
	reviewed: number;
}

/** Intensité d'une case : 0 pour un jour sans rien, puis 1 à 4. */
export type ActivityLevel = 0 | 1 | 2 | 3 | 4;

export interface ActivityCell extends ActivityDay {
	level: ActivityLevel;
}

export interface ActivityWeek {
	/** Lundi à dimanche ; `null` pour les jours à venir de la semaine en cours. */
	days: (ActivityCell | null)[];
	/** Mois qui commence dans la semaine (son 1er y figure), abrégé : « janv. ». */
	month: string | null;
}

/** Une date `AAAA-MM-JJ` lue à minuit UTC : à formater avec `timeZone: 'UTC'`. */
const dateOf = (date: string) => new Date(`${date}T00:00:00Z`);

const monthFormat = new Intl.DateTimeFormat('fr-FR', { month: 'short', timeZone: 'UTC' });
const longFormat = new Intl.DateTimeFormat('fr-FR', {
	weekday: 'long',
	day: 'numeric',
	month: 'long',
	year: 'numeric',
	timeZone: 'UTC'
});

/** « janv. » pour une date `AAAA-MM-JJ`. */
export const formatMonth = (date: string) => monthFormat.format(dateOf(date));

/** « mercredi 7 janvier 2026 » pour une date `AAAA-MM-JJ`. */
export const formatActivityDate = (date: string) => longFormat.format(dateOf(date));

/**
 * Seuils des niveaux 2, 3 et 4 : les quartiles des jours actifs. Sur une habitude régulière,
 * un seul gros jour n'écrase pas les autres, comme le ferait une échelle sur le maximum.
 */
export function activityThresholds(totals: number[]): [number, number, number] {
	const active = totals.filter((total) => total > 0).sort((a, b) => a - b);
	const quantile = (q: number) => active[Math.floor(q * (active.length - 1))] ?? 0;
	return [quantile(0.25), quantile(0.5), quantile(0.75)];
}

export function activityLevel(
	total: number,
	[q1, q2, q3]: [number, number, number]
): ActivityLevel {
	if (total <= 0) return 0;
	if (total > q3) return 4;
	if (total > q2) return 3;
	if (total > q1) return 2;
	return 1;
}

/**
 * Les jours (consécutifs, du plus ancien à aujourd'hui, le premier un lundi) rangés en
 * semaines, chaque jour avec son intensité.
 */
export function activityWeeks(days: ActivityDay[]): ActivityWeek[] {
	const thresholds = activityThresholds(days.map((day) => day.added + day.reviewed));
	const weeks: ActivityWeek[] = [];
	for (let start = 0; start < days.length; start += 7) {
		const week = days.slice(start, start + 7).map((day) => ({
			...day,
			level: activityLevel(day.added + day.reviewed, thresholds)
		}));
		const first = week.find((day) => day.date.endsWith('-01'));
		weeks.push({
			days: Array.from({ length: 7 }, (_, i) => week[i] ?? null),
			month: first ? formatMonth(first.date) : null
		});
	}
	return weeks;
}
