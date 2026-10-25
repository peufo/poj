// Client de l'API DeepL : https://developers.deepl.com/api-reference/translate
import { TranslatorError, type Language, type Translator } from '#lib/server/domain/index.js';

const SOURCE: Record<Language, string> = { fr: 'FR', en: 'EN' };
const TARGET: Record<Language, string> = { fr: 'FR', en: 'EN-US' };

const TIMEOUT_MS = 5_000;

/** Les clés du plan gratuit se terminent par `:fx` et passent par un autre hôte. */
export function deeplBaseUrl(apiKey: string): string {
	return apiKey.endsWith(':fx') ? 'https://api-free.deepl.com' : 'https://api.deepl.com';
}

export function createDeeplTranslator(apiKey: string, fetchFn: typeof fetch = fetch): Translator {
	const url = `${deeplBaseUrl(apiKey)}/v2/translate`;

	return {
		async translate({ text, from, to, context }) {
			let response: Response;
			try {
				response = await fetchFn(url, {
					method: 'POST',
					headers: {
						Authorization: `DeepL-Auth-Key ${apiKey}`,
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({
						text: [text],
						source_lang: SOURCE[from],
						target_lang: TARGET[to],
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

			const body = (await response.json()) as { translations?: { text: string }[] };
			const translated = body.translations?.[0]?.text;
			if (translated === undefined) {
				throw new TranslatorError('unavailable', 'DeepL returned no translation');
			}
			return translated;
		}
	};
}
