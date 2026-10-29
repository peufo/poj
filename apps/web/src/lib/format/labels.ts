// Vocabulaire partagé de l'interface : sens, notes, origines, dates.

export type Direction = 'a_to_b' | 'b_to_a';
export type Rating = 'again' | 'hard' | 'good' | 'easy';
export type Origin = 'web' | 'claude';

export const ratings: readonly Rating[] = ['again', 'hard', 'good', 'easy'];

export const ratingLabels: Record<Rating, string> = {
	again: 'Again',
	hard: 'Hard',
	good: 'Good',
	easy: 'Easy'
};

export const ratingMeanings: Record<Rating, string> = {
	again: 'Faux, ou je ne sais pas',
	hard: 'Juste, avec un indice ou une longue hésitation',
	good: 'Juste',
	easy: 'Trop facile'
};

export const originLabels: Record<Origin, string> = {
	web: 'web',
	claude: 'Claude'
};

/** Fuseau de référence de l'interface, le même que celui du domaine (« aujourd'hui »). */
export const TIME_ZONE = 'Europe/Zurich';

const dateFormat = new Intl.DateTimeFormat('fr-FR', {
	day: 'numeric',
	month: 'short',
	year: 'numeric',
	timeZone: TIME_ZONE
});
const dateTimeFormat = new Intl.DateTimeFormat('fr-FR', {
	day: 'numeric',
	month: 'short',
	hour: '2-digit',
	minute: '2-digit',
	timeZone: TIME_ZONE
});
const weekdayFormat = new Intl.DateTimeFormat('fr-FR', {
	weekday: 'long',
	day: 'numeric',
	month: 'short',
	timeZone: TIME_ZONE
});
const dueFormat = new Intl.DateTimeFormat('fr-FR', {
	weekday: 'short',
	day: 'numeric',
	month: 'short',
	hour: '2-digit',
	minute: '2-digit',
	timeZone: TIME_ZONE
});
const timeFormat = new Intl.DateTimeFormat('fr-FR', {
	hour: '2-digit',
	minute: '2-digit',
	timeZone: TIME_ZONE
});
const dayKeyFormat = new Intl.DateTimeFormat('en-CA', {
	year: 'numeric',
	month: '2-digit',
	day: '2-digit',
	timeZone: TIME_ZONE
});

export const formatDate = (date: Date) => dateFormat.format(date);
export const formatDateTime = (date: Date) => dateTimeFormat.format(date);
export const formatWeekday = (date: Date) => weekdayFormat.format(date);

/** Numéro du jour civil (Europe/Zurich) d'un instant, pour comparer des jours. */
export function dayNumber(date: Date): number {
	const [year, month, day] = dayKeyFormat.format(date).split('-').map(Number);
	return Date.UTC(year, month - 1, day) / 86_400_000;
}

/** Vrai si les deux instants tombent le même jour civil (Europe/Zurich). */
export const isSameDay = (a: Date, b: Date) => dayNumber(a) === dayNumber(b);

/**
 * Date et heure d'une échéance : l'heure seule si elle tombe aujourd'hui (« 14:32 »),
 * sinon le jour en plus (« lun. 26 oct., 14:32 »).
 */
export function formatDue(date: Date, now: Date): string {
	return (isSameDay(date, now) ? timeFormat : dueFormat).format(date);
}

export const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export function plural(count: number, one: string, many = `${one}s`): string {
	return `${count} ${count > 1 ? many : one}`;
}
