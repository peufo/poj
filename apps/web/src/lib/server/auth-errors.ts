// Messages d'erreur de Better Auth, traduits pour les pages de connexion et d'inscription.
// Les codes sont ceux de `BASE_ERROR_CODES` (`@better-auth/core`), plus ceux de Poj.

import { PASSWORD_MIN_LENGTH } from '#lib/server/domain/index.js';

/** Code de l'erreur levée par `signUpHooks` quand un compte existe déjà. */
export const SIGN_UP_CLOSED = 'SIGN_UP_CLOSED';

/** Messages par code, repris tels quels par les pages qui valident elles-mêmes (`/invite`). */
export const authErrorMessages = {
	INVALID_EMAIL_OR_PASSWORD: 'Email ou mot de passe incorrect.',
	INVALID_PASSWORD: 'Mot de passe incorrect.',
	INVALID_EMAIL: 'Adresse email invalide.',
	USER_NOT_FOUND: 'Email ou mot de passe incorrect.',
	CREDENTIAL_ACCOUNT_NOT_FOUND: 'Email ou mot de passe incorrect.',
	EMAIL_NOT_VERIFIED: 'Adresse email pas encore vérifiée.',
	PASSWORD_TOO_SHORT: `Mot de passe trop court : ${PASSWORD_MIN_LENGTH} caractères au moins.`,
	PASSWORD_TOO_LONG: 'Mot de passe trop long.',
	USER_ALREADY_EXISTS: 'Un compte existe déjà avec cet email.',
	USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: 'Un compte existe déjà avec cet email.',
	FAILED_TO_CREATE_USER: 'Le compte n’a pas pu être créé. Réessaie.',
	FAILED_TO_CREATE_SESSION: 'La session n’a pas pu être ouverte. Réessaie.',
	VALIDATION_ERROR: 'Vérifie les champs du formulaire.',
	MISSING_FIELD: 'Remplis tous les champs du formulaire.',
	INVALID_ORIGIN: 'Requête refusée : recharge la page, puis réessaie.',
	MISSING_OR_NULL_ORIGIN: 'Requête refusée : recharge la page, puis réessaie.',
	CROSS_SITE_NAVIGATION_LOGIN_BLOCKED: 'Requête refusée : recharge la page, puis réessaie.',
	[SIGN_UP_CLOSED]: 'Les inscriptions sont fermées : demande un lien d’invitation.'
} satisfies Record<string, string>;

/**
 * Message en français pour une erreur de Better Auth (`APIError`), d'après son code ;
 * `fallback` si le code est inconnu.
 */
export function authErrorMessage(error: unknown, fallback: string): string {
	const { status, body } = (error ?? {}) as { status?: unknown; body?: { code?: unknown } };
	if (status === 'TOO_MANY_REQUESTS') return 'Trop de tentatives : patiente un peu, puis réessaie.';
	const code = typeof body?.code === 'string' ? body.code : undefined;
	return (code && (authErrorMessages as Record<string, string>)[code]) || fallback;
}
