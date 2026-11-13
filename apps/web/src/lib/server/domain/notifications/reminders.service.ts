// Rappels de révision (doc/story/notifications-revision.md) : une notification quand les cartes
// prêtes d'un compte atteignent son seuil, puis plus rien tant qu'elles n'y sont pas repassées
// dessous.
import { plural } from '../../../format/labels';
import type { PushMessage } from '../../../push';
import type { Db } from '../db';
import { createReviewsService } from '../reviews/reviews.service';
import { createNotificationsService, DEFAULT_READY_THRESHOLD } from './notifications.service';
import type { PushSender } from './push-sender';
import { isPushServiceUrl } from './push-services';

/** Bilan d'un tour : comptes notifiés, comptes repassés sous le seuil, abonnements expirés. */
export interface RemindersRun {
	notified: number;
	reset: number;
	expired: number;
}

/** Notification « une révision t'attend », avec le nombre de cartes prêtes. */
export function reviewReminder(ready: number): PushMessage {
	return {
		title: "Une révision t'attend",
		body: plural(ready, 'carte prête', 'cartes prêtes')
	};
}

export type ReviewRemindersService = ReturnType<typeof createReviewRemindersService>;

export function createReviewRemindersService(db: Db, sender: PushSender) {
	const reviews = createReviewsService(db);
	const notifications = createNotificationsService(db);

	/**
	 * Marque le seuil comme atteint, si personne ne l'a fait : vrai pour le seul appelant qui
	 * doit envoyer, même avec plusieurs processus. Sans réglage, la ligne est créée avec le
	 * seuil par défaut.
	 */
	async function claim(userId: string, hasSettings: boolean, now: Date): Promise<boolean> {
		const { count } = hasSettings
			? await db.notificationSettings.updateMany({
					where: { userId, thresholdReachedAt: null },
					data: { thresholdReachedAt: now }
				})
			: await db.notificationSettings.createMany({
					data: { userId, readyThreshold: DEFAULT_READY_THRESHOLD, thresholdReachedAt: now },
					skipDuplicates: true
				});
		return count > 0;
	}

	/** Envoie le rappel à chaque appareil actif du compte ; un abonnement expiré est supprimé. */
	async function notify(userId: string, message: PushMessage, now: Date) {
		const subscriptions = await db.pushSubscription.findMany({
			where: { userId, deletedAt: null },
			select: { endpoint: true, p256dh: true, auth: true }
		});
		const outcomes = await Promise.all(
			subscriptions
				.filter(({ endpoint }) => isPushServiceUrl(endpoint))
				.map(async (subscription) => {
					const outcome = await sender.send(subscription, message);
					if (outcome === 'expired') {
						await notifications.unsubscribe(userId, subscription.endpoint, now);
					}
					return outcome;
				})
		);
		return {
			sent: outcomes.filter((outcome) => outcome === 'sent').length,
			expired: outcomes.filter((outcome) => outcome === 'expired').length
		};
	}

	return {
		/**
		 * Un tour : pour chaque compte qui a au moins un appareil abonné, compare ses cartes
		 * prêtes à son seuil. Au franchissement, un rappel part vers ses appareils ; sous le
		 * seuil, le compte redevient notifiable. Sans aucun envoi réussi, le franchissement
		 * reste à notifier au tour suivant. L'erreur d'un compte n'arrête pas les autres.
		 */
		async run(now = new Date()): Promise<RemindersRun> {
			const accounts = await db.user.findMany({
				where: { pushSubscriptions: { some: { deletedAt: null } } },
				select: {
					id: true,
					notificationSettings: { select: { readyThreshold: true, thresholdReachedAt: true } }
				}
			});
			const run: RemindersRun = { notified: 0, reset: 0, expired: 0 };

			for (const { id: userId, notificationSettings: settings } of accounts) {
				try {
					const ready = await reviews.countDue(userId, now);
					const threshold = settings?.readyThreshold ?? DEFAULT_READY_THRESHOLD;

					if (ready < threshold) {
						if (!settings?.thresholdReachedAt) continue;
						const { count } = await db.notificationSettings.updateMany({
							where: { userId, thresholdReachedAt: { not: null } },
							data: { thresholdReachedAt: null }
						});
						run.reset += count;
						continue;
					}

					if (settings?.thresholdReachedAt) continue;
					if (!(await claim(userId, settings !== null, now))) continue;

					const { sent, expired } = await notify(userId, reviewReminder(ready), now);
					run.expired += expired;
					if (sent > 0) {
						run.notified += 1;
					} else {
						await db.notificationSettings.updateMany({
							where: { userId, thresholdReachedAt: now },
							data: { thresholdReachedAt: null }
						});
					}
				} catch (error) {
					console.error(`Review reminder failed for user ${userId}`, error);
				}
			}
			return run;
		}
	};
}
