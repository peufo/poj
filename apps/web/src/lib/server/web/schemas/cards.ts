import * as z from 'zod';
import { MAX_DAILY_GOAL, MIN_DAILY_GOAL } from '#lib/server/domain/index.js';
import { tooLong } from './fields';

// Formulaires des cartes (création, modification, suggestion DeepL), de l'objectif du jour,
// et paramètres de `/cards`.

const CARD_LIMITS = { sideA: 300, sideB: 300, context: 1000 } as const;

/** Longueur de la recherche gardée, au-delà de laquelle le reste est ignoré. */
const QUERY_LIMIT = 200;

const side = (max: number, required = 'Ce champ est obligatoire.') =>
	z.string().trim().min(1, required).max(max, tooLong(max));

const context = z.string().trim().max(CARD_LIMITS.context, tooLong(CARD_LIMITS.context)).optional();

/** Deck choisi à la création : la liste envoie une valeur vide tant qu'il n'y en a pas. */
const deckId = z.uuid('Choisis un deck.');

/** Modification d'une carte : le deck ne change pas. */
export const cardSchema = z.object({
	sideA: side(CARD_LIMITS.sideA),
	sideB: side(CARD_LIMITS.sideB),
	context
});

/** Création d'une carte, dans le deck choisi. */
export const newCardSchema = z.object({ ...cardSchema.shape, deckId });

/** Suggestion DeepL de la face A, avant d'enregistrer (modification : deck de la carte). */
export const cardTranslationSchema = z.object({
	sideA: side(CARD_LIMITS.sideA, 'Écris d’abord le texte à traduire.'),
	context
});

/** Suggestion DeepL à la création, dans le deck choisi. */
export const newCardTranslationSchema = z.object({ ...cardTranslationSchema.shape, deckId });

const goalMessage = `Entre ${MIN_DAILY_GOAL} et ${MAX_DAILY_GOAL} cartes par jour.`;

/** `/cards?/goal` : l'objectif de cartes par jour. */
export const dailyGoalSchema = z.object({
	goal: z
		.number({ error: goalMessage })
		.int(goalMessage)
		.min(MIN_DAILY_GOAL, goalMessage)
		.max(MAX_DAILY_GOAL, goalMessage)
});

/** Paramètres de `/cards` (le deck de `?deck=` passe par `deckParam`). */
export const cardsSearchSchema = z.object({
	q: z
		.string()
		.default('')
		.transform((q) => q.trim().slice(0, QUERY_LIMIT))
});
