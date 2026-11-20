import { describe, expect, it } from 'vitest';
import { useTestDatabase } from '../../testing/db';
import { createCard, createUser } from '../../testing/factories';
import { createCardsService } from '../cards/cards.service';
import { createAccountsService } from './accounts.service';

const db = useTestDatabase();
const accounts = createAccountsService(db);

describe('accounts.list', () => {
	it('counts the cards each account created, without the deleted ones', async () => {
		const jonas = await createUser(db, 'Jonas', { role: 'admin' });
		const lea = await createUser(db, 'Lea');
		await createCard(db, jonas);
		const deleted = await createCard(db, jonas);
		await createCardsService(db).softDelete(jonas, deleted.id);
		await createCard(db, lea);
		await createCard(db, lea);

		expect(await accounts.list()).toMatchObject([
			{ id: jonas, cardCount: 1 },
			{ id: lea, cardCount: 2 }
		]);
	});
});
