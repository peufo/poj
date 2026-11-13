import { command, form, getRequestEvent } from '$app/server';
import { ownerOf } from '#lib/server/web/guards.js';
import {
	pushSubscriptionSchema,
	pushUnsubscribeSchema,
	readyThresholdSchema
} from '#lib/server/web/schemas/notifications.js';
import { notifications } from '#lib/server/web/services.js';

/** Seuil de cartes prêtes du compte, gardé dans le formulaire après l'envoi. */
export const saveThreshold = form(readyThresholdSchema, async ({ threshold }) => {
	await notifications.setThreshold(ownerOf(getRequestEvent()), threshold);
	return { threshold };
});

/**
 * Enregistre l'abonnement push de l'appareil (`PushSubscription.toJSON()`) pour le compte.
 * Validé ici plutôt que par `command` : un refus (service push non pris en charge) revient
 * avec son message, au lieu d'un « Bad Request » sans détail.
 */
export const subscribe = command('unchecked', async (input: unknown) => {
	const ownerId = ownerOf(getRequestEvent());
	const parsed = pushSubscriptionSchema.safeParse(input);
	if (!parsed.success) {
		const [first] = parsed.error.issues;
		return { refused: first?.message ?? 'Abonnement invalide.' };
	}
	await notifications.subscribe(ownerId, parsed.data);
	return { refused: null };
});

/** Désabonne l'appareil, par l'adresse de son abonnement. */
export const unsubscribe = command(pushUnsubscribeSchema, async ({ endpoint }) => {
	await notifications.unsubscribe(ownerOf(getRequestEvent()), endpoint);
});
