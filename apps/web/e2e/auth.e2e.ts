import { expect, test } from '@playwright/test';
import { SANDBOX_ACCOUNT } from '../src/lib/server/testing/sandbox-account';
import { open, signIn, submitSignIn, unique } from './helpers';

// Connexion, déconnexion et invitation d'un testeur.

test('refuses a wrong password, then signs in', async ({ page }) => {
	await open(page, '/login');
	await submitSignIn(page, 'pas-le-bon');

	await expect(page.getByText('Email ou mot de passe incorrect.')).toBeVisible();
	await expect(page).toHaveURL(/\/login$/);
	await expect(page.getByLabel('Email')).toHaveValue(SANDBOX_ACCOUNT.email);

	await page.getByLabel('Mot de passe').fill(SANDBOX_ACCOUNT.password);
	await page.getByRole('button', { name: 'Se connecter' }).click();
	await expect(page).toHaveURL(/\/cards$/);
});

test('returns to the requested page after signing in', async ({ page }) => {
	await open(page, '/decks/new');
	await expect(page).toHaveURL(/\/login\?redirectTo=%2Fdecks%2Fnew$/);
	await submitSignIn(page);
	await expect(page).toHaveURL(/\/decks\/new$/);
});

test('signs out from the sidebar', async ({ page }) => {
	await signIn(page);
	await page.getByRole('button', { name: 'Déconnexion' }).click();
	await expect(page).toHaveURL(/\/login$/);

	// Plus de session : la page des cartes renvoie à la connexion.
	await open(page, '/cards');
	await expect(page).toHaveURL(/\/login$/);
});

test('signs out from the account sheet on a phone', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await signIn(page);
	await page.getByRole('button', { name: 'Compte' }).click();
	await page.getByRole('button', { name: 'Se déconnecter' }).click();
	await expect(page).toHaveURL(/\/login$/);

	// Plus de session : la page des cartes renvoie à la connexion.
	await open(page, '/cards');
	await expect(page).toHaveURL(/\/login$/);
});

test('creates the account of an invited tester, signed in', async ({ page, browser }) => {
	const email = `${unique('invite').replace(' ', '-')}@poj.local`;
	await signIn(page);
	await open(page, '/admin');
	await page.getByLabel('Email du testeur').fill(email);
	await page.getByRole('button', { name: 'Générer le lien' }).click();
	const link = await page.getByLabel(`Lien pour ${email}`).inputValue();

	// Le testeur ouvre le lien dans son propre navigateur.
	const tester = await (await browser.newContext()).newPage();
	await open(tester, link);
	await expect(tester.getByText(email)).toBeVisible();
	await tester.getByLabel('Nom').fill('Léa');
	await tester.getByLabel('Mot de passe').fill('motdepasse-lea');
	await tester.getByRole('button', { name: 'Créer mon compte' }).click();
	// Connecté, sans deck : le premier deck est à créer.
	await expect(tester).toHaveURL(/\/decks\/new$/);
	await expect(tester.getByText(email).first()).toBeVisible();

	await tester.context().close();

	// Le lien a servi (vu sans session : connecté, on serait renvoyé vers ses cartes).
	const visitor = await (await browser.newContext()).newPage();
	await visitor.goto(link);
	await expect(visitor.getByText('Ce lien d’invitation a déjà servi.')).toBeVisible();
	await visitor.context().close();
});
