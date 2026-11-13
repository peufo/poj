import { VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY, VAPID_SUBJECT } from '$app/env/private';
import type { PushSender } from '#lib/server/domain/index.js';
import { createWebPushSender } from './web-push';

/**
 * Identité VAPID du serveur auprès des services push, ou `null` s'il manque une variable :
 * les notifications de révision sont alors indisponibles.
 */
export const vapid =
	VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && VAPID_SUBJECT
		? { publicKey: VAPID_PUBLIC_KEY, privateKey: VAPID_PRIVATE_KEY, subject: VAPID_SUBJECT }
		: null;

/** `null` sans identité VAPID : aucun rappel n'est envoyé. */
export const pushSender: PushSender | null = vapid ? createWebPushSender(vapid) : null;
