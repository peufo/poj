/** Contenu d'une notification push, envoyé par le serveur en JSON. */
export interface PushMessage {
	title: string;
	body: string;
}

const DEFAULT_TITLE = 'Poj';

/**
 * Lit le texte d'un message push. Un JSON `{ title, body }` donne la notification ; tout autre
 * texte (le push de test de DevTools par exemple) devient le corps, sous le titre de l'app.
 */
export function readPushMessage(text = ''): PushMessage {
	let data: unknown;
	try {
		data = JSON.parse(text);
	} catch {
		// Pas du JSON : le texte brut sert de corps.
	}
	if (typeof data !== 'object' || data === null) return { title: DEFAULT_TITLE, body: text };
	const title = 'title' in data && typeof data.title === 'string' ? data.title : DEFAULT_TITLE;
	const body = 'body' in data && typeof data.body === 'string' ? data.body : '';
	return { title, body };
}
