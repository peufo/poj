import { error, invalid } from '@sveltejs/kit';
import { hashPassword } from 'better-auth/crypto';
import { db } from '#lib/server/db/index.js';
import { translator } from '#lib/server/deepl/index.js';
import type { DeckSummary, DeckView } from '#lib/format/decks.js';
import {
	createAccountsService,
	createCardsService,
	createDailyGoalService,
	createInvitationsService,
	createDecksService,
	duplicateSide,
	createReviewsService,
	createTranslationService,
	ConflictError,
	NotFoundError,
	type Deck,
	type DeckWithCount
} from '#lib/server/domain/index.js';
import { idSchema } from './schemas/fields';

// Services du domaine partagés par les pages web (origine `web`). `accounts`, sans origine,
// sert aussi à `/mcp`.
export const accounts = createAccountsService(db);
export const cards = createCardsService(db);
export const dailyGoal = createDailyGoalService(db);
export const invitations = createInvitationsService(db, hashPassword);
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

/** Ce que la navigation et les choix de deck savent d'un deck. */
export function deckSummary(deck: DeckWithCount): DeckSummary {
	return { ...deckView(deck), id: deck.id, name: deck.name, cardCount: deck.cardCount };
}

/** Identifiant venu de l'URL ou d'un formulaire : autre chose qu'un UUID donne une 404. */
export function idOf(value: unknown, what = 'Carte'): string {
	const id = idSchema.safeParse(value);
	if (!id.success) error(404, `${what} introuvable`);
	return id.data;
}

/**
 * Deck demandé par `?deck=`, à passer tel quel aux requêtes du domaine (`undefined` : tous
 * les decks). Autre chose qu'un UUID donne une 404 ; un deck étranger ne renvoie rien, et
 * `deckInScope` en fait une 404.
 */
export function deckParam(url: URL): string | undefined {
	const value = url.searchParams.get('deck');
	return value === null ? undefined : idOf(value, 'Deck');
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

/**
 * Traduit le refus du domaine (`ConflictError`) en erreur du remote form : `issue` est le
 * message global, ou l'erreur d'un champ (`issue.name('…')`).
 */
export async function orInvalid<T>(
	promise: Promise<T>,
	issue: Parameters<typeof invalid>[0]
): Promise<T> {
	try {
		return await promise;
	} catch (cause) {
		if (cause instanceof ConflictError) invalid(issue);
		throw cause;
	}
}
