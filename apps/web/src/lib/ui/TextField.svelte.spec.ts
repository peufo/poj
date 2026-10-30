import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import TextField from './TextField.svelte';

describe('TextField', () => {
	it.each([false, true])(
		'offers no autofill on a content field, browser or password manager (multiline: %s)',
		async (multiline) => {
			render(TextField, { label: 'Nom', name: 'name', multiline });
			const field = page.getByLabelText('Nom');

			await expect.element(field).toHaveAttribute('autocomplete', 'off');
			await expect.element(field).toHaveAttribute('data-protonpass-ignore', 'true');
			await expect.element(field).toHaveAttribute('data-1p-ignore', 'true');
		}
	);

	it('keeps the autofill asked for by an auth field', async () => {
		render(TextField, { label: 'Email', name: 'email', type: 'email', autocomplete: 'email' });
		const field = page.getByLabelText('Email');

		await expect.element(field).toHaveAttribute('autocomplete', 'email');
		await expect.element(field).not.toHaveAttribute('data-protonpass-ignore');
		await expect.element(field).not.toHaveAttribute('data-1p-ignore');
	});
});
