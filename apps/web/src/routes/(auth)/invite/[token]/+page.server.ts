import { invitationUnavailableMessages } from '#lib/server/auth-errors.js';
import { PASSWORD_MIN_LENGTH } from '#lib/server/domain/index.js';
import { invitations } from '#lib/server/web/services.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, setHeaders }) => {
	// Le jeton est dans l'URL : il ne doit pas partir dans l'en-tête Referer.
	setHeaders({ 'referrer-policy': 'no-referrer' });
	const invitation = await invitations.inspect(params.token);
	const valid = invitation.status === 'valid';
	return {
		email: valid ? invitation.email : null,
		unavailable: valid ? null : invitationUnavailableMessages[invitation.status],
		minPasswordLength: PASSWORD_MIN_LENGTH
	};
};
