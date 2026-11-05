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

/** Nombre maximal de textes par requête `/v2/translate`. */
const DEEPL_MAX_TEXTS = 50;

/** Réponse attendue de `/v2/translate` : une traduction par texte envoyé. */
const responseSchema = z.object({
	translations: z.array(z.object({ text: z.string() })).nonempty()
});

/** Les clés du plan gratuit se terminent par `:fx` et passent par un autre hôte. */
export function deeplBaseUrl(apiKey: string): string {
	return apiKey.endsWith(':fx') ? 'https://api-free.deepl.com' : 'https://api.deepl.com';
}

export function createDeeplTranslator(apiKey: string, fetchFn: typeof fetch = fetch): Translator {
	const url = `${deeplBaseUrl(apiKey)}/v2/translate`;

	/** Une requête, pour au plus `DEEPL_MAX_TEXTS` textes. */
	async function post(
		texts: string[],
		{ from, to, context }: Omit<TranslateRequest, 'texts'>
	): Promise<string[]> {
		let response: Response;
		try {
			response = await fetchFn(url, {
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
			return (await Promise.all(chunks.map((chunk) => post(chunk, request)))).flat();
		}
	};
}
