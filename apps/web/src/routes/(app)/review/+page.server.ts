import { deckParam, decks, deckView, reviews } from '#lib/server/web/services.js';
import { deckInScope, ownerOf } from '#lib/server/web/guards.js';
import { reviewSearchSchema } from '#lib/server/web/schemas/reviews.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const { url } = event;
	const ownerId = ownerOf(event);
	const { ahead, reveal } = reviewSearchSchema.parse(Object.fromEntries(url.searchParams));
	const now = new Date();
	// `?deck=` : la session ne propose que les cartes de ce deck ; sans lui, tous les decks.
	const scope = { deckId: deckParam(url) };

	const [owned, next, last] = await Promise.all([
		decks.list(ownerId),
		reviews.next(ownerId, now, { ahead, ...scope }),
		reviews.lastAnswer(ownerId, now, scope)
	]);
	const { deck, explicit } = deckInScope(url, owned);

	const current = next.review;
	// Rien à réviser : la prochaine révision à venir, pour l'annoncer et réviser en avance.
	const upcoming =
		!current && !ahead
			? (await reviews.next(ownerId, now, { ahead: true, ...scope })).review
			: null;

	return {
		now,
		ahead,
		/**
		 * Deck demandé par `?deck=` (le bouton « Réviser » d'un deck) : la session l'affiche,
		 * ses liens et ses actions le gardent. `null` pour l'entrée « Réviser » globale.
		 */
		session: explicit && deck ? { id: deck.id, name: deck.name } : null,
		/** Réponse déjà affichée (sans JavaScript, via `?reveal=1`). */
		revealed: reveal,
		remaining: next.review ? next.remaining : 0,
		current: current && {
			id: current.id,
			deck: deckView(current.deck),
			direction: current.direction,
			prompt: current.prompt,
			expected: current.expected,
			context: current.context,
			hintUsed: current.hintUsed,
			isNew: current.isNew,
			preview: current.preview,
			version: current.version
		},
		upcoming: upcoming && {
			deck: deckView(upcoming.deck),
			direction: upcoming.direction,
			prompt: upcoming.prompt,
			due: upcoming.due
		},
		last: last && {
			reviewId: last.reviewId,
			prompt: last.prompt,
			direction: last.direction,
			rating: last.rating,
			hintUsed: last.hintUsed,
			reviewedAt: last.reviewedAt,
			due: last.due,
			preview: last.preview
		}
	};
};
