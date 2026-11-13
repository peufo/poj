import { beforeEach, describe, expect, it } from 'vitest';
import type { PushMessage } from '../../../push';
import { useTestDatabase } from '../../testing/db';
import { createCard, createDeck, createUser, SUBJECT_DECK } from '../../testing/factories';
import { createReviewsService } from '../reviews/reviews.service';
import { createNotificationsService, DEFAULT_READY_THRESHOLD } from './notifications.service';
import type { PushOutcome, PushSender } from './push-sender';
import { createReviewRemindersService, reviewReminder } from './reminders.service';

const db = useTestDatabase();
const notifications = createNotificationsService(db);
const reviews = createReviewsService(db);

const t0 = new Date('2026-11-13T08:00:00Z');
const at = (minutes: number) => new Date(t0.getTime() + minutes * 60_000);

const phone = {
	endpoint: 'https://web.push.apple.com/phone',
	p256dh: 'phone-p256dh',
	auth: 'phone-auth'
};
const laptop = {
	endpoint: 'https://fcm.googleapis.com/fcm/send/laptop',
	p256dh: 'laptop-p256dh',
	auth: 'laptop-auth'
};

/** Faux service push : note chaque envoi, et répond `sent` sauf mention pour l'adresse. */
function fakeSender(outcomes: Record<string, PushOutcome> = {}) {
	const sent: { endpoint: string; message: PushMessage }[] = [];
	const sender: PushSender = {
		async send(subscription, message) {
			sent.push({ endpoint: subscription.endpoint, message });
			return outcomes[subscription.endpoint] ?? 'sent';
		}
	};
	return { sender, sent };
}

let jonas: string;
let deckId: string;

beforeEach(async () => {
	jonas = await createUser(db, 'Jonas');
	deckId = (await createDeck(db, jonas, SUBJECT_DECK)).id;
});

/** `count` cartes neuves à sens unique, prêtes dès `now`. */
async function addCards(count: number, now = t0) {
	for (let i = 0; i < count; i += 1) {
		await createCard(db, jonas, { deckId, sideA: `q${i}-${now.getTime()}`, sideB: 'r', now });
	}
}

/** Répond `easy` aux `count` prochaines révisions : elles repartent à plusieurs jours. */
async function answer(count: number, now: Date) {
	for (let i = 0; i < count; i += 1) {
		const { review } = await reviews.next(jonas, now);
		if (!review) throw new Error('expected a review to answer');
		await reviews.answer(
			jonas,
			review.id,
			{ rating: 'easy', version: review.version, origin: 'web' },
			now
		);
	}
}

/** Tour sans effet. */
const quiet = { notified: 0, reset: 0, expired: 0 };

const reachedAt = async (userId: string) =>
	(await db.notificationSettings.findUnique({ where: { userId } }))?.thresholdReachedAt ?? null;

