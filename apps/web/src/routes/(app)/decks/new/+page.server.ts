import { NEW_DECK_VALUES } from '#lib/format/decks.js';
import type { PageServerLoad } from './$types';

// Création d'un deck. C'est aussi l'accueil d'un nouveau compte : sans deck, les pages qui
// en ont besoin renvoient ici.
export const load: PageServerLoad = async ({ parent }) => ({
	values: NEW_DECK_VALUES,
	firstDeck: (await parent()).nav.decks.length === 0
});
