import * as z from 'zod';
import { CARD_LIMITS, MAX_DAILY_GOAL, MIN_DAILY_GOAL } from '#lib/server/domain/index.js';
import { tooLong } from './fields';

// Formulaires des cartes (création, modification, suggestion DeepL), de l'objectif du jour,
// et paramètres de `/cards`.

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

const textToTranslate = 'Écris d’abord le texte à traduire.';

/** Suggestion DeepL de la face A, avant d'enregistrer (modification : deck de la carte). */
export const cardTranslationSchema = z.object({
	sideA: side(CARD_LIMITS.sideA, textToTranslate),
	context
});

/** Suggestion DeepL de la face B, dans la langue de la face A, comme `cardTranslationSchema`. */
export const cardBackTranslationSchema = z.object({
	sideB: side(CARD_LIMITS.sideB, textToTranslate),
	context
});

/**
 * Enregistrement (bouton `intent=save`). `confirm` : la face déjà présente dans une autre
 * carte, confirmée telle quelle après l'avertissement de doublon.
 */
const save = { intent: z.literal('save'), confirm: z.string().optional() };

/**
 * Suggestion DeepL de la face A vers B (bouton `intent=translate`) ou de B vers A
 * (`intent=translate_back`) : seule la face à traduire est exigée.
 */
const translate = { intent: z.literal('translate') };
const translateBack = { intent: z.literal('translate_back') };

/** Formulaire de nouvelle carte : enregistrer, ou demander une suggestion DeepL. */
export const newCardFormSchema = z.discriminatedUnion('intent', [
	z.object({ ...newCardSchema.shape, ...save }),
	z.object({ ...cardTranslationSchema.shape, deckId, ...translate }),
	z.object({ ...cardBackTranslationSchema.shape, deckId, ...translateBack })
]);

/**
 * Formulaire de modification d'une carte, comme `newCardFormSchema`.
 * `acknowledge_reset=1` : l'avertissement de réinitialisation de la progression a été vu.
 */
export const cardFormSchema = z.discriminatedUnion('intent', [
	z.object({ ...cardSchema.shape, ...save, acknowledge_reset: z.string().optional() }),
	z.object({ ...cardTranslationSchema.shape, ...translate }),
	z.object({ ...cardBackTranslationSchema.shape, ...translateBack })
]);

const goalMessage = `Entre ${MIN_DAILY_GOAL} et ${MAX_DAILY_GOAL} cartes par jour.`;

/** Objectif de cartes à ajouter par jour (`/cards`). */
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
