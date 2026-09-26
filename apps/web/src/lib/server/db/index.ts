import { PrismaPg } from '@prisma/adapter-pg';
import { DATABASE_URL } from '$app/env/private';
import type { Db } from '#lib/server/domain/index.js';
import { PrismaClient } from './generated/prisma/client';

if (!DATABASE_URL) throw new Error('DATABASE_URL is not set');

export function createDb(connectionString: string): Db {
	return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

// Réutilise l'instance entre les rechargements HMR en dev pour ne pas ouvrir
// un nouveau pool de connexions à chaque modification.
const globalForDb = globalThis as unknown as { db?: Db };

export const db = globalForDb.db ?? createDb(DATABASE_URL);

if (process.env.NODE_ENV !== 'production') globalForDb.db = db;
