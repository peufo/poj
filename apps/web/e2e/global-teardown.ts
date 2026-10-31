import { execFileSync } from 'node:child_process';

/** Supprime la base jetable du lancement (`E2E_DATABASE_URL`, fixée par playwright.config.ts). */
export default function teardown() {
	execFileSync('bun', ['scripts/e2e.ts', 'drop'], {
		cwd: new URL('..', import.meta.url),
		stdio: 'inherit'
	});
}
