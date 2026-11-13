import type { PushMessage } from '../../../push';
import type { PushSubscriptionInput } from './notifications.service';

/**
 * Issue d'un envoi : `expired` quand le service push ne connaît plus l'abonnement (404 ou
 * 410), `failed` pour tout autre refus ou une panne, à retenter plus tard.
 */
export type PushOutcome = 'sent' | 'expired' | 'failed';

/** Envoi Web Push (VAPID), fourni par l'appelant. Ne lève pas : une panne donne `failed`. */
export interface PushSender {
	send(subscription: PushSubscriptionInput, message: PushMessage): Promise<PushOutcome>;
}
