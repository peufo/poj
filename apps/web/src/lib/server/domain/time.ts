/** Fuseau de référence pour « aujourd'hui » (doc/plans/jalon-1.md). */
export const TIME_ZONE = 'Europe/Zurich';

function localParts(date: Date, timeZone: string) {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone,
		hourCycle: 'h23',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit'
	}).formatToParts(date);
	const get = (type: string) => {
		const part = parts.find((p) => p.type === type);
		if (!part) throw new Error(`Intl.DateTimeFormat gave no ${type} for ${timeZone}`);
		return Number(part.value);
	};
	return {
		year: get('year'),
		month: get('month'),
		day: get('day'),
		hour: get('hour'),
		minute: get('minute'),
		second: get('second')
	};
}

/** Décalage du fuseau par rapport à UTC à cet instant, en millisecondes. */
function offsetMs(date: Date, timeZone: string): number {
	const p = localParts(date, timeZone);
	const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
	return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/**
 * Minuit (heure locale) qui commence le jour civil de `now`, décalé de `days` jours :
 * `startOfDay(now, 1)` est la fin du jour en cours.
 */
export function startOfDay(now: Date, days = 0, timeZone = TIME_ZONE): Date {
	const { year, month, day } = localParts(now, timeZone);
	const midnightAsUtc = Date.UTC(year, month - 1, day + days);
	return new Date(midnightAsUtc - offsetMs(new Date(midnightAsUtc), timeZone));
}

/** Minuit (heure locale) qui suit `now` : la fin du jour civil en cours. */
export function startOfNextDay(now: Date, timeZone = TIME_ZONE): Date {
	return startOfDay(now, 1, timeZone);
}

/**
 * Écart en jours civils (heure locale) de `from` à `to` : 0 le même jour, 1 le lendemain,
 * négatif dans le passé, quelle que soit l'heure.
 */
export function calendarDaysBetween(from: Date, to: Date, timeZone = TIME_ZONE): number {
	const a = localParts(from, timeZone);
	const b = localParts(to, timeZone);
	return Math.round(
		(Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / 86_400_000
	);
}

/** Jour de la semaine (heure locale) de `date` : 0 le lundi, 6 le dimanche. */
export function weekdayIndex(date: Date, timeZone = TIME_ZONE): number {
	const { year, month, day } = localParts(date, timeZone);
	return (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7;
}

const relative = new Intl.RelativeTimeFormat('fr', { numeric: 'always' });

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Date relative en français, pensée pour la voix : « dans 3 jours »,
 * « dans 10 minutes », « il y a 2 heures », « maintenant » à moins d'une minute.
 */
export function formatRelative(date: Date, now = new Date()): string {
	const diff = date.getTime() - now.getTime();
	if (Math.abs(diff) < MINUTE) return 'maintenant';

	// On passe à l'unité suivante quand l'arrondi l'atteint (59,6 min → 1 heure).
	const minutes = Math.round(diff / MINUTE);
	if (Math.abs(minutes) < 60) return relative.format(minutes, 'minute');
	const hours = Math.round(diff / HOUR);
	if (Math.abs(hours) < 24) return relative.format(hours, 'hour');
	const days = Math.round(diff / DAY);
	if (Math.abs(days) < 30) return relative.format(days, 'day');
	const months = Math.round(diff / (30.44 * DAY));
	if (Math.abs(months) < 12) return relative.format(months, 'month');
	return relative.format(Math.round(diff / (365.25 * DAY)), 'year');
}
