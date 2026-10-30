import prettier from 'eslint-config-prettier';
import path from 'node:path';
import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import { defineConfig, includeIgnoreFile } from 'eslint/config';
import globals from 'globals';
import ts from 'typescript-eslint';

const gitignorePath = path.resolve(import.meta.dirname, '.gitignore');

export default defineConfig(
	includeIgnoreFile(gitignorePath),
	js.configs.recommended,
	ts.configs.recommended,
	svelte.configs.recommended,
	prettier,
	svelte.configs.prettier,
	{
		languageOptions: { globals: { ...globals.browser, ...globals.node } },
		rules: {
			// typescript-eslint strongly recommend that you do not use the no-undef lint rule on TypeScript projects.
			// see: https://typescript-eslint.io/troubleshooting/faqs/eslint/#i-get-errors-from-the-no-undef-rule-about-global-variables-not-being-defined-even-though-there-are-no-typescript-errors
			'no-undef': 'off'
		}
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: {
				projectService: true,
				extraFileExtensions: ['.svelte'],
				parser: ts.parser
			}
		}
	},
	{
		// Les outils de test et de bac à sable (seed, remise à zéro) restent hors du code de prod.
		files: ['src/**/*.{js,ts,svelte}'],
		ignores: ['src/**/*.{test,spec}.{js,ts}', 'src/lib/server/testing/**'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					patterns: [
						{
							regex: '(^|/)testing(/|$)',
							message: 'src/lib/server/testing/ is reserved for tests and scripts.'
						}
					]
				}
			]
		}
	},
	{
		// Zod 4 classique, importé d'une seule façon : `import { z }` embarque toutes les
		// locales dans le bundle client, et `zod/mini` est une seconde API.
		rules: {
			'no-restricted-syntax': [
				'error',
				{
					selector:
						"ImportDeclaration[source.value='zod'] > :matches(ImportSpecifier, ImportDefaultSpecifier)",
					message: "Import Zod as a namespace: import * as z from 'zod'."
				},
				{
					selector: 'ImportDeclaration[source.value=/^zod\\u002F/]',
					message: "Use classic Zod 4 from 'zod' (no zod/mini, zod/v3 or other subpath)."
				},
				{
					selector:
						"ImportDeclaration[source.value='@hono/zod-openapi'] > ImportSpecifier[imported.name='z']",
					message: "Import Zod as a namespace: import * as z from 'zod'."
				}
			]
		}
	},
	{
		// Override or add rule settings here, such as:
		// 'svelte/button-has-type': 'error'
		rules: {}
	}
);
