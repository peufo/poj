import type * as z from 'zod';

// Lecture des formulaires postés aux form actions, en attendant les remote functions (t17),
// qui lisent elles-mêmes les champs et exposent les erreurs de chaque champ.

/** Champ texte d'un formulaire posté, vide s'il est absent. */
export const text = (form: FormData, name: string) => form.get(name)?.toString() ?? '';

/**
 * Lecture des valeurs saisies `values` par `schema` : l'entrée validée, ou `null` et le
 * premier message de chaque champ en erreur.
 */
export function parseValues<K extends string, T>(
	values: Record<K, unknown>,
	schema: z.ZodType<T, unknown>
): { errors: Partial<Record<K, string>>; input: T | null } {
	const parsed = schema.safeParse(values);
	if (parsed.success) return { errors: {}, input: parsed.data };
	const errors: Partial<Record<K, string>> = {};
	for (const issue of parsed.error.issues) errors[issue.path[0] as K] ??= issue.message;
	return { errors, input: null };
}
