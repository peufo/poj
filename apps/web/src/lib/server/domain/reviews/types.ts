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
	/** Contexte d'origine, révélé avec la réponse (l'indice passe par `requestHint`). */
	context: string | null;
	/** Indice déjà demandé depuis la dernière réponse : la note sera au mieux `hard`. */
	hintUsed: boolean;
	/** Jamais notée (ou réinitialisée). */
	isNew: boolean;
	due: Date;
	/** Échéance que donnerait chaque note, maintenant. */
	preview: Record<Rating, Date>;
	/** Jeton à renvoyer avec la note : une version périmée signale un rejeu. */
	version: string;
}

/** La dernière réponse de l'utilisateur, tant qu'elle peut être corrigée. */
export interface LastAnswer {
	reviewId: string;
	cardId: string;
	direction: Direction;
	prompt: string;
	rating: Rating;
	hintUsed: boolean;
	reviewedAt: Date;
	/** Échéance issue de cette note. */
	due: Date;
	/** Échéance que donnerait chaque note à la place de celle-ci. */
	preview: Record<Rating, Date>;
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

export interface AmendResult extends AnswerResult {
	/** Faux si la note retenue était déjà celle enregistrée : ni l'état ni l'historique n'ont changé. */
	changed: boolean;
}
