import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import { open } from './helpers';

// Premier lancement : sans aucun compte, la connexion renvoie vers l'inscription, et le
// premier compte est créé. La base est vidée : ce spec passe après tous les autres
// (projet `first-launch` de playwright.config.ts).

test.beforeAll(() => {
	execFileSync('bun', ['scripts/e2e.ts', 'empty'], {
		cwd: new URL('..', import.meta.url),
		stdio: 'inherit'
	});
});

test('creates the first account', async ({ page }) => {
	await open(page, '/login');
	await expect(page).toHaveURL(/\/register$/);

	await page.getByLabel('Nom').fill('Jonas');
	// Acceptée par le navigateur, refusée par le schéma (pas de domaine de premier niveau).
	await page.getByLabel('Email').fill('jonas@poj');
	await page.getByLabel('Mot de passe').fill('motdepasse-jonas');
	await page.getByRole('button', { name: 'Créer mon compte' }).click();
	await expect(page.getByText('Adresse email invalide.')).toBeVisible();

	await page.getByLabel('Email').fill('jonas@poj.local');
	await page.getByRole('button', { name: 'Créer mon compte' }).click();
	// Connecté, sans deck : le premier deck est à créer.
	await expect(page).toHaveURL(/\/decks\/new$/);
	await expect(page.getByText('jonas@poj.local').first()).toBeVisible();

	// Le compte existe : l'inscription est fermée.
	await page.getByRole('button', { name: 'Déconnexion' }).click();
	await expect(page).toHaveURL(/\/login$/);
	await open(page, '/register');
	await expect(page).toHaveURL(/\/login$/);
});
