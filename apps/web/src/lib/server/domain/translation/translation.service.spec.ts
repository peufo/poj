import { assert, describe, expect, it } from 'vitest';
import { createTranslationService, diverges } from './translation.service';
import { TranslatorError, type TranslateRequest, type Translator } from './translator';

/** Faux DeepL : traduit chaque texte par `impl`, et garde les demandes reçues. */
function fakeTranslator(impl: (text: string, request: TranslateRequest) => string): Translator & {
	calls: TranslateRequest[];
} {
	const calls: TranslateRequest[] = [];
	return {
		calls,
		async translate(request) {
			calls.push(request);
			return request.texts.map((text) => impl(text, request));
		}
	};
}

/** Paire du deck par défaut : la variante cible vient de l'étiquette (`en-GB`). */
const pair = { languageA: 'fr', languageB: 'en-GB' };

describe('translation service', () => {
	it('suggests a translation of side A into the language of side B, with the context', async () => {
		const translator = fakeTranslator(() => 'to take for granted');
		const service = createTranslationService(translator);

		expect(await service.suggest(pair, 'a_to_b', ' tenir pour acquis ', ' réunion ')).toEqual({
			ok: true,
			text: 'to take for granted'
		});
		expect(translator.calls).toEqual([
			{ texts: ['tenir pour acquis'], from: 'fr', to: 'en-GB', context: 'réunion' }
		]);
	});

	it('suggests a translation of side B into the language of side A, with the context', async () => {
		const translator = fakeTranslator(() => 'tenir pour acquis');
		const service = createTranslationService(translator);

		expect(await service.suggest(pair, 'b_to_a', ' to take for granted ', ' réunion ')).toEqual({
			ok: true,
			text: 'tenir pour acquis'
		});
		expect(translator.calls).toEqual([
			{ texts: ['to take for granted'], from: 'en-GB', to: 'fr', context: 'réunion' }
		]);
	});

	it('checks a card in both directions of the pair', async () => {
		const translator = fakeTranslator((_, { to }) =>
			to === 'en-GB' ? 'to take for granted' : 'tenir pour acquis'
		);
		const service = createTranslationService(translator);

		expect(
			await service.check(pair, { sideA: 'tenir pour acquis', sideB: 'to take for granted' })
		).toEqual({
			aToB: { ok: true, text: 'to take for granted' },
			bToA: { ok: true, text: 'tenir pour acquis' }
		});
		expect(translator.calls.map(({ from, to }) => [from, to])).toEqual([
			['fr', 'en-GB'],
			['en-GB', 'fr']
		]);
	});

	it('checks a batch in one request per direction and context, in the order of the cards', async () => {
		const dictionary: Record<string, string> = {
			chat: 'cat',
			chien: 'dog',
			maison: 'house',
			cat: 'chat',
			dog: 'chien',
			house: 'maison'
		};
		const translator = fakeTranslator((text) => {
			const translation = dictionary[text];
			assert.exists(translation, `no translation for ${text}`);
			return translation;
		});
		const service = createTranslationService(translator);

		const checks = await service.checkAll(pair, [
			{ sideA: 'chat', sideB: 'cat', context: 'Source : cours' },
			{ sideA: 'maison', sideB: 'house' },
			{ sideA: 'chien', sideB: 'dog', context: ' Source : cours ' }
		]);

		expect(checks.map(({ aToB, bToA }) => [aToB, bToA])).toEqual([
			[
				{ ok: true, text: 'cat' },
				{ ok: true, text: 'chat' }
			],
			[
				{ ok: true, text: 'house' },
				{ ok: true, text: 'maison' }
			],
			[
				{ ok: true, text: 'dog' },
				{ ok: true, text: 'chien' }
			]
		]);
		expect(translator.calls).toEqual([
			{ texts: ['chat', 'chien'], from: 'fr', to: 'en-GB', context: 'Source : cours' },
			{ texts: ['maison'], from: 'fr', to: 'en-GB', context: undefined },
			{ texts: ['cat', 'dog'], from: 'en-GB', to: 'fr', context: 'Source : cours' },
			{ texts: ['house'], from: 'en-GB', to: 'fr', context: undefined }
		]);
	});

	it('reports a failure for every card of the batch', async () => {
		const service = createTranslationService(
			fakeTranslator(() => {
				throw new TranslatorError('quota', 'Quota exceeded');
			})
		);

		const checks = await service.checkAll(pair, [
			{ sideA: 'chat', sideB: 'cat' },
			{ sideA: 'chien', sideB: 'dog' }
		]);
		expect(checks).toEqual(
			Array(2).fill({ aToB: { ok: false, reason: 'quota' }, bToA: { ok: false, reason: 'quota' } })
		);
	});

	it('finds a divergence only when neither direction matches the card', () => {
		const card = { sideA: 'tenir pour acquis', sideB: 'to take for granted' };
		const ok = (text: string) => ({ ok: true as const, text });

		expect(diverges(card, { aToB: ok('To take for granted.'), bToA: ok('autre') })).toBe(false);
		expect(diverges(card, { aToB: ok('autre'), bToA: ok(' Tenir pour  acquis ') })).toBe(false);
		expect(diverges(card, { aToB: ok('to assume'), bToA: ok('considérer comme acquis') })).toBe(
			true
		);
		expect(diverges(card, { aToB: { ok: false, reason: 'quota' }, bToA: ok('considérer') })).toBe(
			false
		);
	});

	it('reports a missing configuration', async () => {
		expect(await createTranslationService(null).suggest(pair, 'a_to_b', 'bonjour')).toEqual({
			ok: false,
			reason: 'not_configured'
		});
	});

	it('reports translator failures instead of throwing', async () => {
		const quota = createTranslationService(
			fakeTranslator(() => {
				throw new TranslatorError('quota', 'Quota exceeded');
			})
		);
		const crash = createTranslationService(
			fakeTranslator(() => {
				throw new Error('boom');
			})
		);

		expect(await quota.suggest(pair, 'a_to_b', 'bonjour')).toEqual({ ok: false, reason: 'quota' });
		expect(await crash.suggest(pair, 'a_to_b', 'bonjour')).toEqual({
			ok: false,
			reason: 'unavailable'
		});
	});
});
