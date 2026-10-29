import { describe, expect, it } from 'vitest';
import { createTranslationService } from './translation.service';
import { TranslatorError, type TranslateRequest, type Translator } from './translator';

function fakeTranslator(impl: (request: TranslateRequest) => string): Translator & {
	calls: TranslateRequest[];
} {
	const calls: TranslateRequest[] = [];
	return {
		calls,
		async translate(request) {
			calls.push(request);
			return impl(request);
		}
	};
}

/** Paire du deck par défaut : la variante cible vient de l'étiquette (`en-GB`). */
const pair = { languageA: 'fr', languageB: 'en-GB' };

describe('translation service', () => {
	it('suggests a translation of side A into the language of side B, with the context', async () => {
		const translator = fakeTranslator(() => 'to take for granted');
		const service = createTranslationService(translator);

		expect(await service.suggest(pair, ' tenir pour acquis ', ' réunion ')).toEqual({
			ok: true,
			text: 'to take for granted'
		});
		expect(translator.calls).toEqual([
			{ text: 'tenir pour acquis', from: 'fr', to: 'en-GB', context: 'réunion' }
		]);
	});

	it('checks a card in both directions of the pair', async () => {
		const translator = fakeTranslator(({ to }) =>
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

	it('reports a missing configuration', async () => {
		expect(await createTranslationService(null).suggest(pair, 'bonjour')).toEqual({
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

		expect(await quota.suggest(pair, 'bonjour')).toEqual({ ok: false, reason: 'quota' });
		expect(await crash.suggest(pair, 'bonjour')).toEqual({ ok: false, reason: 'unavailable' });
	});
});
