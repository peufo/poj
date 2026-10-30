import * as z from 'zod';

// Règles et messages partagés par les schémas des formulaires.

/** Identifiant d'une ligne (carte, deck, révision, invitation) venu de l'URL ou d'un formulaire. */
export const idSchema = z.uuid();

/** Message d'un texte trop long. */
export const tooLong = (max: number) => `${max} caractères au plus.`;
