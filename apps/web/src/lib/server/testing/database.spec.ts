import { describe, expect, it } from 'vitest';
import type { Db } from '../domain/index';
import { assertDisposableDatabase } from './database';
import { seedSandbox } from './seed';

const server = 'postgres://root:secret@localhost:5433';

describe('disposable database guard', () => {
	it('accepts the sandbox and test databases', () => {
		expect(() => assertDisposableDatabase(`${server}/poj_sandbox`)).not.toThrow();
		expect(() =>
			assertDisposableDatabase(`${server}/poj_test`, { devUrl: `${server}/local` })
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
		for (const name of ['local', 'postgres', 'poj', 'poj_sandbox_old']) {
			expect(() => assertDisposableDatabase(`${server}/${name}`)).toThrow(/Refusing/);
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
