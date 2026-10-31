import type { RemoteFormIssue } from '$app/server';

/** Ce qu'un champ de remote form expose à `TextField` et `SelectField` : son nom et ses erreurs. */
export type FormField = {
	as(type: 'text'): { name: string };
	issues(): RemoteFormIssue[] | undefined;
};

/** Premier message d'erreur d'un champ, s'il y en a. */
export function issueOf(field: Pick<FormField, 'issues'> | undefined): string | undefined {
	return field?.issues()?.[0]?.message;
}
