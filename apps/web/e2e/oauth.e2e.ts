import { createHash, randomBytes } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { open, submitSignIn, waitForApp } from './helpers';

// Autorisation OAuth complète du connecteur Claude, vue du navigateur : enregistrement
// dynamique du client, connexion avec la requête signée, consentement, puis retour vers
// le `redirect_uri` du client avec le code.

const CALLBACK = 'https://client.example/callback';

test('authorizes a dynamically registered client up to its callback', async ({
	page,
	request,
	baseURL
}) => {
	const registered = await request.post('/api/auth/oauth2/register', {
		data: {
			client_name: 'Client e2e',
			redirect_uris: [CALLBACK],
			grant_types: ['authorization_code', 'refresh_token'],
			response_types: ['code'],
			token_endpoint_auth_method: 'none'
		}
	});
	expect(registered.ok()).toBe(true);
	const { client_id } = (await registered.json()) as { client_id: string };

	const verifier = randomBytes(32).toString('base64url');
	const state = randomBytes(8).toString('hex');
	const authorize = new URLSearchParams({
		response_type: 'code',
		client_id,
		redirect_uri: CALLBACK,
		scope: 'cards',
		state,
		code_challenge: createHash('sha256').update(verifier).digest('base64url'),
		code_challenge_method: 'S256',
		resource: `${baseURL}/mcp`
	});
	// Le client n'existe pas : le navigateur s'arrête à son callback.
	await page.route(`${CALLBACK}**`, (route) => route.fulfill({ body: 'ok' }));

	await open(page, `/api/auth/oauth2/authorize?${authorize}`);
	await expect(page).toHaveURL(/\/login\?.*sig=/);
	// Même avec une requête signée valable, le consentement exige une session.
	const signedQuery = new URL(page.url()).search;
	await open(page, `/oauth/consent${signedQuery}`);
	await expect(page).toHaveURL(/\/login\?.*sig=/);
	await submitSignIn(page);

	await expect(page).toHaveURL(/\/oauth\/consent\?.*sig=/);
	await expect(
		page.getByRole('heading', { name: 'Client e2e demande l’accès à tes cartes' })
	).toBeVisible();
	await expect(page.getByText('Lire, créer, modifier et réviser tes cartes')).toBeVisible();
	await expect(page.getByText('client.example')).toBeVisible();
	await waitForApp(page);
	await page.getByRole('button', { name: 'Autoriser' }).click();

	await page.waitForURL(`${CALLBACK}**`);
	const callback = new URL(page.url());
	expect(callback.searchParams.get('code')).toBeTruthy();
	expect(callback.searchParams.get('state')).toBe(state);
	expect(callback.searchParams.get('iss')).toBe(`${baseURL}/api/auth`);
});
