import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
	ConflictError,
	createAccountsService,
	createCardsService,
	createReviewsService,
	type Direction
} from '../domain/index';
import { createTestAuth } from './auth';
import { useTestDatabase } from './db';
import { SANDBOX_ACCOUNT, SANDBOX_CARDS, seedSandbox } from './seed';

// La seed vide elle-même la base : les tests en lecture seule partagent un seul chargement.
const db = useTestDatabase({ reset: false });
const cards = createCardsService(db);
const reviews = createReviewsService(db);

const now = new Date('2026-03-10T09:00:00Z');
const at = (minutes: number) => new Date(now.getTime() + minutes * 60_000);
const HOUR = 60;
const DAY = 24 * HOUR;

let owner: string;

async function seed() {
	({ userId: owner } = await seedSandbox(db, { now }));
}

async function card(sideA: string) {
	return db.card.findFirstOrThrow({
		where: { sideA },
		include: { reviews: { include: { logs: { orderBy: { reviewedAt: 'asc' } } } } }
	});
}

async function review(sideA: string, direction: Direction) {
	const found = (await card(sideA)).reviews.find((r) => r.direction === direction);
	if (!found) throw new Error(`no ${direction} review for "${sideA}"`);
	return found;
}

describe('sandbox seed', () => {
	describe('once loaded', () => {
		beforeAll(seed);

		it('creates the admin account, which can sign in with its password', async () => {
			const auth = createTestAuth(db);
			const { user, token } = await auth.api.signInEmail({
				body: { email: SANDBOX_ACCOUNT.email, password: SANDBOX_ACCOUNT.password }
			});

			expect(user.id).toBe(owner);
			expect(user.role).toBe('admin');
			expect(token).toBeTruthy();
			expect(await createAccountsService(db).isSignUpOpen()).toBe(false);
		});

		it('covers new, due, very overdue, learning and mature reviews', async () => {
			for (const r of (await card('faire la grasse matinée')).reviews) {
				expect(r).toMatchObject({ state: 'new', reps: 0, logs: [] });
				expect(r.due <= now).toBe(true);
			}
			for (const r of (await card('coûter les yeux de la tête')).reviews) {
				expect(r.state).toBe('review');
				expect(r.due <= now && r.due > at(-30 * DAY)).toBe(true);
			}

			const overdue = await review('couper les cheveux en quatre', 'b_to_a');
			expect(overdue.state).toBe('review');
			expect(overdue.due < at(-30 * DAY)).toBe(true);

			const learning = await review('avoir le trac', 'a_to_b');
			const relearning = await review('poser un lapin à quelqu’un', 'a_to_b');
			expect(learning.state).toBe('learning');
			expect(relearning).toMatchObject({ state: 'relearning', lapses: 1 });
			expect(relearning.logs.at(-1)?.rating).toBe('again');
			for (const r of [learning, relearning]) {
				expect(r.due > now && r.due <= at(15)).toBe(true);
			}

			const mature = await review('tenir pour acquis', 'a_to_b');
			expect(mature.state).toBe('review');
			expect(mature.reps).toBeGreaterThanOrEqual(5);
			expect(mature.lapses).toBeGreaterThanOrEqual(1);
			expect(mature.due > at(30 * DAY)).toBe(true);

			for (const r of (await card('Je te tiens au courant.')).reviews) {
				expect(r.due > now).toBe(true);
			}
		});

		it('covers contexts, a duplicate, a deleted card, an edit, an amendment and both origins', async () => {
			const listed = await cards.list(owner);
			expect(listed).toHaveLength(SANDBOX_CARDS.length - 1);
			expect(await cards.stats(owner, now)).toMatchObject({ totalCards: listed.length });
			expect(listed.some((c) => c.context === null)).toBe(true);
			expect(listed.some((c) => c.context !== null)).toBe(true);
			expect(new Set(listed.map((c) => c.origin))).toEqual(new Set(['web', 'claude']));

			const duplicates = await cards.findDuplicates(owner, listed[0].deck, {
				sideA: 'x',
				sideB: 'a match'
			});
			expect(duplicates.map((c) => c.sideA).sort()).toEqual(['un match', 'une allumette']);

			const deleted = await card('être aux anges');
			expect(deleted.deletedAt).not.toBeNull();
			expect(listed.map((c) => c.id)).not.toContain(deleted.id);

			const edited = await card('l’ordre du jour');
			expect(edited.sideB).toBe('the agenda');
			for (const r of edited.reviews) {
				expect(r.state).toBe('new');
				expect(r.logs).toHaveLength(2);
			}

			const [amended] = (await review('Je te tiens au courant.', 'a_to_b')).logs;
			expect(amended).toMatchObject({ rating: 'good', amendedAt: expect.any(Date) });

			const origins = await db.reviewLog.groupBy({ by: ['origin'], _count: true });
			expect(origins.map((o) => o.origin).sort()).toEqual(['claude', 'web']);
		});

		// Dernier du groupe : recharge la seed (à l'identique).
		it('is deterministic for a given now', async () => {
			const snapshot = async () =>
				(
					await db.review.findMany({
						include: { card: true, _count: { select: { logs: true } } }
					})
				)
					.map((r) => ({
						card: r.card.sideA,
						direction: r.direction,
						due: r.due,
						stability: r.stability,
						difficulty: r.difficulty,
						state: r.state,
						reps: r.reps,
						logs: r._count.logs
					}))
					.sort((a, b) => `${a.card}${a.direction}`.localeCompare(`${b.card}${b.direction}`));

			const first = await snapshot();
			await seedSandbox(db, { now });
			expect(await snapshot()).toEqual(first);
		});
	});

	describe('when reviewing', () => {
		beforeEach(seed);

		it('presents the most overdue review first and buries the reverse of a recent answer', async () => {
			const buried = await review('mettre les pieds dans le plat', 'b_to_a');
			expect(buried.due <= now).toBe(true);
			const deleted = await card('être aux anges');

			const first = await reviews.next(owner, now);
			expect(first.review).toMatchObject({ prompt: 'to split hairs', direction: 'b_to_a' });

			// Vide la file : le sens mis de côté et la carte supprimée ne sont jamais présentés.
			const presented = new Set<string>();
			for (let result = first; result.review; result = await reviews.next(owner, now)) {
				const { id, version } = result.review;
				expect(presented.has(id)).toBe(false);
				presented.add(id);
				await reviews.answer(owner, id, { rating: 'good', version, origin: 'web' }, now);
			}
			expect(presented.size).toBeGreaterThan(10);
			expect(presented.has(buried.id)).toBe(false);
			for (const r of deleted.reviews) expect(presented.has(r.id)).toBe(false);
		});

		it('keeps a recent answer amendable, and caps the rating after a hint', async () => {
			const recent = await review('faire le point', 'a_to_b');
			expect(recent.logs.at(-1)?.reviewedAt).toEqual(at(-20));
			expect(await reviews.amend(owner, recent.id, 'hard', now)).toMatchObject({ rating: 'hard' });

			const old = await review('couper les cheveux en quatre', 'a_to_b');
			await expect(reviews.amend(owner, old.id, 'hard', now)).rejects.toBeInstanceOf(ConflictError);

			const hinted = await review('une piste', 'a_to_b');
			expect(hinted.logs.at(-1)).toMatchObject({ hintUsed: true, rating: 'hard' });

			const pending = await review('rattraper son retard', 'a_to_b');
			expect(pending.hintRequestedAt).toEqual(at(-5));
			const answered = await reviews.answer(
				owner,
				pending.id,
				{ rating: 'good', version: pending.lastReview!.toISOString(), origin: 'web' },
				now
			);
			expect(answered.rating).toBe('hard');
		});
	});
});
