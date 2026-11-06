/**
 * Élément `index` d'un tableau aligné par construction sur un autre (un jour par date, un
 * résultat par requête) : son absence est un bogue, signalé par une `RangeError` explicite.
 * Ailleurs, un accès qui peut manquer se garde sur place.
 */
export function at<T>(items: readonly T[], index: number): T {
	const item = items[index];
	if (item === undefined) {
		throw new RangeError(`No item at index ${index} (length ${items.length})`);
	}
	return item;
}
