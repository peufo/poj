import { page } from 'vitest/browser';
import { createRawSnippet } from 'svelte';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import AppShell from './AppShell.svelte';

const children = createRawSnippet(() => ({ render: () => '<main>Contenu</main>' }));

const english = { id: 'd1', name: 'Français → Anglais', cardCount: 25 };
const capitals = { id: 'd2', name: 'Capitales', cardCount: 3 };

/** La barre latérale (grand écran), la première des deux navigations. */
const sidebar = () => page.getByRole('navigation', { name: 'Navigation principale' }).first();

describe('AppShell', () => {
	it('lists each deck by its name and card count, in place of « Cartes »', async () => {
		await page.viewport(1280, 800);
		render(AppShell, { current: 'cards', decks: [english, capitals], dueCount: 4, children });

		const nav = sidebar();
		await expect
			.element(nav.getByRole('link', { name: 'Français → Anglais 25' }))
			.toHaveAttribute('href', '/cards?deck=d1');
		await expect
			.element(nav.getByRole('link', { name: 'Capitales 3' }))
			.toHaveAttribute('href', '/cards?deck=d2');
		await expect.element(nav.getByRole('link', { name: 'Nouveau deck' })).toBeInTheDocument();
		await expect
			.element(nav.getByRole('link', { name: 'Cartes', exact: true }))
			.not.toBeInTheDocument();
		// Avec deux decks et aucun affiché, aucun n'est actif ; la carte n'a pas de deck d'avance.
		for (const name of ['Français → Anglais 25', 'Capitales 3']) {
			await expect.element(nav.getByRole('link', { name })).not.toHaveAttribute('aria-current');
		}
		await expect
			.element(nav.getByRole('link', { name: 'Nouvelle carte' }))
			.toHaveAttribute('href', '/cards/new');
	});

	it('marks the deck shown, and creates the new card in it', async () => {
		await page.viewport(1280, 800);
		render(AppShell, {
			current: 'cards',
			decks: [english, capitals],
			activeDeck: 'd2',
			children
		});

		const nav = sidebar();
		await expect
			.element(nav.getByRole('link', { name: 'Capitales 3' }))
			.toHaveAttribute('aria-current', 'page');
		await expect
			.element(nav.getByRole('link', { name: 'Nouvelle carte' }))
			.toHaveAttribute('href', '/cards/new?deck=d2');
	});

	it('treats a single deck as the deck shown', async () => {
		await page.viewport(1280, 800);
		render(AppShell, { current: 'cards', decks: [english], children });

		await expect
			.element(sidebar().getByRole('link', { name: 'Français → Anglais 25' }))
			.toHaveAttribute('aria-current', 'page');
	});

	it('keeps a single « Cartes » tab on the phone', async () => {
		await page.viewport(390, 844);
		render(AppShell, { current: 'cards', decks: [english, capitals], children });

		const tabs = page.getByRole('navigation', { name: 'Navigation principale' }).last();
		await expect
			.element(tabs.getByRole('link', { name: 'Cartes' }))
			.toHaveAttribute('href', '/cards');
		await expect.element(tabs.getByRole('link', { name: 'Capitales' })).not.toBeInTheDocument();
	});
});
