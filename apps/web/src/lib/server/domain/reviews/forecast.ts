// Estimation des révisions à venir, pour la courbe du tapis (doc/story/tapis-roulant.md) :
// chaque sens est rejoué par le planificateur FSRS jusqu'à deux ans, réussi à chaque échéance
// sauf les oublis que la rétention visée laisse attendre. Une estimation, pas une prévision :
// elle suppose chaque réponse donnée à l'heure, sans plafond par jour.
import { at } from '../arrays';
import { DAY } from '../time';
import { simulateReviews, TARGET_RETENTION, type FsrsState } from './scheduler';

/** Horizon de l'estimation : la fin de l'axe du tapis. */
export const FORECAST_HORIZON_MS = 2 * 365 * DAY;
/** Premier point de la courbe : le début de l'axe du tapis. */
const FIRST_POINT_MS = 60_000;
/** Points de la courbe, également espacés sur l'axe logarithmique. */
export const FORECAST_POINTS = 65;
/** Simulations visées en tout : un petit paquet est rejoué plusieurs fois, puis moyenné. */
const SIMULATION_BUDGET = 1000;
/** Au-delà, un échantillon régulier des sens est simulé, puis remis à l'échelle. */
const MAX_SENSES = 5000;

/** Un sens à estimer : son état FSRS, et le moment de sa prochaine présentation. */
export interface ForecastSense {
	/** L'id de la révision : il fixe ses tirages, donc son estimation. */
	id: string;
	state: FsrsState;
	start: Date;
}

/** Un point de la courbe : révisions estimées par jour autour de `delayMs` après maintenant. */
export interface ForecastPoint {
	delayMs: number;
	perDay: number;
}

/** Graine stable tirée d'une chaîne (FNV-1a sur 32 bits). */
function seedOf(text: string): number {
	let hash = 0x811c9dc5;
	for (let i = 0; i < text.length; i += 1) {
		hash ^= text.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	return hash >>> 0;
}

/** Générateur pseudo-aléatoire déterministe (mulberry32), dans [0, 1[. */
function random(seed: number): () => number {
	let state = seed;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
	};
}

/** Délais des points de la courbe : de 1 min à deux ans, en progression géométrique. */
export function forecastDelays(): number[] {
	const ratio = FORECAST_HORIZON_MS / FIRST_POINT_MS;
	return Array.from(
		{ length: FORECAST_POINTS },
		(_, i) => FIRST_POINT_MS * ratio ** (i / (FORECAST_POINTS - 1))
	);
}

/**
 * Fenêtre d'un point : de √2 fois moins à √2 fois plus que son délai, et au moins un jour.
 * Avant 12 h, c'est la journée qui vient : la courbe y est plate.
 */
function windowOf(delayMs: number): [number, number] {
	const from = delayMs / Math.SQRT2;
	const to = delayMs * Math.SQRT2;
	if (to - from >= DAY) return [from, to];
	const start = Math.max(0, delayMs - DAY / 2);
	return [start, start + DAY];
}

/** Nombre de valeurs de `sorted` (croissant) strictement inférieures à `value`. */
function countBelow(sorted: Float64Array, value: number): number {
	let low = 0;
	let high = sorted.length;
	while (low < high) {
		const middle = (low + high) >> 1;
		if ((sorted[middle] ?? Infinity) < value) low = middle + 1;
		else high = middle;
	}
	return low;
}

/**
 * Révisions estimées par jour aux `FORECAST_POINTS` points de l'axe, pour ces sens. Chaque
 * sens est simulé depuis sa prochaine présentation (maintenant s'il est en retard) jusqu'à
 * l'horizon, avec ses propres tirages : le résultat ne dépend que des sens et de `now`.
 */
export function forecast(senses: readonly ForecastSense[], now: Date): ForecastPoint[] {
	if (senses.length === 0) return forecastDelays().map((delayMs) => ({ delayMs, perDay: 0 }));

	const size = Math.min(senses.length, MAX_SENSES);
	const sample = Array.from({ length: size }, (_, k) =>
		at(senses, Math.floor((k * senses.length) / size))
	);
	const runs = Math.max(1, Math.ceil(SIMULATION_BUDGET / size));
	const weight = senses.length / size / runs;

	const until = new Date(now.getTime() + FORECAST_HORIZON_MS);
	const collected: number[] = [];
	for (const { id, state, start } of sample) {
		const from = start > now ? start : now;
		const seed = seedOf(id);
		for (let run = 0; run < runs; run += 1) {
			const draw = random(seed + run);
			const forgets = () => draw() >= TARGET_RETENTION;
			for (const date of simulateReviews(state, from, until, forgets)) {
				collected.push(date.getTime() - now.getTime());
			}
		}
	}
	// Tri numérique natif : bien plus rapide qu'un comparateur sur des dizaines de milliers.
	const offsets = Float64Array.from(collected).sort();

	return forecastDelays().map((delayMs) => {
		const [from, to] = windowOf(delayMs);
		const reviews = (countBelow(offsets, to) - countBelow(offsets, from)) * weight;
		return { delayMs, perDay: reviews / ((to - from) / DAY) };
	});
}
