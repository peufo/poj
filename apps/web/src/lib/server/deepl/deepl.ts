// Client de l'API DeepL : https://developers.deepl.com/api-reference/translate
import * as z from 'zod';
import { baseLanguage } from '#lib/format/decks.js';
import {
	TranslatorError,
	type Language,
	type TranslateRequest,
	type Translator
} from '#lib/server/domain/index.js';

/** Langue source DeepL : la langue seule (`en-GB` → `EN`), DeepL n'accepte pas de variante. */
export const deeplSource = (language: Language) => baseLanguage(language).toUpperCase();

/** Langue cible DeepL : l'étiquette entière, variante comprise (`en-GB` → `EN-GB`). */
export const deeplTarget = (language: Language) => language.toUpperCase();

const TIMEOUT_MS = 5_000;

/** Attente avant la nouvelle tentative après un 429 sans `Retry-After` lisible. */
const DEFAULT_RETRY_DELAY_MS = 1_000;

/** Au-delà de cette attente demandée par `Retry-After`, on renonce au lieu de réessayer. */
const MAX_RETRY_DELAY_MS = 5_000;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Délai demandé par l'en-tête `Retry-After` (en secondes), ou le délai par défaut. */
function retryDelay(response: Response): number {
	const seconds = Number(response.headers.get('retry-after'));
	return response.headers.has('retry-after') && Number.isFinite(seconds) && seconds >= 0
		? seconds * 1000
		: DEFAULT_RETRY_DELAY_MS;
}

/** Nombre maximal de textes par requête `/v2/translate`. */
const DEEPL_MAX_TEXTS = 50;

/**
 * Requêtes simultanées au plus, pour un traducteur (un seul par processus) : un lot aux
 * contextes tous différents enverrait sinon jusqu'à deux requêtes par carte d'un coup, et
 * DeepL répondrait 429.
 */
const MAX_PARALLEL_REQUESTS = 4;

/** Exécute au plus `max` tâches à la fois ; les suivantes attendent, dans l'ordre d'arrivée. */
function limiter(max: number) {
	let active = 0;
	const waiting: (() => void)[] = [];
	return async <T>(task: () => Promise<T>): Promise<T> => {
		if (active < max) active += 1;
		else await new Promise<void>((resolve) => waiting.push(resolve));
		try {
			return await task();
		} finally {
			// La place passe directement à la tâche suivante, s'il y en a une.
			const next = waiting.shift();
			if (next) next();
			else active -= 1;
		}
	};
}

/** Réponse attendue de `/v2/translate` : une traduction par texte envoyé. */
const responseSchema = z.object({
	translations: z.array(z.object({ text: z.string() })).nonempty()
});

/** Les clés du plan gratuit se terminent par `:fx` et passent par un autre hôte. */
export function deeplBaseUrl(apiKey: string): string {
	return apiKey.endsWith(':fx') ? 'https://api-free.deepl.com' : 'https://api.deepl.com';
}

export function createDeeplTranslator(
	apiKey: string,
	fetchFn: typeof fetch = fetch,
	sleep: (ms: number) => Promise<void> = wait
): Translator {
	const url = `${deeplBaseUrl(apiKey)}/v2/translate`;
	const limit = limiter(MAX_PARALLEL_REQUESTS);

	/** Une requête, pour au plus `DEEPL_MAX_TEXTS` textes. */
	async function post(
		texts: string[],
		{ from, to, context }: Omit<TranslateRequest, 'texts'>
	): Promise<string[]> {
		const send = () =>
			fetchFn(url, {
				method: 'POST',
				headers: {
					Authorization: `DeepL-Auth-Key ${apiKey}`,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					text: texts,
					source_lang: deeplSource(from),
					target_lang: deeplTarget(to),
					...(context && { context })
				}),
				signal: AbortSignal.timeout(TIMEOUT_MS)
			});

		let response: Response;
		try {
			response = await send();
			// Un seul nouvel essai : la place dans la file reste tenue pendant l'attente.
			if (response.status === 429) {
				const delay = retryDelay(response);
				if (delay <= MAX_RETRY_DELAY_MS) {
					await sleep(delay);
					response = await send();
				}
			}
		} catch (error) {
			throw new TranslatorError('unavailable', `DeepL unreachable: ${String(error)}`);
		}

		if (!response.ok) {
			const traceId = response.headers.get('x-trace-id');
			const message = `DeepL responded ${response.status} (trace ${traceId})`;
			if (response.status === 403) throw new TranslatorError('auth', message);
			if (response.status === 456) throw new TranslatorError('quota', message);
			throw new TranslatorError('unavailable', message);
		}

		let body: unknown;
		try {
			body = await response.json();
		} catch (error) {
			throw new TranslatorError('unavailable', `DeepL returned invalid JSON: ${String(error)}`);
		}
		const parsed = responseSchema.safeParse(body);
		if (!parsed.success) {
			throw new TranslatorError(
				'unavailable',
				`DeepL returned an unexpected response: ${z.prettifyError(parsed.error)}`
			);
		}
		const { translations } = parsed.data;
		if (translations.length !== texts.length) {
			throw new TranslatorError(
				'unavailable',
				`DeepL returned ${translations.length} translations for ${texts.length} texts`
			);
		}
		return translations.map((translation) => translation.text);
	}

	return {
		async translate({ texts, ...request }) {
			const chunks = Array.from({ length: Math.ceil(texts.length / DEEPL_MAX_TEXTS) }, (_, i) =>
				texts.slice(i * DEEPL_MAX_TEXTS, (i + 1) * DEEPL_MAX_TEXTS)
			);
			return (await Promise.all(chunks.map((chunk) => limit(() => post(chunk, request))))).flat();
		}
	};
}
