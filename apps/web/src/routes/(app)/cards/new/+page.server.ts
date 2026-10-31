import { deckInScope } from '#lib/server/web/guards.js';
import type { PageServerLoad } from './$types';

// La carte va dans le deck choisi : celui de `?deck=`, le seul deck, ou un choix explicite
// dans la liste. Ses faces nomment les champs du formulaire.
export const load: PageServerLoad = async ({ url, parent }) => {
	const { deck, explicit } = deckInScope(url, (await parent()).nav.decks);
	// Retour vers le deck d'où l'on vient, sinon vers toutes les cartes.
	const from = explicit ? deck : null;
	return {
		selectedDeck: deck?.id ?? null,
		back: from ? { href: `/cards?deck=${from.id}`, label: from.name } : null
	};
};
