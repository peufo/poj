// Base jetable des tests e2e Playwright : `poj_e2e_<pid>`, créée au lancement par la
// commande du serveur de preview (`scripts/e2e.ts prepare`) et supprimée à la fin
// (`e2e/global-teardown.ts`). Le pid est celui du lanceur Playwright : chaque lancement a
// sa base, et `worktree:prune` supprime celles d'un lancement interrompu (pid disparu).
//
// Sans dépendance à Prisma : importé aussi par playwright.config.ts.

const E2E_DATABASE = /^poj_e2e_(\d{1,10})$/;

export function e2eDatabaseName(pid: number): string {
	return `poj_e2e_${pid}`;
}

/** Pid du lanceur d'une base e2e, ou `null` si `name` n'en est pas une. */
export function e2eDatabasePid(name: string): number | null {
	const match = E2E_DATABASE.exec(name);
	return match ? Number(match[1]) : null;
}

/** Vrai si le processus `pid` tourne encore (sur cette machine). */
export function isProcessAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		// EPERM : le processus existe, mais appartient à un autre utilisateur.
		return (error as NodeJS.ErrnoException).code === 'EPERM';
	}
}
