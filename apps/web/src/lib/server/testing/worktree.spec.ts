import { parse } from 'dotenv';
import { describe, expect, it } from 'vitest';
import {
	appPorts,
	assertAppPorts,
	pickDevPort,
	setEnvValues,
	withDatabase,
	worktreeDatabaseName,
	worktreeSlug
} from './worktree';

const worktree = { root: '/repo/.claude/worktrees/t5', mainRoot: '/repo' };

describe('worktree isolation', () => {
	it('derives the sandbox and preview ports from ORIGIN, defaulting to the main ones', () => {
		expect(appPorts(undefined)).toEqual({ dev: 5173, sandbox: 5174, preview: 4173 });
		expect(appPorts('http://localhost:5173')).toEqual({ dev: 5173, sandbox: 5174, preview: 4173 });
		expect(appPorts('http://localhost:5183')).toEqual({ dev: 5183, sandbox: 5184, preview: 4183 });
	});

	it('keeps the ports of the main checkout out of reach of worktrees', () => {
		for (const origin of [undefined, 'http://localhost:5173', 'http://localhost:5174']) {
			expect(() => assertAppPorts(origin, worktree)).toThrow(/worktree:setup/);
			expect(() => assertAppPorts(origin, null)).not.toThrow();
		}
		expect(assertAppPorts('http://localhost:5193', worktree).dev).toBe(5193);
	});

	it('gives each worktree a dev port no other worktree uses', () => {
		expect(pickDevPort(undefined, [5173])).toBe(5183);
		expect(pickDevPort(5173, [5183, 5193])).toBe(5203);
		expect(pickDevPort(5193, [5183])).toBe(5193);
		expect(pickDevPort(5193, [5193])).toBe(5183);
		expect(pickDevPort(5187, [])).toBe(5183);
		const all = Array.from({ length: 20 }, (_, i) => 5183 + 10 * i);
		expect(() => pickDevPort(undefined, all)).toThrow(/No free port/);
	});

	it('names the databases after the worktree folder', () => {
		const slug = worktreeSlug('/repo/.claude/worktrees/agent-t5-MCP.choix--deck/');
		expect(slug).toBe('agent_t5_mcp_choix_deck');
		expect(worktreeDatabaseName('test', slug)).toBe('poj_test_wt_agent_t5_mcp_choix_deck');
		expect(worktreeSlug(`/w/${'x'.repeat(60)}`)).toHaveLength(40);
		expect(() => worktreeSlug('/w/---')).toThrow();
		expect(
			withDatabase('postgres://u:p@localhost:5433/poj_test?schema=public', 'poj_test_wt_a')
		).toBe('postgres://u:p@localhost:5433/poj_test_wt_a?schema=public');
	});

	it('rewrites only the given keys of a .env file', () => {
		const content = '# comment\nORIGIN="http://localhost:5173"\nSECRET="s=1"\n';
		const result = setEnvValues(content, {
			ORIGIN: 'http://localhost:5183',
			DATABASE_URL_TEST: 'postgres://h/poj_test_wt_a'
		});
		expect(result).toBe(
			'# comment\nORIGIN="http://localhost:5183"\nSECRET="s=1"\nDATABASE_URL_TEST="postgres://h/poj_test_wt_a"\n'
		);
		expect(parse(result)).toEqual({
			ORIGIN: 'http://localhost:5183',
			SECRET: 's=1',
			DATABASE_URL_TEST: 'postgres://h/poj_test_wt_a'
		});
	});
});
