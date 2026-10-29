import { describe, expect, it } from 'vitest';
import { TranslatorError } from '#lib/server/domain/index.js';
import { createDeeplTranslator, deeplBaseUrl, deeplSource, deeplTarget } from './deepl';

function fakeFetch(response: Response | Error) {
	const calls: { url: string; init: RequestInit }[] = [];
	const fn = (async (url: string, init: RequestInit) => {
		calls.push({ url, init });
		if (response instanceof Error) throw response;
		return response;
	}) as unknown as typeof fetch;
	return { fn, calls };
}

const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('DeepL translator', () => {
	it('picks the free or pro host from the key', () => {
		expect(deeplBaseUrl('abc:fx')).toBe('https://api-free.deepl.com');
		expect(deeplBaseUrl('abc')).toBe('https://api.deepl.com');
	});

	it('derives the DeepL languages from the BCP 47 tags, the region giving the target variant', () => {
		expect(deeplSource('en-GB')).toBe('EN');
		expect(deeplSource('fr')).toBe('FR');
		expect(deeplTarget('en-GB')).toBe('EN-GB');
		expect(deeplTarget('pt-BR')).toBe('PT-BR');
		expect(deeplTarget('fr')).toBe('FR');
	});

	it('sends the text, languages and context, and returns the translation', async () => {
		const fetch = fakeFetch(json({ translations: [{ text: 'to take for granted' }] }));
		const translator = createDeeplTranslator('key:fx', fetch.fn);

		const text = await translator.translate({
			text: 'tenir pour acquis',
			from: 'fr',
			to: 'en-GB',
			context: 'réunion budget'
		});

		expect(text).toBe('to take for granted');
		const [{ url, init }] = fetch.calls;
		expect(url).toBe('https://api-free.deepl.com/v2/translate');
		expect(init.headers).toMatchObject({ Authorization: 'DeepL-Auth-Key key:fx' });
		expect(JSON.parse(init.body as string)).toEqual({
			text: ['tenir pour acquis'],
			source_lang: 'FR',
			target_lang: 'EN-GB',
			context: 'réunion budget'
		});
	});

	it('omits an empty context', async () => {
		const fetch = fakeFetch(json({ translations: [{ text: 'bonjour' }] }));
		await createDeeplTranslator('key', fetch.fn).translate({
			text: 'hello',
			from: 'en-GB',
			to: 'fr'
		});

		expect(JSON.parse(fetch.calls[0].init.body as string)).toEqual({
			text: ['hello'],
			source_lang: 'EN',
			target_lang: 'FR'
		});
	});

	it.each([
		[403, 'auth'],
		[456, 'quota'],
		[429, 'unavailable'],
		[500, 'unavailable']
	])('maps HTTP %i to the %s failure', async (status, reason) => {
		const translator = createDeeplTranslator('key', fakeFetch(json({ message: 'x' }, status)).fn);

		await expect(translator.translate({ text: 'a', from: 'fr', to: 'en' })).rejects.toMatchObject({
			reason
		});
	});

	it('maps a network error to unavailable', async () => {
		const translator = createDeeplTranslator('key', fakeFetch(new TypeError('fetch failed')).fn);

		const error = await translator.translate({ text: 'a', from: 'fr', to: 'en' }).catch((e) => e);
		expect(error).toBeInstanceOf(TranslatorError);
		expect(error.reason).toBe('unavailable');
	});
});
