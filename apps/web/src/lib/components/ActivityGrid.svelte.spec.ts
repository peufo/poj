import { page, userEvent } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import ActivityGrid from './ActivityGrid.svelte';

/** Du lundi 29 décembre 2025 au mercredi 7 janvier 2026. */
const days = Array.from({ length: 10 }, (_, i) => {
	const date = new Date(Date.UTC(2025, 11, 29 + i)).toISOString().slice(0, 10);
	return { date, added: i === 9 ? 2 : 0, reviewed: i === 9 ? 5 : i % 2 };
});

describe('ActivityGrid', () => {
	it('labels each day with its additions and reviews', async () => {
		await render(ActivityGrid, { days });

		await expect
			.element(
				page.getByRole('button', {
					name: 'mercredi 7 janvier 2026 : 2 cartes ajoutées, 5 révisions'
				})
			)
			.toBeInTheDocument();
		await expect
			.element(
				page.getByRole('button', { name: 'lundi 29 décembre 2025 : 0 carte ajoutée, 0 révision' })
			)
			.toBeInTheDocument();
		// La fin de la semaine en cours est à venir : dessinée, mais sans case à consulter.
		expect(page.getByRole('button', { name: /^jeudi 8 janvier/ }).query()).toBeNull();
		expect(page.getByRole('button').all()).toHaveLength(days.length);
	});

	it('starts on today, moves by day with the arrows and shows the focused day', async () => {
		await render(ActivityGrid, { days });

		// Seul aujourd'hui est dans l'ordre de tabulation.
		const today = page.getByRole('button', { name: /^mercredi 7 janvier/ });
		await expect.element(today).toHaveAttribute('tabindex', '0');
		await expect
			.element(page.getByRole('button', { name: /^mardi 6 janvier/ }))
			.toHaveAttribute('tabindex', '-1');
		today.element().focus();
		await expect.element(page.getByText('mercredi 7 janvier 2026')).toBeVisible();
		await expect.element(page.getByText('5 révisions · 2 cartes ajoutées')).toBeVisible();

		await userEvent.keyboard('{ArrowUp}');
		await expect.element(page.getByText('mardi 6 janvier 2026')).toBeVisible();
		await userEvent.keyboard('{ArrowLeft}');
		await expect.element(page.getByText('mardi 30 décembre 2025')).toBeVisible();
	});
});
