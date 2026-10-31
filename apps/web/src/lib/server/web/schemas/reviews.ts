import * as z from 'zod';
import { ratings } from '#lib/format/labels.js';
import { idSchema } from './fields';

// Formulaires de la révision (indice, note, correction de la note) et paramètres de `/review`.

/** Indice de la révision en cours. */
export const hintSchema = z.object({ reviewId: idSchema });

/** Note, sur la version présentée de la révision. */
export const answerSchema = z.object({
	reviewId: idSchema,
	version: z.string().default(''),
	rating: z.enum(ratings, 'Choisis une note.')
});

/** Correction de la dernière note. */
export const amendSchema = z.object({
	reviewId: idSchema,
	rating: z.enum(ratings, 'Choisis une note.')
});

/** Option de l'URL, active avec `1`. */
const flag = z
	.string()
	.optional()
	.transform((value) => value === '1');

/** Paramètres de `/review` (le deck de `?deck=` passe par `deckParam`). */
export const reviewSearchSchema = z.object({ ahead: flag, reveal: flag });
