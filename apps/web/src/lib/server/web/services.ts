import { error, redirect } from '@sveltejs/kit';
import { db } from '#lib/server/db/index.js';
import { translator } from '#lib/server/deepl/index.js';
import type { DeckView } from '#lib/format/decks.js';
import {
	createCardsService,
	createDailyGoalService,
	createDecksService,
	duplicateSide,
	createReviewsService,
	createTranslationService,
	NotFoundError,
	type Deck
} from '#lib/server/domain/index.js';

// Services du domaine partagés par les pages web (origine `web`).
export const cards = createCardsService(db);
export const dailyGoal = createDailyGoalService(db);
export const decks = createDecksService(db);
export const reviews = createReviewsService(db);
export const translation = createTranslationService(translator);

/** Ce que les pages savent d'un deck : de quoi nommer ses faces et repérer les doublons. */
export function deckView(deck: Deck): DeckView {
	const { kind, languageA, languageB, labelA, labelB, bothDirections } = deck;
	return {
		kind,
		languageA,
		languageB,
		labelA,
		labelB,
		bothDirections,
		duplicateSide: duplicateSide(deck)
	};
}

/**
 * Propriétaire de la requête. Les `load` sont protégés par le layout `(app)`, mais pas
 * les form actions : chacune passe par ici.
 */
export function ownerOf(locals: App.Locals): string {
	if (!locals.user) redirect(303, '/login');
	return locals.user.id;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Identifiant venu de l'URL ou d'un formulaire : autre chose qu'un UUID donne une 404. */
export function idOf(value: unknown, what = 'Carte'): string {
	if (typeof value !== 'string' || !UUID.test(value)) error(404, `${what} introuvable`);
	return value;
}

/** Traduit la `NotFoundError` du domaine en 404. */
export async function orNotFound<T>(promise: Promise<T>, what = 'Carte'): Promise<T> {
	try {
		return await promise;
	} catch (cause) {
		if (cause instanceof NotFoundError) error(404, `${what} introuvable`);
		throw cause;
	}
}
