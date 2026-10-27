import { dayNumber } from './labels.js';

// Échéances relatives, telles que l'interface les affiche (« dans 12 jours »).
// Les jours se comptent en jours civils, pas en tranches de 24 h : une révision due
// demain à 7 h est « demain », même s'il est 23 h.

export type DueTone = 'new' | 'due' | 'today' | 'later';

export type DueLabel = {
	/** Libellé court, pour les puces de liste : « dans 12 j ». */
	short: string;
	/** Libellé complet, pour le détail et les lecteurs d'écran : « dans 12 jours ». */
	long: string;
	tone: DueTone;
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** Écart en jours civils (Europe/Zurich, comme le domaine) : 0 le même jour, 1 le lendemain. */
export function calendarDaysBetween(from: Date, to: Date): number {
	return dayNumber(to) - dayNumber(from);
}

export function describeDue(due: Date, now: Date, { isNew = false } = {}): DueLabel {
	if (isNew) return { short: 'nouvelle', long: 'nouvelle, à réviser', tone: 'new' };

	const delta = due.getTime() - now.getTime();
	if (delta <= 0) return { short: 'à réviser', long: 'à réviser maintenant', tone: 'due' };

	const days = calendarDaysBetween(now, due);
	if (days === 0) {
		if (delta < HOUR) {
			const minutes = Math.max(1, Math.round(delta / MINUTE));
			return { short: `${minutes} min`, long: `dans ${minutes} min`, tone: 'today' };
		}
		const hours = Math.round(delta / HOUR);
		return { short: `${hours} h`, long: `dans ${hours} h`, tone: 'today' };
	}
	if (days === 1) return { short: 'demain', long: 'demain', tone: 'later' };
	if (days < 45) return { short: `${days} j`, long: `dans ${days} jours`, tone: 'later' };

	const months = Math.round(days / 30.4);
	if (months < 12) return { short: `${months} mois`, long: `dans ${months} mois`, tone: 'later' };

	const years = Math.round(days / 365);
	return {
		short: `${years} an${years > 1 ? 's' : ''}`,
		long: `dans ${years} an${years > 1 ? 's' : ''}`,
		tone: 'later'
	};
}

/** Intervalle d'une note à venir (« 10 min », « 4 j »), comme sous les boutons de note. */
export function formatInterval(ms: number): string {
	if (ms < HOUR) return `${Math.max(1, Math.round(ms / MINUTE))} min`;
	if (ms < 24 * HOUR) return `${Math.round(ms / HOUR)} h`;
	const days = Math.round(ms / (24 * HOUR));
	if (days < 45) return `${days} j`;
	if (days < 365) return `${Math.round(days / 30.4)} mois`;
	return `${(days / 365).toFixed(1).replace('.', ',').replace(',0', '')} an`;
}