describe('review reminders', () => {
	beforeEach(async () => {
		await notifications.subscribe(jonas, phone);
		await notifications.subscribe(jonas, laptop);
		await notifications.setThreshold(jonas, 3);
	});

	it('notifies every device once the ready cards reach the threshold, with their count', async () => {
		const { sender, sent } = fakeSender();
		const reminders = createReviewRemindersService(db, sender);
		await addCards(2);

		expect(await reminders.run(t0)).toEqual(quiet);
		expect(sent).toEqual([]);

		await addCards(2, at(1));
		expect(await reminders.run(at(5))).toEqual({ notified: 1, reset: 0, expired: 0 });

		const message = { title: "Une révision t'attend", body: '4 cartes prêtes' };
		expect(sent).toEqual(
			expect.arrayContaining([
				{ endpoint: phone.endpoint, message },
				{ endpoint: laptop.endpoint, message }
			])
		);
		expect(sent).toHaveLength(2);
		expect(await reachedAt(jonas)).toEqual(at(5));
	});

	it('stays silent while the ready cards stay above the threshold', async () => {
		const { sender, sent } = fakeSender();
		const reminders = createReviewRemindersService(db, sender);
		await addCards(3);
		await reminders.run(t0);

		await addCards(2, at(1));
		expect(await reminders.run(at(5))).toEqual(quiet);
		expect(await reminders.run(at(10))).toEqual(quiet);

		expect(sent).toHaveLength(2);
		expect(await reachedAt(jonas)).toEqual(t0);
	});

	it('notifies again after the ready cards fell below the threshold and reached it again', async () => {
		const { sender, sent } = fakeSender();
		const reminders = createReviewRemindersService(db, sender);
		await addCards(3);
		await reminders.run(t0);

		await answer(2, at(1));
		expect(await reviews.countDue(jonas, at(5))).toBe(1);
		expect(await reminders.run(at(5))).toEqual({ notified: 0, reset: 1, expired: 0 });
		expect(await reachedAt(jonas)).toBeNull();
		expect(await reminders.run(at(10))).toEqual(quiet);

		await addCards(2, at(11));
		expect(await reminders.run(at(15))).toEqual({ notified: 1, reset: 0, expired: 0 });

		expect(sent).toHaveLength(4);
		expect(sent.slice(2).map((push) => push.message.body)).toEqual([
			'3 cartes prêtes',
			'3 cartes prêtes'
		]);
	});

	it('deletes a subscription the push service reports as expired, and still notifies the others', async () => {
		const { sender, sent } = fakeSender({ [phone.endpoint]: 'expired' });
		const reminders = createReviewRemindersService(db, sender);
		await addCards(3);

		expect(await reminders.run(t0)).toEqual({ notified: 1, reset: 0, expired: 1 });

		expect(sent.map((push) => push.endpoint).sort()).toEqual([laptop.endpoint, phone.endpoint]);
		expect(await notifications.endpoints(jonas)).toEqual([laptop.endpoint]);
		expect(
			await db.pushSubscription.findUniqueOrThrow({ where: { endpoint: phone.endpoint } })
		).toMatchObject({ deletedAt: t0 });
	});

	it('tries again on the next run when no device could be reached', async () => {
		const failing = fakeSender({ [phone.endpoint]: 'failed', [laptop.endpoint]: 'failed' });
		await addCards(3);

		expect(await createReviewRemindersService(db, failing.sender).run(t0)).toEqual(quiet);
		expect(await reachedAt(jonas)).toBeNull();

		const working = fakeSender();
		expect(await createReviewRemindersService(db, working.sender).run(at(5))).toMatchObject({
			notified: 1
		});
		expect(working.sent).toHaveLength(2);
		expect(await reachedAt(jonas)).toEqual(at(5));
	});

	it('keeps the crossing when at least one device was reached', async () => {
		const { sender } = fakeSender({ [phone.endpoint]: 'failed' });
		const reminders = createReviewRemindersService(db, sender);
		await addCards(3);

		expect(await reminders.run(t0)).toMatchObject({ notified: 1 });
		expect(await reachedAt(jonas)).toEqual(t0);
	});

	it('sends a single reminder per device when two runs overlap', async () => {
		const { sender, sent } = fakeSender();
		await addCards(3);

		await Promise.all([
			createReviewRemindersService(db, sender).run(t0),
			createReviewRemindersService(db, sender).run(t0)
		]);

		expect(sent).toHaveLength(2);
	});

	it('never sends to an address outside the accepted push services', async () => {
		await db.pushSubscription.create({
			data: { userId: jonas, endpoint: 'https://evil.example/push', p256dh: 'x', auth: 'x' }
		});
		const { sender, sent } = fakeSender();
		await addCards(3);

		await createReviewRemindersService(db, sender).run(t0);

		expect(sent.map((push) => push.endpoint).sort()).toEqual([laptop.endpoint, phone.endpoint]);
	});

	it('skips unsubscribed devices', async () => {
		await notifications.unsubscribe(jonas, laptop.endpoint, t0);
		const { sender, sent } = fakeSender();
		await addCards(3);

		await createReviewRemindersService(db, sender).run(t0);

		expect(sent.map((push) => push.endpoint)).toEqual([phone.endpoint]);
	});
});

describe('review reminders without settings', () => {
	it('uses the default threshold, and records the crossing', async () => {
		await notifications.subscribe(jonas, phone);
		const { sender, sent } = fakeSender();
		const reminders = createReviewRemindersService(db, sender);
		await addCards(DEFAULT_READY_THRESHOLD - 1);

		await reminders.run(t0);
		expect(sent).toEqual([]);
		expect(await db.notificationSettings.count()).toBe(0);

		await addCards(1, at(1));
		expect(await reminders.run(at(5))).toMatchObject({ notified: 1 });
		expect(
			await db.notificationSettings.findUniqueOrThrow({ where: { userId: jonas } })
		).toMatchObject({ readyThreshold: DEFAULT_READY_THRESHOLD, thresholdReachedAt: at(5) });
	});

	it('ignores an account without any subscribed device', async () => {
		const { sender, sent } = fakeSender();
		await addCards(DEFAULT_READY_THRESHOLD + 1);

		expect(await createReviewRemindersService(db, sender).run(t0)).toEqual(quiet);
		expect(sent).toEqual([]);
		expect(await db.notificationSettings.count()).toBe(0);
	});
});

describe('review reminder message', () => {
	it('gives the number of ready cards', () => {
		expect(reviewReminder(1)).toEqual({ title: "Une révision t'attend", body: '1 carte prête' });
		expect(reviewReminder(12).body).toBe('12 cartes prêtes');
	});
});
