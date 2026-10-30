import { fail } from '@sveltejs/kit';

// Côté serveur de `DeleteConfirm.svelte` : l'action `?/delete` ne supprime que si le
// formulaire porte `confirm=1`. Sinon (envoi sans JavaScript), elle renvoie de quoi
// afficher la confirmation en ligne.

/** Échec à renvoyer tel quel si la suppression n'est pas confirmée, sinon `null`. */
export function unconfirmedDelete(form: FormData) {
	return form.get('confirm') === '1' ? null : fail(400, { confirmDelete: true });
}
