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

describe('translation service', () => {
	it('suggests an english translation, passing the context along', async () => {
		const translator = fakeTranslator(() => 'to take for granted');
		const service = createTranslationService(translator);

		expect(await service.suggestEnglish(' tenir pour acquis ', ' réunion ')).toEqual({
			ok: true,
			text: 'to take for granted'
		});
		expect(translator.calls).toEqual([
			{ text: 'tenir pour acquis', from: 'fr', to: 'en', context: 'réunion' }
		]);
	});

	it('checks a card in both directions', async () => {
		const service = createTranslationService(
			fakeTranslator(({ to }) => (to === 'en' ? 'to take for granted' : 'tenir pour acquis'))
		);

		expect(
			await service.check({ french: 'tenir pour acquis', english: 'to take for granted' })
		).toEqual({
			frenchToEnglish: { ok: true, text: 'to take for granted' },
			englishToFrench: { ok: true, text: 'tenir pour acquis' }
		});
	});

	it('reports a missing configuration', async () => {
		expect(await createTranslationService(null).suggestEnglish('bonjour')).toEqual({
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

		expect(await quota.suggestEnglish('bonjour')).toEqual({ ok: false, reason: 'quota' });
		expect(await crash.suggestEnglish('bonjour')).toEqual({ ok: false, reason: 'unavailable' });
	});
});
