import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import CopyField from './CopyField.svelte';

describe('CopyField', () => {
	it('shows the value in a read-only field', async () => {
		render(CopyField, { label: 'Lien', value: 'https://poj.test/x' });
		const field = page.getByLabelText('Lien');

		await expect.element(field).toHaveValue('https://poj.test/x');
		await expect.element(field).toHaveAttribute('readonly');
	});

	it('copies the value, then confirms', async () => {
		const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
		render(CopyField, { label: 'Lien', value: 'https://poj.test/x' });

		await page.getByRole('button', { name: 'Copier' }).click();

		expect(writeText).toHaveBeenCalledWith('https://poj.test/x');
		await expect.element(page.getByRole('button', { name: 'Copié' })).toBeVisible();
	});

	it('stays silent when the clipboard is unavailable', async () => {
		vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'));
		render(CopyField, { label: 'Lien', value: 'abc' });

		await page.getByRole('button', { name: 'Copier' }).click();

		await expect.element(page.getByRole('button', { name: 'Copier' })).toBeVisible();
	});
});
