import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Velocities from './Velocities.svelte';

const terms = { windowDays: 7, matureDays: 21 };

describe('Velocities', () => {
	it('shows the daily average with one decimal, and the mature cards', async () => {
		render(Velocities, { repsPerDay: 18 / 7, matureCards: 4, ...terms });

		await expect.element(page.getByText('2,6', { exact: true })).toBeVisible();
		await expect.element(page.getByText('répétitions par jour')).toBeVisible();
		await expect.element(page.getByText('moyenne sur 7 jours')).toBeVisible();
		await expect.element(page.getByText('4', { exact: true })).toBeVisible();
		await expect.element(page.getByText('cartes mûres')).toBeVisible();
		await expect.element(page.getByText('retenues pour 21 jours ou plus')).toBeVisible();
	});

	it('agrees in the singular below two, on the rounded value', async () => {
		const low = render(Velocities, { repsPerDay: 1 / 7, matureCards: 1, ...terms });
		await expect.element(page.getByText('0,1', { exact: true })).toBeVisible();
		await expect.element(page.getByText('répétition par jour')).toBeVisible();
		await expect.element(page.getByText('carte mûre', { exact: true })).toBeVisible();
		await low.unmount();

		render(Velocities, { repsPerDay: 1.96, matureCards: 0, ...terms });
		await expect.element(page.getByText('2', { exact: true })).toBeVisible();
		await expect.element(page.getByText('répétitions par jour')).toBeVisible();
		await expect.element(page.getByText('carte mûre', { exact: true })).toBeVisible();
	});

	it('names the scope only when the page shows a single deck', async () => {
		const all = render(Velocities, { repsPerDay: 1, matureCards: 1, ...terms });
		await expect.element(page.getByText('Tous les decks')).not.toBeInTheDocument();
		await all.unmount();

		render(Velocities, { repsPerDay: 1, matureCards: 1, ...terms, allDecks: true });
		await expect.element(page.getByText('Tous les decks')).toBeVisible();
	});
});
