import { error } from '@sveltejs/kit';
import { findCard } from '#lib/lab/fixtures.js';
import type { PageLoad } from './$types';

export const load: PageLoad = ({ params }) => {
	const card = findCard(params.id);
	if (!card) error(404, 'Carte introuvable');
	return { card };
};
