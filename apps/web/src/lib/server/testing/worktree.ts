// Isolation des worktrees git (`.claude/worktrees/<nom>`) : chacun a ses propres bases
// jetables (`poj_test_wt_<slug>`, `poj_sandbox_wt_<slug>`) et ses propres ports, écrits
// dans son `.env` par `bun run worktree:setup`. Le checkout principal garde `poj_test`,
// `poj_sandbox` et les ports 5173 (dev), 5174 (bac à sable) et 4173 (preview).
//
// Sans dépendance à Prisma ni à SvelteKit : importé aussi par vite.config.ts et
// playwright.config.ts.
import { execFileSync } from 'node:child_process';
import { basename, dirname } from 'node:path';

/** Port de dev du checkout principal ; les worktrees prennent 5183, 5193… */
const MAIN_DEV_PORT = 5173;
const SLOT_STEP = 10;
const MAX_SLOT = 20;

export interface Worktree {
	root: string;
	mainRoot: string;
}

interface AppPorts {
	dev: number;
	sandbox: number;
	preview: number;
}

/** Ports dérivés de l'unique réglage `ORIGIN` : dev = son port, bac à sable +1, preview −1000. */
export function appPorts(origin: string | undefined): AppPorts {
	const dev = (origin && Number(new URL(origin).port)) || MAIN_DEV_PORT;
	return { dev, sandbox: dev + 1, preview: dev - 1000 };
}

/**
 * Comme `appPorts`, mais refuse, dans un worktree, les ports réservés au checkout
 * principal : son `.env` n'a pas été isolé.
 */
export function assertAppPorts(origin: string | undefined, worktree?: Worktree | null): AppPorts {
	const ports = appPorts(origin);
	const reserved = Object.values(appPorts(undefined));
	if (reserved.includes(ports.dev) && (worktree === undefined ? linkedWorktree() : worktree)) {
		throw new Error(
			`Port ${ports.dev} is reserved for the main checkout: run \`bun run worktree:setup\` in this worktree`
		);
	}
	return ports;
}

/**
 * Port de dev d'un worktree : `current` s'il est déjà un port de worktree libre, sinon le
 * premier emplacement que `used` (les autres worktrees) ne prend pas.
 */
export function pickDevPort(current: number | undefined, used: number[]): number {
	const slots = Array.from({ length: MAX_SLOT }, (_, i) => MAIN_DEV_PORT + SLOT_STEP * (i + 1));
	if (current !== undefined && slots.includes(current) && !used.includes(current)) return current;
	const free = slots.find((port) => !used.includes(port));
	if (free === undefined) throw new Error(`No free port: ${MAX_SLOT} worktrees already set up`);
	return free;
}

const SLUG_MAX = 40;
const WORKTREE_DATABASE = new RegExp(`^poj_(test|sandbox)_wt_[a-z0-9_]{1,${SLUG_MAX}}$`);

/** Suffixe de base d'un worktree, tiré du nom de son dossier. */
export function worktreeSlug(path: string): string {
	const slug = basename(path)
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '')
		.slice(0, SLUG_MAX);
	if (!slug) throw new Error(`Cannot derive a database suffix from "${path}"`);
	return slug;
}

export function worktreeDatabaseName(kind: 'test' | 'sandbox', slug: string): string {
	return `poj_${kind}_wt_${slug}`;
}

/** Vrai pour une base de worktree (`worktreeDatabaseName`). */
export function isWorktreeDatabase(name: string): boolean {
	return WORKTREE_DATABASE.test(name);
}

function git(args: string[], cwd: string): string {
	return execFileSync('git', args, {
		cwd,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'ignore']
	}).trim();
}

const linkedWorktrees = new Map<string, Worktree | null>();

/**
 * Le worktree lié qui contient `cwd` (racine et racine du checkout principal), ou `null`
 * dans le checkout principal ou hors de git (image Docker). Mémorisé par processus.
 */
export function linkedWorktree(cwd = process.cwd()): Worktree | null {
	if (!linkedWorktrees.has(cwd)) linkedWorktrees.set(cwd, findLinkedWorktree(cwd));
	return linkedWorktrees.get(cwd)!;
}

function findLinkedWorktree(cwd: string): Worktree | null {
	try {
		const [root, gitDir, commonDir] = git(
			['rev-parse', '--path-format=absolute', '--show-toplevel', '--git-dir', '--git-common-dir'],
			cwd
		).split('\n');
		return gitDir === commonDir ? null : { root, mainRoot: dirname(commonDir) };
	} catch {
		return null;
	}
}

/** Racines de tous les worktrees du dépôt, checkout principal en tête. */
export function listWorktrees(cwd = process.cwd()): string[] {
	return git(['worktree', 'list', '--porcelain'], cwd)
		.split('\n')
		.filter((line) => line.startsWith('worktree '))
		.map((line) => line.slice('worktree '.length));
}

/** Remplace (ou ajoute à la fin) les clés `values` d'un fichier `.env`, sans toucher au reste. */
export function setEnvValues(content: string, values: Record<string, string>): string {
	let result = content;
	for (const [key, value] of Object.entries(values)) {
		const line = `${key}="${value}"`;
		const pattern = new RegExp(`^${key}=.*$`, 'm');
		result = pattern.test(result)
			? result.replace(pattern, () => line)
			: `${result.replace(/\n*$/, '')}\n${line}\n`;
	}
	return result;
}

/** Même URL de connexion, autre base. */
export function withDatabase(url: string, name: string): string {
	const u = new URL(url);
	u.pathname = `/${name}`;
	return u.toString();
}
