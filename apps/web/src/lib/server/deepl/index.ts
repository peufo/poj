import { DEEPL_API_KEY } from '$app/env/private';
import type { Translator } from '#lib/server/domain/index.js';
import { createDeeplTranslator } from './deepl';

/** `null` sans clé configurée : les suggestions DeepL sont alors désactivées. */
export const translator: Translator | null = DEEPL_API_KEY
	? createDeeplTranslator(DEEPL_API_KEY)
	: null;
