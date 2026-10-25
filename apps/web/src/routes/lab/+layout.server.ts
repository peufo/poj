import { error } from '@sveltejs/kit';
import { dev } from '$app/env';
import type { LayoutServerLoad } from './$types';

// Le lab (matériel et maquettes) n'existe qu'en développement.
export const load: LayoutServerLoad = () => {
	if (!dev) error(404, 'Not Found');
};
