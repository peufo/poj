import { APIError } from 'better-auth/api';
import type { BetterAuthOptions } from 'better-auth/minimal';
import { createAccountsService, type Db } from '#lib/server/domain/index.js';
import { SIGN_UP_CLOSED } from '#lib/server/auth-errors.js';

/**
 * Inscription par Better Auth : seulement au premier lancement, et ce premier compte est
 * administrateur. Ensuite, toute création d'utilisateur par Better Auth est refusée, quel
 * que soit le chemin (page d'inscription ou appel direct à l'endpoint). Les testeurs
 * arrivent par un lien d'invitation, dont le compte est créé par le domaine
 * (`createInvitationsService`), hors de Better Auth.
 *
 * Ces `databaseHooks` ne voient donc pas ce second chemin de création de compte : un hook
 * ajouté ici doit aussi l'être dans `invitations.service` (`accept`).
 */
export function signUpHooks(db: Db): BetterAuthOptions['databaseHooks'] {
	const accounts = createAccountsService(db);
	return {
		user: {
			create: {
				async before() {
					if (!(await accounts.isSignUpOpen())) {
						throw new APIError('FORBIDDEN', {
							message: 'Les inscriptions sont fermées.',
							code: SIGN_UP_CLOSED
						});
					}
					return { data: { role: 'admin' } };
				}
			}
		}
	};
}
