// Le tapis de `/cards` (doc/story/tapis-roulant.md) : un axe logarithmique continu, de
// maintenant à deux ans, où chaque carte en route est une marque. Fonctions pures, partagées
// par le load (positions) et le composant (marques, crans, lecture).
import { formatInterval } from './due';
import type { MasteryLevel } from './mastery';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Début de l'axe : une carte présentée dans moins d'une minute est au bord du tapis. */
const BELT_START_MS = MINUTE;
/** Fin de l'axe : une carte présentée dans plus de deux ans s'empile au bout du tapis. */
export const BELT_END_MS = 2 * 365 * DAY;
/** Hauteur des marques sur le tapis, en px. */
export const BELT_HEIGHT = 72;
/** Marge à gauche du tapis, au-dessus de la boîte des prêtes, en px. */
export const BELT_MARGIN = 18;

/** Position sur l'axe (0 : maintenant, 1 : deux ans et plus) d'une présentation dans `delayMs`. */
export function beltPosition(delayMs: number): number {
	const position =
		Math.log(Math.max(delayMs, BELT_START_MS) / BELT_START_MS) /
		Math.log(BELT_END_MS / BELT_START_MS);
	return Math.min(1, position);
}

/** Un cran du tapis : une durée ronde, où s'accroche la ligne. */
export interface BeltStop {
	delayMs: number;
	position: number;
	/** « 7 j » ; « 2 ans + » pour le dernier cran, qui couvre tout le reste. */
	label: string;
	/** Repère avec son libellé sous le tapis. */
	major: boolean;
}

const stop = (delayMs: number, major = false, label = formatInterval(delayMs)): BeltStop => ({
	delayMs,
	position: beltPosition(delayMs),
	label,
	major
});

/** Les crans, du plus proche au plus lointain. */
export const BELT_STOPS: readonly BeltStop[] = [
	...[2, 5, 10, 20, 30].map((n) => stop(n * MINUTE)),
	stop(HOUR, true),
	...[2, 3, 6, 12].map((n) => stop(n * HOUR)),
	stop(DAY, true),
	...[2, 3, 5].map((n) => stop(n * DAY)),
	stop(7 * DAY, true),
	...[14, 21].map((n) => stop(n * DAY)),
	stop(30 * DAY, true),
	...[60, 90, 180].map((n) => stop(n * DAY)),
	stop(365 * DAY, true),
	stop(BELT_END_MS, false, '2 ans +')
];

/** Cran où se place la ligne quand le clavier prend le tapis : un jour. */
export const DEFAULT_STOP = BELT_STOPS.findIndex((s) => s.delayMs === DAY);

/** Cran d'indice `index` (une erreur explicite hors des bornes). */
export function stopAt(index: number): BeltStop {
	const found = BELT_STOPS[index];
	if (!found) throw new RangeError(`No belt stop at ${index}`);
	return found;
}

/** Indice du cran le plus proche d'une position sur l'axe. */
export function nearestStop(position: number): number {
	let best = 0;
	BELT_STOPS.forEach((s, i) => {
		if (Math.abs(s.position - position) < Math.abs(stopAt(best).position - position)) best = i;
	});
	return best;
}

/**
 * Pour chaque cran, les cartes à présenter d'ici lui : les prêtes (`due`), et celles du tapis
 * jusqu'à sa position.
 */
export function cardsByStop(positions: readonly number[], due: number): number[] {
	const counts = BELT_STOPS.map(() => 0);
	for (const position of positions) {
		const first = BELT_STOPS.findIndex((s) => position <= s.position);
		if (first >= 0) counts[first] = (counts[first] ?? 0) + 1;
	}
	let total = due;
	return counts.map((n) => (total += n));
}

/** Taille d'une marque et pas entre deux marques, en px. */
export interface MarkSize {
	width: number;
	height: number;
	pitchX: number;
	pitchY: number;
}

const SMALLEST: MarkSize = { width: 2, height: 1, pitchX: 3, pitchY: 2 };

/** Paliers de marque, de la plus grande à la plus petite. */
export const MARK_SIZES: readonly MarkSize[] = [
	{ width: 6, height: 5, pitchX: 7, pitchY: 6 },
	{ width: 4, height: 3, pitchX: 5, pitchY: 4 },
	{ width: 3, height: 2, pitchX: 4, pitchY: 3 },
	SMALLEST
];

export interface MarkToken {
	position: number;
	level: MasteryLevel;
}

/** Marques du tapis : le palier retenu et, par colonne, le nombre de cartes de chaque niveau. */
export interface MarkLayout {
	size: MarkSize;
	/** Une entrée par colonne, de gauche à droite : `[niveau 0, 1, 2, 3]`. */
	columns: [number, number, number, number][];
	/** Pas vertical : celui du palier, ou moins quand les marques se chevauchent. */
	step: number;
	overlap: boolean;
}

/**
 * Range chaque carte en route dans la colonne de sa position, au plus grand palier où la
 * colonne la plus haute tient dans `height`. Si même le plus petit ne suffit pas, les
 * marques se chevauchent : le pas vertical se réduit d'un même facteur partout.
 */
