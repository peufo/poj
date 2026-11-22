import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Page from './+page.svelte';

/** Du lundi 5 janvier au mercredi 7 janvier 2026. */
const activity = ['2026-01-05', '2026-01-06', '2026-01-07'].map((date) => ({
	date,
	added: 1,
	reviewed: 2
}));

const data = {
	velocities: { repsPerDay: 2.6, matureCards: 3, windowDays: 7, matureDays: 21 },
	activity,
	nav: { dueCount: 0, decks: [] }
};

describe('/stats', () => {
	it('shows the velocities and the year of activity for every deck', async () => {
		await render(Page, { data: { ...data, deck: null } } as never);

		await expect.element(page.getByRole('heading', { name: 'Statistiques' })).toBeVisible();
		await expect.element(page.getByText('Tous les decks')).toBeVisible();
		await expect.element(page.getByRole('region', { name: 'Vélocités' })).toBeVisible();
		await expect.element(page.getByRole('heading', { name: 'Activité sur l’année' })).toBeVisible();
		await expect.element(page.getByText('6 révisions, 3 cartes ajoutées')).toBeVisible();
		await expect
			.element(page.getByRole('link', { name: 'Cartes' }))
			.toHaveAttribute('href', '/cards');
	});

	it('names the deck and leads back to it', async () => {
		await render(Page, { data: { ...data, deck: { id: 'd1', name: 'Anglais' } } } as never);

		await expect.element(page.getByText('Anglais')).toBeVisible();
		await expect
			.element(page.getByRole('link', { name: 'Cartes' }))
			.toHaveAttribute('href', '/cards?deck=d1');
	});
});
