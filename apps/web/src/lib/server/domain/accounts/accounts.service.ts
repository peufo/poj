import type { Db } from '../db';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AccountsService = ReturnType<typeof createAccountsService>;

/** Poj n'a qu'un compte, créé au premier lancement (WEB-1). */
export function createAccountsService(db: Db) {
	return {
		async isSignUpOpen(): Promise<boolean> {
			return (await db.user.count()) === 0;
		},

		/** Vrai si l'utilisateur existe (`id` quelconque, pas forcément un UUID). */
		async exists(id: string): Promise<boolean> {
			if (!UUID.test(id)) return false;
			return (await db.user.count({ where: { id } })) > 0;
		}
	};
}
