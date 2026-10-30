// Charge l'extension `.openapi()` des schémas Zod avant de nommer ceux d'ici.
import '@hono/zod-openapi';
import * as z from 'zod';

export const ErrorSchema = z
	.object({
		error: z.string().openapi({ example: 'not_found' }),
		message: z.string().optional()
	})
	.openapi('Error');

export const ValidationErrorSchema = z
	.object({
		error: z.literal('validation_error'),
		issues: z.array(z.looseObject({ message: z.string(), path: z.array(z.unknown()) }))
	})
	.openapi('ValidationError');

export const jsonContent = <T extends z.ZodType>(schema: T, description: string) => ({
	content: { 'application/json': { schema } },
	description
});

export const errorResponses = {
	401: jsonContent(ErrorSchema, 'Non authentifié'),
	422: jsonContent(ValidationErrorSchema, 'Requête invalide')
} as const;
