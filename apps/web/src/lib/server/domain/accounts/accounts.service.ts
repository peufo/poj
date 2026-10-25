import type { Db } from '../db';

export type AccountsService = ReturnType<typeof createAccountsService>;

/** Poj n'a qu'un compte, créé au premier lancement (WEB-1). */
export function createAccountsService(db: Db) {
	return {
		async isSignUpOpen(): Promise<boolean> {
			return (await db.user.count()) === 0;
		}
	};
}
