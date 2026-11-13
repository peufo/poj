import { createECDH, randomBytes } from 'node:crypto';
import { assert, describe, expect, it } from 'vitest';
import webpush from 'web-push';
import { createWebPushSender } from './web-push';

const vapid = { ...webpush.generateVAPIDKeys(), subject: 'mailto:admin@poj.ch' };

/** Abonnement d'un navigateur : clé publique P-256 et secret d'authentification, en base64url. */
function browserSubscription(endpoint = 'https://fcm.googleapis.com/fcm/send/abc') {
	const keys = createECDH('prime256v1');
	keys.generateKeys();
	return {
		endpoint,
		p256dh: keys.getPublicKey('base64url'),
		auth: randomBytes(16).toString('base64url')
	};
}

function fakeFetch(response: Response | Error) {
	const calls: { url: string; init: RequestInit }[] = [];
	const fn = (async (url: string, init: RequestInit) => {
		calls.push({ url, init });
		if (response instanceof Error) throw response;
		return response;
	}) as unknown as typeof fetch;
	return { fn, calls };
}

const message = { title: "Une révision t'attend", body: '5 cartes prêtes' };

/** Envoie `message` avec un service push qui répond `response` (ou lève cette erreur). */
async function send(response: Response | Error, subscription = browserSubscription()) {
	const fetch = fakeFetch(response);
	const outcome = await createWebPushSender(vapid, fetch.fn).send(subscription, message);
	return { outcome, calls: fetch.calls };
}

describe('Web Push sender', () => {
	it('posts the encrypted message to the endpoint, signed with VAPID', async () => {
		const subscription = browserSubscription();
		const { outcome, calls } = await send(new Response(null, { status: 201 }), subscription);

		expect(outcome).toBe('sent');
		const [call] = calls;
		assert.exists(call);
		expect(call.url).toBe(subscription.endpoint);
		expect(call.init).toMatchObject({ method: 'POST', redirect: 'error' });
		expect(call.init.headers).toMatchObject({
			TTL: '43200',
			Urgency: 'normal',
			Topic: 'review',
			'Content-Encoding': 'aes128gcm',
			'Content-Type': 'application/octet-stream'
		});
		expect(call.init.headers).not.toHaveProperty('Content-Length');
		const headers = new Headers(call.init.headers);
		expect(headers.get('authorization')).toMatch(
			new RegExp(`^vapid t=[\\w-]+\\.[\\w-]+\\.[\\w-]+, k=${vapid.publicKey}$`)
		);
		expect(call.init.body).toBeInstanceOf(Uint8Array);
		// Chiffré : le texte du message n'apparaît pas tel quel.
		expect(Buffer.from(call.init.body as Uint8Array).toString()).not.toContain('cartes');
	});

	it.each([404, 410])(
		'reports a subscription the push service no longer knows (%i)',
		async (status) => {
			expect((await send(new Response('gone', { status }))).outcome).toBe('expired');
		}
	);

	it('reports a failure on any other refusal', async () => {
		expect((await send(new Response('unauthorized', { status: 403 }))).outcome).toBe('failed');
	});

	it('reports a failure when the push service is unreachable', async () => {
		expect((await send(new TypeError('fetch failed'))).outcome).toBe('failed');
	});

	it('reports a failure, without any request, for unusable browser keys', async () => {
		const subscription = { ...browserSubscription(), p256dh: 'invalid' };
		const { outcome, calls } = await send(new Response(null, { status: 201 }), subscription);

		expect(outcome).toBe('failed');
		expect(calls).toEqual([]);
	});
});
