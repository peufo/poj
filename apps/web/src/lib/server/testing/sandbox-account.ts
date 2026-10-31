// Compte créé par la seed du bac à sable (`seed.ts`). Sans dépendance : importé aussi par
// les specs e2e Playwright, dont la base est chargée avec cette seed.
export const SANDBOX_ACCOUNT = {
	name: 'Sandbox',
	email: 'sandbox@poj.local',
	password: 'sandbox-poj'
} as const;
