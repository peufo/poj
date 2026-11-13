import { self } from '$app/service-worker';
import { readPushMessage } from '#lib/push.js';

// Pas de gestionnaire `fetch` : rien n'est mis en cache (ni pages ni API), le hors-ligne
// n'est pas un objectif. Le service worker ne sert qu'aux notifications push.

/** Page ouverte au clic sur une notification. */
const REVIEW_PATH = '/review';

self.addEventListener('install', () => {
	void self.skipWaiting();
});

self.addEventListener('activate', (event) => {
	event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
	const { title, body } = readPushMessage(event.data?.text());
	// Une seule notification à la fois : la suivante remplace la précédente.
	event.waitUntil(
		self.registration.showNotification(title, { body, icon: '/icon-192.png', tag: 'review' })
	);
});

self.addEventListener('notificationclick', (event) => {
	event.notification.close();
	event.waitUntil(openReview());
});

/** Met au premier plan la révision déjà ouverte, sinon y amène une autre fenêtre de l'app. */
async function openReview() {
	const url = new URL(REVIEW_PATH, self.location.origin).href;
	const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
	const review = windows.find((open) => new URL(open.url).pathname === REVIEW_PATH);
	if (review) {
		await review.focus();
		return;
	}
	// `navigate` échoue sur une fenêtre que le service worker ne contrôle pas encore.
	const navigated = await windows[0]
		?.focus()
		.then((client) => client.navigate(url))
		.catch(() => null);
	if (!navigated) await self.clients.openWindow(url);
}
