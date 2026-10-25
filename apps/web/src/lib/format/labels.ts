// Vocabulaire partagé de l'interface : sens, notes, origines, dates.

export type Direction = 'fr_to_en' | 'en_to_fr';
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

export const directionLabels: Record<Direction, { long: string; target: 'EN' | 'FR' }> = {
	fr_to_en: { long: 'Français → anglais', target: 'EN' },
	en_to_fr: { long: 'Anglais → français', target: 'FR' }
};

export const originLabels: Record<Origin, string> = {
	web: 'web',
	claude: 'Claude'
};

const dateFormat = new Intl.DateTimeFormat('fr-FR', {
	day: 'numeric',
	month: 'short',
	year: 'numeric'
});
const dateTimeFormat = new Intl.DateTimeFormat('fr-FR', {
	day: 'numeric',
	month: 'short',
	hour: '2-digit',
	minute: '2-digit'
});
const weekdayFormat = new Intl.DateTimeFormat('fr-FR', {
	weekday: 'long',
	day: 'numeric',
	month: 'short'
});

export const formatDate = (date: Date) => dateFormat.format(date);
export const formatDateTime = (date: Date) => dateTimeFormat.format(date);
export const formatWeekday = (date: Date) => weekdayFormat.format(date);

export function plural(count: number, one: string, many = `${one}s`): string {
	return `${count} ${count > 1 ? many : one}`;
}
