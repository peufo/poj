import { VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY, VAPID_SUBJECT } from '$app/env/private';

/**
 * Identité VAPID du serveur auprès des services push, ou `null` s'il manque une variable :
 * les notifications de révision sont alors indisponibles.
 */
export const vapid =
	VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && VAPID_SUBJECT
		? { publicKey: VAPID_PUBLIC_KEY, privateKey: VAPID_PRIVATE_KEY, subject: VAPID_SUBJECT }
		: null;
