import { assert, describe, expect, it } from 'vitest';
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

		const texts = await translator.translate({
			texts: ['tenir pour acquis'],
			from: 'fr',
			to: 'en-GB',
			context: 'réunion budget'
		});

		expect(texts).toEqual(['to take for granted']);
		const [call] = fetch.calls;
		assert.exists(call);
		const { url, init } = call;
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
			texts: ['hello'],
			from: 'en-GB',
			to: 'fr'
		});

		const [call] = fetch.calls;
		assert.exists(call);
		expect(JSON.parse(call.init.body as string)).toEqual({
			text: ['hello'],
			source_lang: 'EN',
			target_lang: 'FR'
		});
	});

	it('translates several texts per request, at most 50 at a time, in order', async () => {
		const calls: string[][] = [];
		const fn = (async (_url: string, init: RequestInit) => {
			const { text } = JSON.parse(init.body as string) as { text: string[] };
			calls.push(text);
			return json({ translations: text.map((t) => ({ text: t.toUpperCase() })) });
		}) as unknown as typeof fetch;
		const texts = Array.from({ length: 120 }, (_, i) => `t${i}`);

		const translated = await createDeeplTranslator('key', fn).translate({
			texts,
			from: 'fr',
			to: 'en'
		});

		expect(calls.map((chunk) => chunk.length)).toEqual([50, 50, 20]);
		expect(translated).toEqual(texts.map((t) => t.toUpperCase()));
	});

	it('sends at most 4 requests at a time, across overlapping calls', async () => {
		let inFlight = 0;
		let peak = 0;
		let requests = 0;
		const fn = (async (_url: string, init: RequestInit) => {
			requests += 1;
			peak = Math.max(peak, ++inFlight);
			await new Promise((resolve) => setTimeout(resolve, 1));
			inFlight -= 1;
			const { text } = JSON.parse(init.body as string) as { text: string[] };
			return json({ translations: text.map((t) => ({ text: t.toUpperCase() })) });
		}) as unknown as typeof fetch;
		const translator = createDeeplTranslator('key', fn);

		// Un lot aux contextes tous différents : une requête par texte.
		const translated = await Promise.all(
			Array.from({ length: 20 }, (_, i) =>
				translator.translate({ texts: [`t${i}`], from: 'fr', to: 'en', context: `c${i}` })
			)
		);

		expect(requests).toBe(20);
		expect(peak).toBe(4);
		expect(translated.flat()).toEqual(Array.from({ length: 20 }, (_, i) => `T${i}`));
	});

	it.each([
		[403, 'auth'],
		[456, 'quota'],
		[500, 'unavailable']
	])('maps HTTP %i to the %s failure', async (status, reason) => {
		const translator = createDeeplTranslator('key', fakeFetch(json({ message: 'x' }, status)).fn);

		await expect(
			translator.translate({ texts: ['a'], from: 'fr', to: 'en' })
		).rejects.toMatchObject({
			reason
		});
	});

	describe('on HTTP 429', () => {
		const tooMany = (retryAfter?: string) =>
			new Response('{}', { status: 429, headers: retryAfter ? { 'retry-after': retryAfter } : {} });
		const ok = () => json({ translations: [{ text: 'a' }] });

		function sequence(...responses: Response[]) {
			const waits: number[] = [];
			let calls = 0;
			const fn = (async () => responses[calls++]) as unknown as typeof fetch;
			const translator = createDeeplTranslator('key', fn, async (ms) => {
				waits.push(ms);
			});
			return { translator, waits, calls: () => calls };
		}
		const request = { texts: ['a'], from: 'fr' as const, to: 'en' as const };

		it('retries once after the Retry-After delay', async () => {
			const s = sequence(tooMany('2'), ok());

			expect(await s.translator.translate(request)).toEqual(['a']);
			expect(s.waits).toEqual([2000]);
			expect(s.calls()).toBe(2);
		});

		it('retries after a short default delay when Retry-After is missing', async () => {
			const s = sequence(tooMany(), ok());

			expect(await s.translator.translate(request)).toEqual(['a']);
			expect(s.waits).toEqual([1000]);
		});

		it('maps a second 429 to unavailable', async () => {
			const s = sequence(tooMany('0'), tooMany('0'));

			await expect(s.translator.translate(request)).rejects.toMatchObject({
				reason: 'unavailable'
			});
			expect(s.calls()).toBe(2);
		});

		it('gives up without retrying when Retry-After is above the bound', async () => {
			const s = sequence(tooMany('30'), ok());

			await expect(s.translator.translate(request)).rejects.toMatchObject({
				reason: 'unavailable'
			});
			expect(s.calls()).toBe(1);
			expect(s.waits).toEqual([]);
		});

		it('keeps its place in the queue while waiting, without leaking it', async () => {
			let inFlight = 0;
			let peak = 0;
			const seen = new Set<string>();
			const fn = (async (_url: string, init: RequestInit) => {
				const { text } = JSON.parse(init.body as string) as { text: string[] };
				peak = Math.max(peak, ++inFlight);
				await new Promise((resolve) => setTimeout(resolve, 1));
				inFlight -= 1;
				// Chaque texte reçoit un 429 à sa première requête.
				const [first = ''] = text;
				if (!seen.has(first)) {
					seen.add(first);
					return tooMany('0');
				}
				return json({ translations: text.map((t) => ({ text: t.toUpperCase() })) });
			}) as unknown as typeof fetch;
			const translator = createDeeplTranslator('key', fn, async () => {});

			const translated = await Promise.all(
				Array.from({ length: 12 }, (_, i) =>
					translator.translate({ texts: [`t${i}`], from: 'fr', to: 'en', context: `c${i}` })
				)
			);

			expect(translated.flat()).toEqual(Array.from({ length: 12 }, (_, i) => `T${i}`));
			expect(peak).toBeLessThanOrEqual(4);
		});
	});

	it('maps a network error to unavailable', async () => {
		const translator = createDeeplTranslator('key', fakeFetch(new TypeError('fetch failed')).fn);

		const error = await translator
			.translate({ texts: ['a'], from: 'fr', to: 'en' })
			.catch((e) => e);
		expect(error).toBeInstanceOf(TranslatorError);
		expect(error.reason).toBe('unavailable');
	});

	it.each([
		['no translation', json({ translations: [] })],
		['a translation without text', json({ translations: [{ detected_source_language: 'FR' }] })],
		['an unexpected shape', json({ text: 'to take for granted' })],
		['fewer translations than texts', json({ translations: [{ text: 'x' }] })],
		['a body that is not JSON', new Response('<html>busy</html>', { status: 200 })]
	])('maps a response with %s to unavailable', async (_, response) => {
		const translator = createDeeplTranslator('key', fakeFetch(response).fn);

		const error = await translator
			.translate({ texts: ['a', 'b'], from: 'fr', to: 'en' })
			.catch((e) => e);
		expect(error).toBeInstanceOf(TranslatorError);
		expect(error.reason).toBe('unavailable');
	});
});
