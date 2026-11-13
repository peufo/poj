// Notifications de révision (doc/story/notifications-revision.md) : chaque compte abonne ses
// appareils au Web Push et règle à partir de combien de cartes prêtes il est prévenu.
import type { Db } from '../db';

/** Seuil d'un compte tant qu'il ne l'a pas réglé. */
export const DEFAULT_READY_THRESHOLD = 5;
export const MIN_READY_THRESHOLD = 1;
export const MAX_READY_THRESHOLD = 100;

/** Abonnement Web Push d'un appareil, tel que le navigateur le donne (`PushSubscription`). */
export interface PushSubscriptionInput {
	endpoint: string;
	p256dh: string;
	auth: string;
}

export type NotificationsService = ReturnType<typeof createNotificationsService>;

export function createNotificationsService(db: Db) {
	return {
		/**
		 * Enregistre l'abonnement de l'appareil pour le compte. Rejoué, il met à jour les clés ;
		 * désactivé, il revient ; venu d'un autre compte sur le même navigateur, il passe à
		 * celui-ci.
		 */
		subscribe(ownerId: string, { endpoint, p256dh, auth }: PushSubscriptionInput) {
			return db.pushSubscription.upsert({
				where: { endpoint },
				create: { userId: ownerId, endpoint, p256dh, auth },
				update: { userId: ownerId, p256dh, auth, deletedAt: null }
			});
		},

		/**
		 * Désactive l'abonnement de l'appareil, s'il est au compte. Réussit aussi s'il est déjà
		 * désactivé ou inconnu.
		 */
		async unsubscribe(ownerId: string, endpoint: string, now = new Date()): Promise<void> {
			await db.pushSubscription.updateMany({
				where: { endpoint, userId: ownerId, deletedAt: null },
				data: { deletedAt: now }
			});
		},

		/** Adresses des appareils abonnés du compte. */
		async endpoints(ownerId: string): Promise<string[]> {
			const subscriptions = await db.pushSubscription.findMany({
				where: { userId: ownerId, deletedAt: null },
				select: { endpoint: true },
				orderBy: { createdAt: 'asc' }
			});
			return subscriptions.map((subscription) => subscription.endpoint);
		},

		/** Cartes prêtes à partir desquelles le compte est notifié. */
		async threshold(ownerId: string): Promise<number> {
			const settings = await db.notificationSettings.findUnique({
				where: { userId: ownerId },
				select: { readyThreshold: true }
			});
			return settings?.readyThreshold ?? DEFAULT_READY_THRESHOLD;
		},

		async setThreshold(ownerId: string, readyThreshold: number): Promise<void> {
			await db.notificationSettings.upsert({
				where: { userId: ownerId },
				create: { userId: ownerId, readyThreshold },
				update: { readyThreshold }
			});
		}
	};
}
