import { APIError } from 'better-auth/api';
import type { BetterAuthOptions } from 'better-auth/minimal';
import { createAccountsService, type Db } from '#lib/server/domain/index.js';
import { SIGN_UP_CLOSED } from '#lib/server/auth-errors.js';

/**
 * Refuse toute création d'utilisateur dès qu'un compte existe, quel que soit le
 * chemin (page d'inscription ou appel direct à l'endpoint Better Auth).
 */
export function singleAccountHooks(db: Db): BetterAuthOptions['databaseHooks'] {
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
				}
			}
		}
	};
}
