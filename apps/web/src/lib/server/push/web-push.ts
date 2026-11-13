// Envoi Web Push : chiffrement du message (aes128gcm) et en-têtes VAPID par `web-push`,
// requête par `fetch`. https://www.rfc-editor.org/rfc/rfc8030
import webpush from 'web-push';
import type { PushSender } from '#lib/server/domain/index.js';

/** Identité VAPID du serveur : clés en base64url, contact `mailto:` ou `https:`. */
export interface Vapid {
	publicKey: string;
	privateKey: string;
	subject: string;
}

const TIMEOUT_MS = 10_000;

/** Un rappel resté plus de 12 h chez le service push (appareil éteint) n'a plus d'intérêt. */
const TTL_SECONDS = 12 * 60 * 60;

/** Un rappel non encore livré est remplacé par le suivant (`Topic`). */
const TOPIC = 'review';

export function createWebPushSender(vapid: Vapid, fetchFn: typeof fetch = fetch): PushSender {
	return {
		async send({ endpoint, p256dh, auth }, message) {
			const host = URL.parse(endpoint)?.host ?? endpoint;
			try {
				const { method, headers, body } = webpush.generateRequestDetails(
					{ endpoint, keys: { p256dh, auth } },
					JSON.stringify(message),
					{
						vapidDetails: vapid,
						TTL: TTL_SECONDS,
						urgency: 'normal',
						topic: TOPIC,
						contentEncoding: 'aes128gcm'
					}
				);
				const response = await fetchFn(endpoint, {
					method,
					// `fetch` calcule lui-même la longueur ; `TTL` arrive en nombre.
					headers: Object.fromEntries(
						Object.entries(headers)
							.filter(([name]) => name !== 'Content-Length')
							.map(([name, value]) => [name, String(value)])
					),
					body: body && new Uint8Array(body),
					// L'adresse a été vérifiée (`isPushServiceUrl`) : une redirection la contournerait.
					redirect: 'error',
					signal: AbortSignal.timeout(TIMEOUT_MS)
				});
				const detail = await response.text();
				if (response.ok) return 'sent';
				if (response.status === 404 || response.status === 410) return 'expired';
				console.error(`Push service ${host} responded ${response.status}: ${detail}`);
				return 'failed';
			} catch (error) {
				console.error(`Push to ${host} failed`, error);
				return 'failed';
			}
		}
	};
}
