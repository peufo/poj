// Services push des navigateurs : le serveur n'envoie des notifications qu'à leurs adresses,
// jamais à une URL quelconque fournie par un client.

/** Hôtes des services push acceptés ; `*.` couvre tous les sous-domaines. */
export const PUSH_SERVICE_HOSTS = [
	'fcm.googleapis.com',
	'updates.push.services.mozilla.com',
	'*.push.apple.com',
	'*.notify.windows.com'
] as const;

function matchesHost(hostname: string, pattern: string): boolean {
	return pattern.startsWith('*.') ? hostname.endsWith(pattern.slice(1)) : hostname === pattern;
}

/** Vrai pour une URL `https:` d'un service push accepté, sur le port par défaut. */
export function isPushServiceUrl(value: string): boolean {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		return false;
	}
	return (
		url.protocol === 'https:' &&
		url.port === '' &&
		url.username === '' &&
		url.password === '' &&
		PUSH_SERVICE_HOSTS.some((pattern) => matchesHost(url.hostname, pattern))
	);
}
