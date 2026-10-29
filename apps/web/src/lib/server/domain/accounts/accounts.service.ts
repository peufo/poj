import type { Db } from '../db';

export type { UserRole } from '../../db/generated/prisma/client';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AccountsService = ReturnType<typeof createAccountsService>;

/**
 * Comptes de Poj : le premier, créé au premier lancement (WEB-1), est administrateur ;
 * les suivants arrivent par un lien d'invitation (`createInvitationsService`).
 */
export function createAccountsService(db: Db) {
	return {
		/** Vrai tant qu'aucun compte n'existe : seule l'inscription du premier est ouverte. */
		async isSignUpOpen(): Promise<boolean> {
			return (await db.user.count()) === 0;
		},

		/** Tous les comptes, du plus ancien au plus récent (page d'administration). */
		list() {
			return db.user.findMany({
				select: { id: true, name: true, email: true, role: true, createdAt: true },
				orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]
			});
		},

		/** Vrai si l'utilisateur existe (`id` quelconque, pas forcément un UUID). */
		async exists(id: string): Promise<boolean> {
			if (!UUID.test(id)) return false;
			return (await db.user.count({ where: { id } })) > 0;
		}
	};
}
