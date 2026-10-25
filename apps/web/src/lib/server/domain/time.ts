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
	const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
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

/** Minuit (heure locale) qui suit `now` : la fin du jour civil en cours. */
export function startOfNextDay(now: Date, timeZone = TIME_ZONE): Date {
	const { year, month, day } = localParts(now, timeZone);
	const midnightAsUtc = Date.UTC(year, month - 1, day + 1);
	return new Date(midnightAsUtc - offsetMs(new Date(midnightAsUtc), timeZone));
}
