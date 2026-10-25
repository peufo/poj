import { afterAll, beforeEach, inject } from 'vitest';
import type { Db } from '../domain/index';
import { createPrismaClient, resetDatabase } from './database';

/**
 * Client Prisma vers la base de test (`inject('databaseUrl')`), vidée avant chaque test
 * du fichier (sauf `reset: false`) et fermé à la fin. À appeler au niveau du module,
 * avant les autres hooks.
 */
export function useTestDatabase({ reset = true }: { reset?: boolean } = {}): Db {
	const db = createPrismaClient(inject('databaseUrl'));
	if (reset) beforeEach(() => resetDatabase(db));
	afterAll(() => db.$disconnect());
	return db;
}
