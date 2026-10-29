import { fail } from '@sveltejs/kit';
import { ConflictError, type Rating } from '#lib/server/domain/index.js';
import { deckView, idOf, orNotFound, reviews } from '#lib/server/web/services.js';
import { ownerOf } from '#lib/server/web/guards.js';
import type { Actions, PageServerLoad } from './$types';

const RATINGS: readonly string[] = ['again', 'hard', 'good', 'easy'];
const isRating = (value: unknown): value is Rating =>
	typeof value === 'string' && RATINGS.includes(value);

export const load: PageServerLoad = async (event) => {
	const { url } = event;
	const ownerId = ownerOf(event);
	const ahead = url.searchParams.get('ahead') === '1';
	const now = new Date();

	const [next, last] = await Promise.all([
		reviews.next(ownerId, now, { ahead }),
		reviews.lastAnswer(ownerId, now)
	]);

	const current = next.review;
	// Rien à réviser : la prochaine révision à venir, pour l'annoncer et réviser en avance.
	const upcoming =
		!current && !ahead ? (await reviews.next(ownerId, now, { ahead: true })).review : null;

	return {
		now,
		ahead,
		/** Réponse déjà affichée (sans JavaScript, via `?reveal=1`). */
		revealed: url.searchParams.get('reveal') === '1',
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
		const { request } = event;
		const ownerId = ownerOf(event);
		const form = await request.formData();
		await orNotFound(
			reviews.requestHint(ownerId, idOf(form.get('reviewId'), 'Révision')),
			'Révision'
		);
		return { hinted: true };
	},

	answer: async (event) => {
		const { request } = event;
		const ownerId = ownerOf(event);
		const form = await request.formData();
		const reviewId = idOf(form.get('reviewId'), 'Révision');
		const rating = form.get('rating');
		const version = form.get('version')?.toString() ?? '';
		if (!isRating(rating)) return fail(400, { answerError: 'Choisis une note.' });

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
		const { request } = event;
		const ownerId = ownerOf(event);
		const form = await request.formData();
		const reviewId = idOf(form.get('reviewId'), 'Révision');
		const rating = form.get('rating');
		if (!isRating(rating)) return fail(400, { amendOpen: true });

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
