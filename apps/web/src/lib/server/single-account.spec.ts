import { PrismaPg } from '@prisma/adapter-pg';
import { betterAuth } from 'better-auth/minimal';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { afterAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { PrismaClient } from './db/generated/prisma/client';
import { createAccountsService } from './domain/index.js';
import { singleAccountHooks } from './single-account';

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: inject('databaseUrl') }) });

// Instance minimale, avec les mêmes hooks que l'app (auth.ts dépend de SvelteKit).
const auth = betterAuth({
	baseURL: 'http://localhost:5173',
	secret: 'test-secret-test-secret-test-secret',
	database: prismaAdapter(db, { provider: 'postgresql' }),
	emailAndPassword: { enabled: true },
	advanced: { database: { generateId: 'uuid' } },
	databaseHooks: singleAccountHooks(db)
});

const signUp = (email: string) =>
	auth.api.signUpEmail({ body: { name: 'Jonas', email, password: 'motdepasse123' } });

beforeEach(async () => {
	await db.$executeRaw`TRUNCATE users CASCADE`;
});

afterAll(() => db.$disconnect());

describe('single account', () => {
	it('opens sign-up only while no account exists', async () => {
		const accounts = createAccountsService(db);
		expect(await accounts.isSignUpOpen()).toBe(true);

		await signUp('jonas@test.dev');

		expect(await accounts.isSignUpOpen()).toBe(false);
	});

	it('refuses a second sign-up through the Better Auth endpoint', async () => {
		await signUp('jonas@test.dev');

		await expect(signUp('intrus@test.dev')).rejects.toMatchObject({ status: 'FORBIDDEN' });
		expect(await db.user.count()).toBe(1);
	});
});
