import { fail } from '@sveltejs/kit';
import { ConflictError } from '#lib/server/domain/index.js';
import { deckParam, decks, deckView, idOf, orNotFound, reviews } from '#lib/server/web/services.js';
import { deckInScope, ownerOf } from '#lib/server/web/guards.js';
import { text } from '#lib/server/web/form-data.js';
import {
	amendSchema,
	answerSchema,
	hintSchema,
	reviewSearchSchema
} from '#lib/server/web/schemas/reviews.js';
import type { Actions, PageServerLoad } from './$types';

/** Champs d'un formulaire de révision ; une révision qui n'en est pas une donne une 404. */
async function reviewValues(request: Request) {
	const form = await request.formData();
	return {
		reviewId: idOf(text(form, 'reviewId'), 'Révision'),
		rating: form.get('rating')?.toString(),
		version: form.get('version')?.toString()
	};
}

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

export const actions: Actions = {
	/** Indice : le domaine mémorise la demande et plafonnera la note à Hard. */
	hint: async (event) => {
		const ownerId = ownerOf(event);
		const { reviewId } = hintSchema.parse(await reviewValues(event.request));
		await orNotFound(reviews.requestHint(ownerId, reviewId), 'Révision');
		return { hinted: true };
	},

	answer: async (event) => {
		const ownerId = ownerOf(event);
		const parsed = answerSchema.safeParse(await reviewValues(event.request));
		if (!parsed.success) return fail(400, { answerError: parsed.error.issues[0].message });
		const { reviewId, rating, version } = parsed.data;

		try {
			const result = await orNotFound(
				reviews.answer(ownerId, reviewId, { rating, version, origin: 'web' }),
				'Révision'
			);
			return { answered: { rating: result.rating, replayed: result.replayed } };
		} catch (cause) {
			if (cause instanceof ConflictError) {
				return fail(409, {
					answerError: 'Cette carte a changé entre-temps : la note n’a pas été enregistrée.'
				});
			}
			throw cause;
		}
	},

	/** Corriger la dernière note. Sans note choisie (sans JavaScript), ouvre le choix. */
	amend: async (event) => {
		const ownerId = ownerOf(event);
		const { reviewId, rating } = amendSchema.parse(await reviewValues(event.request));
		if (!rating) return fail(400, { amendOpen: true });

		try {
			const result = await orNotFound(reviews.amend(ownerId, reviewId, rating), 'Révision');
			// Même note qu'avant (plafond après indice compris) : rien n'a été modifié.
			return { amended: true, amendUnchanged: !result.changed };
		} catch (cause) {
			if (cause instanceof ConflictError) {
				return fail(409, {
					amendError:
						'Cette note ne peut plus être corrigée : seule la dernière réponse l’est, dans l’heure qui suit.'
				});
			}
			throw cause;
		}
	}
};
