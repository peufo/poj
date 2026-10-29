import { ORIGIN } from '$app/env/private';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => ({ connectorUrl: `${ORIGIN}/mcp` });
