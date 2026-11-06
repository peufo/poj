import type { Deck, Direction, Rating } from '../../db/generated/prisma/client';

/** Une révision prête à être présentée. */
export interface NextReview {
	id: string;
	cardId: string;
	/** Deck de la carte : langues et noms des faces. */
	deck: Deck;
	direction: Direction;
	/** Face de question : A pour `a_to_b`, B pour `b_to_a`. */
	prompt: string;
	expected: string;
	/** Indice : le contexte sans les mentions de source (`hintOf`), `null` s'il n'en reste rien. */
	hint: string | null;
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
	deck: Deck;
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
	| { review: NextReview; remaining: number }
	| {
			review: null;
			nextDue: Date | null;
			/** Cartes neuves en attente : au-delà de la limite du jour de leur deck. */
			waiting: number;
	  };

/** Révisions pour garder une carte d'avance (`lead`). */
export interface LeadResult {
	/** De cartes différentes, hors carte tenue : deux sans carte tenue, une sinon, ou moins. */
	reviews: NextReview[];
	/** Vrai si la révision tenue est connue : elle compte comme la carte d'avance. */
	held: boolean;
	/** Révisions encore à présenter, carte tenue et révisions renvoyées comprises. */
	remaining: number;
	/** Prochaine échéance, seulement quand rien n'est renvoyé ni tenu. */
	nextDue: Date | null;
}

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

/** Les deux vélocités (doc/story/tapis-roulant.md). */
export interface Velocities {
	/** Réponses par jour, en moyenne sur `windowDays`. */
	repsPerDay: number;
	windowDays: number;
	/** Cartes dont chaque sens révisé est mûr. */
	matureCards: number;
	/** Stabilité, en jours, à partir de laquelle un sens est mûr. */
	matureDays: number;
}
