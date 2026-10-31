import { describe, expect, it } from 'vitest';
import type { Db } from '../domain/index';
import { assertDisposableDatabase } from './database';
import { seedSandbox } from './seed';

const server = 'postgres://root:secret@localhost:5433';
const worktree = { root: '/repo/.claude/worktrees/t5', mainRoot: '/repo' };

describe('disposable database guard', () => {
	it('accepts the sandbox and test databases in the main checkout', () => {
		expect(() =>
			assertDisposableDatabase(`${server}/poj_sandbox`, { worktree: null })
		).not.toThrow();
		expect(() =>
			assertDisposableDatabase(`${server}/poj_test`, { devUrl: `${server}/local`, worktree: null })
		).not.toThrow();
	});

	it('accepts the worktree variants of the sandbox and test databases anywhere', () => {
		for (const name of ['poj_test_wt_agent_t5', 'poj_sandbox_wt_a1']) {
			expect(() => assertDisposableDatabase(`${server}/${name}`, { worktree })).not.toThrow();
			expect(() => assertDisposableDatabase(`${server}/${name}`, { worktree: null })).not.toThrow();
		}
	});

	it('accepts the database of an e2e run anywhere', () => {
		expect(() => assertDisposableDatabase(`${server}/poj_e2e_4242`, { worktree })).not.toThrow();
		expect(() =>
			assertDisposableDatabase(`${server}/poj_e2e_4242`, { worktree: null })
		).not.toThrow();
	});

	it('refuses the development database, however its URL is written', () => {
		const devUrl = `${server}/poj_sandbox`;
		expect(() => assertDisposableDatabase(devUrl, { devUrl })).toThrow(/development database/);
		expect(() =>
			assertDisposableDatabase('postgresql://other:pw@localhost:5433/poj_sandbox?schema=public', {
				devUrl
			})
		).toThrow(/development database/);
	});

	it('refuses any other database', () => {
		for (const name of [
			'local',
			'postgres',
			'poj',
			'poj_sandbox_old',
			'poj_test_wt_',
			'poj_test_wt_Agent',
			'poj_test_wt_a"; DROP DATABASE local; --',
			`poj_test_wt_${'a'.repeat(41)}`,
			'poj_wt_a',
			'poj_e2e_',
			'poj_e2e_12a',
			'poj_e2e_1; DROP DATABASE local'
		]) {
			expect(() => assertDisposableDatabase(`${server}/${name}`)).toThrow(/Refusing/);
		}
	});

	it('refuses, in a worktree, the databases of the main checkout', () => {
		for (const name of ['poj_test', 'poj_sandbox']) {
			expect(() => assertDisposableDatabase(`${server}/${name}`, { worktree })).toThrow(
				/worktree:setup/
			);
		}
	});

	it('makes the seed refuse a non-disposable database before touching it', async () => {
		const queries: string[] = [];
		const fake = {
			async $queryRaw(sql: TemplateStringsArray) {
				queries.push(sql.join('?'));
				return [{ name: 'local' }];
			},
			async $executeRawUnsafe(sql: string) {
				queries.push(sql);
				return 0;
			}
		} as unknown as Db;

		await expect(seedSandbox(fake)).rejects.toThrow(/Refusing to touch database "local"/);
		expect(queries).toEqual(['SELECT current_database() AS name']);
	});
});
