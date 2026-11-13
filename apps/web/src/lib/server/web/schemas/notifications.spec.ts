import { describe, expect, it } from 'vitest';
import { MAX_READY_THRESHOLD, MIN_READY_THRESHOLD } from '#lib/server/domain/index.js';
import { fieldErrors } from '../../testing/schemas';
import { pushSubscriptionSchema, readyThresholdSchema } from './notifications';

const subscription = (endpoint: string) => ({
	endpoint,
	expirationTime: null,
	keys: {
		p256dh:
			'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
		auth: 'tBHItJI5svbpez7KI4CCXg'
	}
});

describe('notification schemas', () => {
	it('accepts a threshold within the bounds', () => {
		expect(readyThresholdSchema.parse({ threshold: MIN_READY_THRESHOLD })).toEqual({
			threshold: MIN_READY_THRESHOLD
		});
		expect(readyThresholdSchema.parse({ threshold: MAX_READY_THRESHOLD })).toEqual({
			threshold: MAX_READY_THRESHOLD
		});
	});

	it('refuses a threshold out of bounds, decimal or missing', () => {
		const message = `Entre ${MIN_READY_THRESHOLD} et ${MAX_READY_THRESHOLD} cartes prêtes.`;
		for (const threshold of [MIN_READY_THRESHOLD - 1, MAX_READY_THRESHOLD + 1, 2.5, undefined]) {
			expect(fieldErrors(readyThresholdSchema, { threshold })).toEqual({ threshold: message });
		}
	});

	it('flattens the subscription of a known push service', () => {
		for (const endpoint of [
			'https://fcm.googleapis.com/fcm/send/abc',
			'https://updates.push.services.mozilla.com/wpush/v2/abc',
			'https://web.push.apple.com/QGx1',
			'https://wns2-par02p.notify.windows.com/w/?token=abc'
		]) {
			expect(pushSubscriptionSchema.parse(subscription(endpoint))).toEqual({
				endpoint,
				p256dh: subscription(endpoint).keys.p256dh,
				auth: subscription(endpoint).keys.auth
			});
		}
	});

	it('refuses any other address, with a message in French', () => {
		const message =
			'Ce navigateur utilise un service de notifications que Poj ne prend pas en charge.';
		for (const endpoint of [
			'http://fcm.googleapis.com/fcm/send/abc',
			'https://fcm.googleapis.com:8443/fcm/send/abc',
			'https://evil.example/fcm.googleapis.com',
			'https://fcm.googleapis.com.evil.example/abc',
			'https://push.apple.com.evil.example/abc',
			'https://localhost/abc',
			'not a url'
		]) {
			expect(fieldErrors(pushSubscriptionSchema, subscription(endpoint))).toEqual({
				endpoint: message
			});
		}
	});

	it('refuses keys that are not base64url', () => {
		const invalid = {
			...subscription('https://fcm.googleapis.com/fcm/send/abc'),
			keys: { p256dh: 'not base64!', auth: '' }
		};
		expect(pushSubscriptionSchema.safeParse(invalid).success).toBe(false);
	});
});
