import { error, redirect, type RequestEvent } from '@sveltejs/kit';
import { loginUrl } from '#lib/server/web/redirect-to.js';

// Gardes des pages web, sans accès à la base : testables sous node avec un faux event.

/** Ce que les gardes lisent de la requête (`load` ou form action). */
export type GuardEvent = Pick<RequestEvent, 'locals' | 'url'>;

/**
 * Utilisateur de la requête ; sans session, retour à la connexion, qui ramènera à la page
 * demandée. `url` n'est lue que dans ce cas : un `load` connecté ne dépend pas de l'URL.
 */
export function userOf({ locals, url }: GuardEvent): NonNullable<App.Locals['user']> {
	if (!locals.user) redirect(303, loginUrl(url));
	return locals.user;
}

/**
 * Propriétaire de la requête. Les `load` sont protégés par le layout `(app)`, mais pas
 * les form actions : chacune passe par ici.
 */
export function ownerOf(event: GuardEvent): string {
	return userOf(event).id;
}

/**
 * Garde de l'administration : à appeler dans le `load` et dans chaque form action de
 * `/admin`. Sans session, retour à la connexion ; sans le rôle `admin`, 403. Renvoie l'id
 * de l'administrateur.
 */
export function requireAdmin(event: GuardEvent): string {
	const user = userOf(event);
	if (user.role !== 'admin') error(403, 'Page réservée à l’administrateur');
	return user.id;
}

/**
 * Deck d'une page qui en a besoin (`/cards`, `/review`, `/cards/new`), parmi les decks de
 * l'utilisateur : celui de `?deck=` (404 s'il n'est pas à lui, `explicit`), sinon le seul
 * deck, sinon `null` (tous les decks). Sans aucun deck, direction la création du premier.
 */
export function deckInScope<T extends { id: string }>(
	url: URL,
	decks: T[]
): { deck: T | null; explicit: boolean } {
	if (decks.length === 0) redirect(303, '/decks/new');
	const id = url.searchParams.get('deck');
	if (id === null) return { deck: decks.length === 1 ? decks[0] : null, explicit: false };
	const deck = decks.find((d) => d.id === id);
	if (!deck) error(404, 'Deck introuvable');
	return { deck, explicit: true };
}
