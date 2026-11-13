import { beforeEach, describe, expect, it } from 'vitest';
import { useTestDatabase } from '../../testing/db';
import { createUser } from '../../testing/factories';
import { createNotificationsService, DEFAULT_READY_THRESHOLD } from './notifications.service';

const db = useTestDatabase();
const notifications = createNotificationsService(db);

const now = new Date('2026-11-13T10:00:00Z');
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

let jonas: string;
let lea: string;
beforeEach(async () => {
	jonas = await createUser(db, 'Jonas');
	lea = await createUser(db, 'Lea');
});

describe('push subscriptions', () => {
	it('subscribes several devices of an account', async () => {
		await notifications.subscribe(jonas, phone);
		await notifications.subscribe(jonas, laptop);

		expect(await notifications.endpoints(jonas)).toEqual([phone.endpoint, laptop.endpoint]);
		expect(await notifications.endpoints(lea)).toEqual([]);
		expect(
			await db.pushSubscription.findUniqueOrThrow({ where: { endpoint: phone.endpoint } })
		).toMatchObject({ userId: jonas, p256dh: 'phone-p256dh', auth: 'phone-auth', deletedAt: null });
	});

	it('soft-deletes on unsubscribe, and succeeds when already unsubscribed', async () => {
		await notifications.subscribe(jonas, phone);
		await notifications.subscribe(jonas, laptop);

		await notifications.unsubscribe(jonas, phone.endpoint, now);
		await notifications.unsubscribe(jonas, phone.endpoint);
		await notifications.unsubscribe(jonas, 'https://fcm.googleapis.com/fcm/send/unknown');

		expect(await notifications.endpoints(jonas)).toEqual([laptop.endpoint]);
		expect(
			await db.pushSubscription.findUniqueOrThrow({ where: { endpoint: phone.endpoint } })
		).toMatchObject({ deletedAt: now });
	});

	it("leaves another account's device subscribed", async () => {
		await notifications.subscribe(lea, phone);

		await notifications.unsubscribe(jonas, phone.endpoint, now);

		expect(await notifications.endpoints(lea)).toEqual([phone.endpoint]);
	});

	it('revives a resubscribed endpoint with its new keys, in a single row', async () => {
		const first = await notifications.subscribe(jonas, phone);
		await notifications.unsubscribe(jonas, phone.endpoint, now);

		const again = await notifications.subscribe(jonas, { ...phone, p256dh: 'new', auth: 'new' });

		expect(again).toMatchObject({ id: first.id, p256dh: 'new', auth: 'new', deletedAt: null });
		expect(await notifications.endpoints(jonas)).toEqual([phone.endpoint]);
		expect(await db.pushSubscription.count()).toBe(1);
	});

	it('moves the endpoint to the last account that subscribes on the device', async () => {
		await notifications.subscribe(jonas, phone);

		await notifications.subscribe(lea, phone);

		expect(await notifications.endpoints(jonas)).toEqual([]);
		expect(await notifications.endpoints(lea)).toEqual([phone.endpoint]);
	});
});

describe('ready threshold', () => {
	it('has a default until the account sets it', async () => {
		expect(await notifications.threshold(jonas)).toBe(DEFAULT_READY_THRESHOLD);
		expect(await db.notificationSettings.count()).toBe(0);
	});

	it('keeps one row per account, updated in place', async () => {
		await notifications.setThreshold(jonas, 12);
		await notifications.setThreshold(jonas, 3);
		await notifications.setThreshold(lea, 20);

		expect(await notifications.threshold(jonas)).toBe(3);
		expect(await notifications.threshold(lea)).toBe(20);
		expect(await db.notificationSettings.count()).toBe(2);
	});
});
