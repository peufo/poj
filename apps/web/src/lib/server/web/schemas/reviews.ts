import * as z from 'zod';
import { ratings } from '#lib/format/labels.js';
import { idSchema } from './fields';

// Formulaires de la révision (indice, note, correction de la note) et paramètres de `/review`.

/** `?/hint` : l'indice de la révision en cours. */
export const hintSchema = z.object({ reviewId: idSchema });

/** `?/answer` : la note, sur la version présentée de la révision. */
export const answerSchema = z.object({
	reviewId: idSchema,
	version: z.string().default(''),
	rating: z.enum(ratings, 'Choisis une note.')
});

/** `?/amend` : sans note choisie (sans JavaScript), la page ouvre le choix. */
export const amendSchema = z.object({
	reviewId: idSchema,
	rating: z.enum(ratings).optional().catch(undefined)
});

/** Option de l'URL, active avec `1`. */
const flag = z
	.string()
	.optional()
	.transform((value) => value === '1');

/** Paramètres de `/review` (le deck de `?deck=` passe par `deckParam`). */
export const reviewSearchSchema = z.object({ ahead: flag, reveal: flag });
