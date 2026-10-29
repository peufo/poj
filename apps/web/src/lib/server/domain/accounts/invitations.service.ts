import type { Db } from '../db';
import { ConflictError, DomainError } from '../errors';

/** Durée de validité d'un lien d'invitation. */
export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Bornes du mot de passe, celles de Better Auth (`minPasswordLength`, `maxPasswordLength`). */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export type InvitationStatus = 'valid' | 'used' | 'expired' | 'revoked' | 'invalid';
type Unavailable = Exclude<InvitationStatus, 'valid'>;

/** Le lien ne permet pas (ou plus) de créer un compte. */
export class InvitationUnavailableError extends DomainError {
	constructor(readonly reason: Unavailable) {
		super(`Invitation ${reason}`);
	}
}

export type InvitationsService = ReturnType<typeof createInvitationsService>;

/** 32 octets aléatoires en base64url : 43 caractères. */
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

function newToken(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(32));
	return btoa(String.fromCharCode(...bytes))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '');
}

/** Seul ce condensat est stocké : une fuite de la base ne livre aucun lien utilisable. */
async function hashToken(token: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
	return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const pending = (now: Date) => ({ acceptedAt: null, deletedAt: null, expiresAt: { gt: now } });

/** Pourquoi une invitation existante ne sert plus, ou `null` si elle est utilisable. */
function unavailableReason(
	invitation: { acceptedAt: Date | null; deletedAt: Date | null; expiresAt: Date },
	now: Date
): Unavailable | null {
	if (invitation.acceptedAt) return 'used';
	if (invitation.deletedAt) return 'revoked';
	if (invitation.expiresAt <= now) return 'expired';
	return null;
}

async function assertNoAccount(db: Pick<Db, 'user'>, email: string) {
	if (await db.user.count({ where: { email } })) {
		throw new ConflictError(`An account already exists for ${email}`);
	}
}

/**
 * Comptes testeurs : un administrateur génère un lien d'invitation à usage unique pour une
 * adresse, le transmet lui-même, et le testeur y choisit son nom et son mot de passe. Le
 * compte est créé ici, hors de Better Auth (dont l'inscription reste fermée), avec un
 * compte `credential` identique à celui de l'inscription par email.
 *
 * `hashPassword` : celui de Better Auth (`better-auth/crypto`), pour que la connexion par
 * email et mot de passe fonctionne ensuite.
 */
export function createInvitationsService(
	db: Db,
	hashPassword: (password: string) => Promise<string>
) {
	async function find(token: string) {
		if (!TOKEN.test(token)) return null;
		return db.invitation.findUnique({ where: { tokenHash: await hashToken(token) } });
	}

	return {
		/**
		 * Invitation pour `email`, valable `INVITATION_TTL_MS`. Remplace (révoque) les
		 * invitations en attente pour la même adresse. Renvoie le jeton en clair, qui ne
		 * pourra plus être relu.
		 */
		async create(invitedById: string, email: string, now = new Date()) {
			const address = normalizeEmail(email);
			await assertNoAccount(db, address);
			const token = newToken();
			const tokenHash = await hashToken(token);
			const invitation = await db.$transaction(async (tx) => {
				await tx.invitation.updateMany({
					where: { email: address, ...pending(now) },
					data: { deletedAt: now }
				});
				return tx.invitation.create({
					data: {
						email: address,
						tokenHash,
						invitedById,
						expiresAt: new Date(now.getTime() + INVITATION_TTL_MS)
					}
				});
			});
			return { invitation, token };
		},

		/** Invitations ni utilisées, ni révoquées, ni expirées, les plus récentes d'abord. */
		listPending(now = new Date()) {
			return db.invitation.findMany({
				where: pending(now),
				select: { id: true, email: true, createdAt: true, expiresAt: true },
				orderBy: { createdAt: 'desc' }
			});
		},

		/** Révoque une invitation en attente. Sans effet si elle n'existe pas ou plus. */
		async revoke(id: string, now = new Date()) {
			await db.invitation.updateMany({
				where: { id, acceptedAt: null, deletedAt: null },
				data: { deletedAt: now }
			});
		},

		/** État du lien, et l'adresse du futur compte s'il est utilisable. */
		async inspect(
			token: string,
			now = new Date()
		): Promise<{ status: 'valid'; email: string } | { status: Unavailable }> {
			const invitation = await find(token);
			if (!invitation) return { status: 'invalid' };
			const reason = unavailableReason(invitation, now);
			return reason ? { status: reason } : { status: 'valid', email: invitation.email };
		},

		/**
		 * Crée le compte de l'invitation et la consomme, en une transaction : un lien ne sert
		 * qu'une fois, même utilisé deux fois en même temps. Si la création échoue, le lien
		 * reste valable.
		 */
		async accept(
			token: string,
			{ name, password }: { name: string; password: string },
			now = new Date()
		): Promise<{ userId: string; email: string }> {
			const displayName = name.trim();
			if (!displayName) throw new RangeError('Name is required');
			if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
				throw new RangeError('Password length out of bounds');
			}
			const invitation = await find(token);
			if (!invitation) throw new InvitationUnavailableError('invalid');
			const reason = unavailableReason(invitation, now);
			if (reason) throw new InvitationUnavailableError(reason);
			const passwordHash = await hashPassword(password);

			return db.$transaction(async (tx) => {
				// Seule la première consommation passe : une seconde, concurrente, attend le
				// verrou de la ligne puis ne la trouve plus en attente.
				const { count } = await tx.invitation.updateMany({
					where: { id: invitation.id, ...pending(now) },
					data: { acceptedAt: now }
				});
				if (count === 0) {
					const current = await tx.invitation.findUniqueOrThrow({ where: { id: invitation.id } });
					throw new InvitationUnavailableError(unavailableReason(current, now) ?? 'used');
				}
				const { email } = invitation;
				await assertNoAccount(tx, email);
				const user = await tx.user.create({ data: { name: displayName, email } });
				await tx.account.create({
					data: {
						userId: user.id,
						accountId: user.id,
						providerId: 'credential',
						password: passwordHash
					}
				});
				return { userId: user.id, email };
			});
		}
	};
}
