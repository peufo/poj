// Indication simple de maîtrise, à la place de la stabilité et de la difficulté FSRS
// (voir doc/specs/repetition.md, « Affichage de la progression »).
//
// Proposition, libellés et seuils à valider :
// - Nouvelle : jamais notée ;
// - En cours : en apprentissage, ou stabilité inférieure à 7 jours ;
// - Acquise : stabilité de 7 à 30 jours ;
// - Solide : stabilité au-delà de 30 jours.

/** `State` de ts-fsrs : New, Learning, Review, Relearning. */
export type FsrsState = 0 | 1 | 2 | 3;

/** Le même état, tel que la base le nomme. */
export type ReviewStateName = 'new' | 'learning' | 'review' | 'relearning';

const stateIndex: Record<ReviewStateName, FsrsState> = {
	new: 0,
	learning: 1,
	review: 2,
	relearning: 3
};

export type MasteryLevel = 0 | 1 | 2 | 3;

export const masteryLabels = ['Nouvelle', 'En cours', 'Acquise', 'Solide'] as const;

export function masteryOf({
	state: raw,
	stability
}: {
	state: FsrsState | ReviewStateName;
	stability: number;
}): MasteryLevel {
	const state = typeof raw === 'string' ? stateIndex[raw] : raw;
	if (state === 0) return 0;
	if (state === 1 || state === 3 || stability < 7) return 1;
	if (stability < 30) return 2;
	return 3;
}
