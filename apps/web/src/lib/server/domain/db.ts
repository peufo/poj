// Type-only : le domaine dépend du client Prisma généré, jamais de l'instance
// (fournie par l'appelant), ni de SvelteKit ou de Hono.
import type { Prisma, PrismaClient } from '../db/generated/prisma/client';

export type Db = PrismaClient;

/** Client d'une transaction interactive (`db.$transaction(async (tx) => …)`). */
export type Tx = Prisma.TransactionClient;