export function layoutMarks(
	tokens: readonly MarkToken[],
	width: number,
	height = BELT_HEIGHT
): MarkLayout {
	const columnsAt = (size: MarkSize) => {
		const count = Math.max(1, Math.floor(width / size.pitchX));
		const columns = Array.from({ length: count }, (): [number, number, number, number] => [
			0, 0, 0, 0
		]);
		for (const { position, level } of tokens) {
			const column = columns[Math.min(count - 1, Math.floor((position * width) / size.pitchX))];
			if (!column) throw new RangeError(`No mark column for position ${position}`);
			column[level] += 1;
		}
		const peak = Math.max(0, ...columns.map(([a, b, c, d]) => a + b + c + d));
		return { columns, peak };
	};

	for (const size of MARK_SIZES) {
		const { columns, peak } = columnsAt(size);
		if (peak * size.pitchY <= height) return { size, columns, step: size.pitchY, overlap: false };
	}
	// Même le plus petit palier déborde : les marques se chevauchent.
	const { columns, peak } = columnsAt(SMALLEST);
	return { size: SMALLEST, columns, step: height / peak, overlap: true };
}

const rect = (x: number, y: number, w: number, h: number) =>
	`M${x} ${+y.toFixed(2)}h${w}v${+h.toFixed(2)}h-${w}z`;

/**
 * Tracés des marques, un par niveau de maîtrise (indice 0 à 3), posées sur la ligne `baseline`
 * à partir de `left` : les plus solides en bas de chaque colonne. Quand elles se chevauchent,
 * les marques d'un même niveau forment un seul bloc.
 */
export function markPaths(
	layout: MarkLayout,
	left: number,
	baseline: number
): [string, string, string, string] {
	const { size, columns, step, overlap } = layout;
	const paths: [string, string, string, string] = ['', '', '', ''];
	columns.forEach((counts, i) => {
		const x = left + i * size.pitchX;
		let stacked = 0;
		for (const level of [3, 2, 1, 0] as const) {
			const n = counts[level];
			if (n === 0) continue;
			if (overlap) {
				paths[level] += rect(x, baseline - (stacked + n) * step, size.width, n * step);
			} else {
				for (let k = 0; k < n; k += 1) {
					const y = baseline - (stacked + k + 1) * step + (step - size.height);
					paths[level] += rect(x, y, size.width, size.height);
				}
			}
			stacked += n;
		}
	});
	return paths;
}

/** Marques d'une boîte : le palier retenu, les colonnes, et combien de marques sont dessinées. */
export interface PileLayout {
	size: MarkSize;
	columns: number;
	marks: number;
}

/**
 * Range `count` cartes dans une boîte de `width` × `height` px, au plus grand palier qui
 * suffit. Au-delà du plus petit, la boîte est pleine : elle ne dessine que ce qui tient.
 */
export function layoutPile(count: number, width: number, height: number): PileLayout {
	const columnsAt = (size: MarkSize) => Math.max(1, Math.floor((width + 1) / size.pitchX));
	const capacity = (size: MarkSize) => columnsAt(size) * Math.floor((height + 1) / size.pitchY);
	const size = MARK_SIZES.find((s) => count <= capacity(s)) ?? SMALLEST;
	return { size, columns: columnsAt(size), marks: Math.min(count, capacity(size)) };
}

/**
 * Tracé des marques d'une boîte, de bas en haut et de gauche à droite, dans `height` px.
 * `outline` : des contours d'un pixel (marques creuses), tracés à l'intérieur de chaque marque.
 */
export function pilePath(
	{ size, columns, marks }: PileLayout,
	height: number,
	{ outline = false } = {}
): string {
	const inset = outline ? 0.5 : 0;
	let path = '';
	for (let i = 0; i < marks; i += 1) {
		const x = (i % columns) * size.pitchX;
		const y = height - (Math.floor(i / columns) + 1) * size.pitchY + (size.pitchY - size.height);
		path += rect(x + inset, y + inset, size.width - 2 * inset, size.height - 2 * inset);
	}
	return path;
}

/** Un point de l'estimation, sur l'axe du tapis : révisions estimées par jour à cet endroit. */
export interface ForecastMark {
	position: number;
	perDay: number;
}

/** Révisions estimées par jour au point de l'estimation le plus proche de `position`. */
export function rateAt(points: readonly ForecastMark[], position: number): number {
	let best: ForecastMark | undefined;
	for (const point of points) {
		if (!best || Math.abs(point.position - position) < Math.abs(best.position - position)) {
			best = point;
		}
	}
	return best?.perDay ?? 0;
}

/**
 * Tracé de la courbe d'estimation sur `width` px à partir de `left`, posée sur `baseline` :
 * hauteur en racine carrée, rapportée au pic de la courbe et à `height`. Vide sans révision.
 */
export function forecastPath(
	points: readonly ForecastMark[],
	left: number,
	width: number,
	baseline: number,
	height: number
): string {
	const peak = Math.max(0, ...points.map((p) => p.perDay));
	if (peak === 0) return '';
	return points
		.map(({ position, perDay }, i) => {
			const x = left + position * width;
			const y = baseline - Math.sqrt(perDay / peak) * height;
			return `${i === 0 ? 'M' : 'L'}${+x.toFixed(1)} ${+y.toFixed(1)}`;
		})
		.join('');
}

const decimal = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });

/** Un rythme estimé, arrondi à ce qu'il vaut : « 105 », « 2 », « 0,3 », « 0 ». */
export function formatRate(perDay: number): string {
	if (perDay >= 1) return String(Math.round(perDay));
	return perDay >= 0.05 ? decimal.format(perDay) : '0';
}
