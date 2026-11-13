import * as z from 'zod';
import {
	isPushServiceUrl,
	MAX_READY_THRESHOLD,
	MIN_READY_THRESHOLD,
	type PushSubscriptionInput
} from '#lib/server/domain/index.js';

// Réglages des notifications : seuil de cartes prêtes (remote form) et abonnement de
// l'appareil (commands appelées après les API push du navigateur).

const thresholdMessage = `Entre ${MIN_READY_THRESHOLD} et ${MAX_READY_THRESHOLD} cartes prêtes.`;

/** Seuil de cartes prêtes (champ `n:`). */
export const readyThresholdSchema = z.object({
	threshold: z
		.number({ error: thresholdMessage })
		.int(thresholdMessage)
		.min(MIN_READY_THRESHOLD, thresholdMessage)
		.max(MAX_READY_THRESHOLD, thresholdMessage)
});

/** Adresse d'un abonnement. */
const endpoint = z.string().max(2048);

/** Clé publique ou secret d'authentification, en base64url. */
const key = z
	.string()
	.max(256)
	.regex(/^[A-Za-z0-9_-]+={0,2}$/, 'Clé d’abonnement invalide.');

/**
 * Abonnement tel que `PushSubscription.toJSON()` le donne. Seuls les services push des
 * navigateurs sont acceptés : le serveur enverra des requêtes à cette adresse.
 */
export const pushSubscriptionSchema = z
	.object({
		endpoint: endpoint.refine(
			isPushServiceUrl,
			'Ce navigateur utilise un service de notifications que Poj ne prend pas en charge.'
		),
		keys: z.object({ p256dh: key, auth: key })
	})
	.transform(({ endpoint, keys }): PushSubscriptionInput => ({ endpoint, ...keys }));

/** Appareil à désabonner, par l'adresse de son abonnement. */
export const pushUnsubscribeSchema = z.object({ endpoint });
