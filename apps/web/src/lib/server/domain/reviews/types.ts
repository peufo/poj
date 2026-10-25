import type { Direction, Rating } from '../../db/generated/prisma/client';

/** Une révision prête à être présentée. */
export interface NextReview {
	id: string;
	cardId: string;
	direction: Direction;
	/** Face de question : le français pour `fr_to_en`, l'anglais pour `en_to_fr`. */
	prompt: string;
	expected: string;
	hasHint: boolean;
	/** Jeton à renvoyer avec la note : une version périmée signale un rejeu. */
	version: string;
}

export type NextResult =
	{ review: NextReview; remaining: number } | { review: null; nextDue: Date | null };

export interface AnswerResult {
	reviewId: string;
	/** Note effectivement retenue (plafonnée à `hard` après un indice). */
	rating: Rating;
	due: Date;
	/** Contexte de la carte, à évoquer en renforcement. */
	context: string | null;
	/** Vrai si la note avait déjà été enregistrée : rien n'a été appliqué. */
	replayed: boolean;
}
