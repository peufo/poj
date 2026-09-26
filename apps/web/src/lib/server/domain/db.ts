// Type-only : le domaine dépend du client Prisma généré, jamais de l'instance
// (fournie par l'appelant), ni de SvelteKit ou de Hono.
import type { PrismaClient } from '../db/generated/prisma/client';

export type Db = PrismaClient;
