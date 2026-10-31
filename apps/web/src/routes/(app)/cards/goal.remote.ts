import { form, getRequestEvent } from '$app/server';
import { ownerOf } from '#lib/server/web/guards.js';
import { dailyGoalSchema } from '#lib/server/web/schemas/cards.js';
import { dailyGoal } from '#lib/server/web/services.js';

/** Objectif de cartes à ajouter par jour, dès aujourd'hui. */
export const setGoal = form(dailyGoalSchema, async ({ goal }) => {
	await dailyGoal.setGoal(ownerOf(getRequestEvent()), goal);
	return { saved: true } as const;
});
