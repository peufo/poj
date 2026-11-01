import type * as z from 'zod';

/** Premier message de chaque champ refusé par `schema` (vide si `values` est accepté). */
export function fieldErrors(schema: z.ZodType, values: Record<string, unknown>) {
	const errors: Record<string, string> = {};
	for (const issue of schema.safeParse(values).error?.issues ?? []) {
		errors[String(issue.path[0])] ??= issue.message;
	}
	return errors;
}
