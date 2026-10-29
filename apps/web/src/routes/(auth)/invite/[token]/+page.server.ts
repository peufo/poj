import { fail, redirect } from '@sveltejs/kit';
import { auth } from '#lib/server/auth.js';
import {
	ConflictError,
	InvitationUnavailableError,
	PASSWORD_MAX_LENGTH,
	PASSWORD_MIN_LENGTH,
	type InvitationStatus
} from '#lib/server/domain/index.js';
import { invitations } from '#lib/server/web/services.js';
import type { Actions, PageServerLoad } from './$types';

const unavailable: Record<Exclude<InvitationStatus, 'valid'>, string> = {
	used: 'Ce lien d’invitation a déjà servi. Connecte-toi avec ton compte.',
	expired: 'Ce lien d’invitation a expiré. Demande un nouveau lien.',
	revoked: 'Ce lien d’invitation a été annulé. Demande un nouveau lien.',
	invalid: 'Ce lien d’invitation n’est pas valable. Vérifie qu’il est complet.'
};

export const load: PageServerLoad = async ({ params, setHeaders }) => {
	// Le jeton est dans l'URL : il ne doit pas partir dans l'en-tête Referer.
	setHeaders({ 'referrer-policy': 'no-referrer' });
	const invitation = await invitations.inspect(params.token);
	const valid = invitation.status === 'valid';
	return {
		email: valid ? invitation.email : null,
		unavailable: valid ? null : unavailable[invitation.status],
		minPasswordLength: PASSWORD_MIN_LENGTH
	};
};

export const actions: Actions = {
	default: async ({ params, request }) => {
		const form = await request.formData();
		const name = form.get('name')?.toString().trim() ?? '';
		const password = form.get('password')?.toString() ?? '';
		if (!name) return fail(400, { name, message: 'Indique ton nom.' });
		if (password.length < PASSWORD_MIN_LENGTH) {
			return fail(400, {
				name,
				message: `Mot de passe trop court : ${PASSWORD_MIN_LENGTH} caractères au moins.`
			});
		}
		if (password.length > PASSWORD_MAX_LENGTH) {
			return fail(400, { name, message: 'Mot de passe trop long.' });
		}

		let email: string;
		try {
			({ email } = await invitations.accept(params.token, { name, password }));
		} catch (error) {
			if (error instanceof InvitationUnavailableError) {
				return fail(410, { name, message: unavailable[error.reason] });
			}
			if (error instanceof ConflictError) {
				return fail(409, { name, message: 'Un compte existe déjà avec cet email.' });
			}
			throw error;
		}

		// Compte créé : on ouvre la session comme à la connexion.
		try {
			await auth.api.signInEmail({ body: { email, password }, headers: request.headers });
		} catch {
			redirect(303, '/login');
		}
		redirect(303, '/cards');
	}
};
