import * as z from 'zod';
import { authErrorMessages } from '#lib/server/auth-errors.js';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '#lib/server/domain/index.js';
import { idSchema } from './fields';

// Formulaires des comptes : connexion, inscription, invitation et administration.

const email = z.string().trim().pipe(z.email(authErrorMessages.INVALID_EMAIL));

const name = z.string().trim().min(1, 'Indique ton nom.');

/** Mot de passe d'un nouveau compte, aux bornes de Better Auth (`auth-config.ts`). */
const newPassword = z
	.string()
	.min(PASSWORD_MIN_LENGTH, authErrorMessages.PASSWORD_TOO_SHORT)
	.max(PASSWORD_MAX_LENGTH, authErrorMessages.PASSWORD_TOO_LONG);

/** `/login` : les bornes ne s'appliquent pas, Better Auth juge le mot de passe. */
export const loginSchema = z.object({
	email,
	password: z.string().min(1, 'Indique ton mot de passe.')
});

/** `/register` : le premier compte. */
export const registerSchema = z.object({ name, email, password: newPassword });

/** `/invite/[token]` : l'adresse vient de l'invitation. */
export const inviteSchema = z.object({ name, password: newPassword });

/** Invitation (`/admin`) : l'adresse du testeur à inviter. */
export const invitationSchema = z.object({ email });

/** Révocation d'une invitation (`/admin`). */
export const revokeInvitationSchema = z.object({ id: idSchema });
