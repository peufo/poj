import { expect, test } from '@playwright/test';
import { SANDBOX_ACCOUNT } from '../src/lib/server/testing/sandbox-account';
import { expectRemoteSubmission, open, signIn, unique } from './helpers';

// Formulaires de l'administration : inviter un testeur, révoquer une invitation.

test.beforeEach(async ({ page }) => signIn(page));

test('invites a tester, then revokes the invitation', async ({ page }) => {
	const email = `${unique('testeur').replace(' ', '-')}@poj.local`;
	await open(page, '/admin');
	await page.getByLabel('Email du testeur').fill(email);
	await page.getByRole('button', { name: 'Générer le lien' }).click();

	await expect(page.getByLabel(`Lien pour ${email}`)).toHaveValue(/\/invite\//);
	await expectRemoteSubmission(page);
	const pending = page.getByRole('listitem').filter({ hasText: email });
	await expect(pending).toBeVisible();

	await pending.getByRole('button', { name: 'Révoquer' }).click();
	await expect(pending).toHaveCount(0);
});

test('refuses to invite an existing account', async ({ page }) => {
	await open(page, '/admin');
	await page.getByLabel('Email du testeur').fill(SANDBOX_ACCOUNT.email);
	await page.getByRole('button', { name: 'Générer le lien' }).click();

	await expect(page.getByText('Un compte existe déjà avec cet email.')).toBeVisible();
	await expect(page.getByLabel('Email du testeur')).toHaveValue(SANDBOX_ACCOUNT.email);
});
