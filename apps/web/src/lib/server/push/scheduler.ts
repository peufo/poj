import { db } from '#lib/server/db/index.js';
import { createReviewRemindersService } from '#lib/server/domain/index.js';
import { pushSender } from './index';

/** Écart entre deux tours de rappels : le rappel part au plus 5 min après le franchissement. */
const INTERVAL_MS = 5 * 60_000;

// Une seule boucle par processus, même quand le dev recharge les hooks.
const globalForReminders = globalThis as unknown as { reviewReminders?: boolean };

/**
 * Lance les rappels de révision dans le processus : un tour tout de suite, puis un tour
 * 5 min après la fin du précédent. Rien sans identité VAPID. Plusieurs processus peuvent
 * tourner ensemble : seul celui qui marque le franchissement envoie le rappel.
 */
export function startReviewReminders(): void {
	if (!pushSender || globalForReminders.reviewReminders) return;
	globalForReminders.reviewReminders = true;

	const reminders = createReviewRemindersService(db, pushSender);
	const tick = async () => {
		try {
			await reminders.run();
		} catch (error) {
			console.error('Review reminders failed', error);
		}
		// Ne retient pas le processus à l'arrêt.
		setTimeout(tick, INTERVAL_MS).unref();
	};
	void tick();
}
