import { vapid } from '#lib/server/push/index.js';
import { MAX_READY_THRESHOLD, MIN_READY_THRESHOLD } from '#lib/server/domain/index.js';
import { ownerOf } from '#lib/server/web/guards.js';
import { notifications } from '#lib/server/web/services.js';
import type { PageServerLoad } from './$types';

// Réglages du compte : notifications de révision (abonnement de l'appareil et seuil de
// cartes prêtes). Sans clés VAPID, elles sont indisponibles.

export const load: PageServerLoad = async (event) => {
	if (!vapid) return { notifications: null };
	const ownerId = ownerOf(event);
	const [threshold, endpoints] = await Promise.all([
		notifications.threshold(ownerId),
		notifications.endpoints(ownerId)
	]);
	return {
		notifications: {
			vapidPublicKey: vapid.publicKey,
			endpoints,
			threshold: { value: threshold, min: MIN_READY_THRESHOLD, max: MAX_READY_THRESHOLD }
		}
	};
};
