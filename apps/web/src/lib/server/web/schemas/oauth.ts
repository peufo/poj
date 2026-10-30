import * as z from 'zod';

// Formulaire de consentement du serveur d'autorisation OAuth (`/oauth/consent`).

/** La requête signée revient telle quelle ; `accept` vient du bouton choisi. */
export const consentSchema = z.object({
	oauth_query: z.string().min(1, 'Demande d’autorisation invalide ou expirée.'),
	accept: z
		.string()
		.optional()
		.transform((value) => value === 'true')
});
