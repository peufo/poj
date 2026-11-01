import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { InMemoryTransport, type CallToolResult } from '@modelcontextprotocol/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { useTestDatabase } from '../testing/db';
import { createDeck, createUser } from '../testing/factories';
import {
	CARD_LIMITS,
	createCardsService,
	createDecksService,
	createReviewsService,
	createTranslationService,
	TranslatorError,
	type Translator
} from '../domain/index';
import { createMcpRequestHandler } from './handler';
import { createPojMcpServer } from './server';

const db = useTestDatabase();
const cards = createCardsService(db);
const reviews = createReviewsService(db);
const decks = createDecksService(db);

const t0 = new Date('2026-01-05T08:00:00Z');
const at = (minutes: number) => new Date(t0.getTime() + minutes * 60_000);
const HOUR = 60;
const DAY = 24 * HOUR;

/** Faux DeepL : renvoie une traduction fixe par langue cible. */
const echo: Translator = {
	async translate({ to }) {
		return to === 'en-GB' ? 'to take for granted' : 'tenir pour acquis';
	}
};

const card = { sideA: 'tenir pour acquis', sideB: 'to take for granted' };
/** La même carte, telle que Claude la passe aux outils. */
const args = { side_a: card.sideA, side_b: card.sideB };

/** Deck de sujet à sens unique. */
const capitals = {
	name: 'Capitales',
	kind: 'subject',
	languageA: null,
	languageB: null,
	labelA: 'Pays',
	labelB: 'Capitale',
	bothDirections: false
} as const;

let alice: string;
let bob: string;
/** Deck français → anglais de chacun, celui des cartes capturées. */
let aliceDeck: string;
let bobDeck: string;
let clock: Date;

beforeEach(async () => {
	alice = await createUser(db, 'Alice');
	bob = await createUser(db, 'Bob');
	aliceDeck = (await createDeck(db, alice)).id;
	bobDeck = (await createDeck(db, bob)).id;
	clock = t0;
});

const deps = (translator: Translator | null = echo) => ({
	cards,
	decks,
	reviews,
	translation: createTranslationService(translator),
	now: () => clock
});

/** Client MCP relié en mémoire à un serveur Poj pour ce propriétaire et ses decks. */
async function connect(ownerId: string, translator?: Translator | null) {
	const server = createPojMcpServer({
		...deps(translator),
		ownerId,
		decks: await decks.list(ownerId),
		newDeckUrl: 'https://poj.test/decks/new'
	});
	const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
	await server.connect(serverSide);
	const client = new Client({ name: 'test', version: '1.0.0' });
	await client.connect(clientSide);
	return client;
}

async function call(client: Client, name: string, args: Record<string, unknown> = {}) {
	return (await client.callTool({ name, arguments: args })) as CallToolResult;
}

/** Contenu structuré d'un résultat réussi. */
function data(result: CallToolResult) {
	expect(result.isError).toBeFalsy();
	return result.structuredContent as Record<string, unknown>;
}

const text = (result: CallToolResult) =>
	result.content.map((c) => (c.type === 'text' ? c.text : '')).join('\n');

describe('MCP server', () => {
	it('exposes the seven tools, with read-only hints and instructions', async () => {
		const client = await connect(alice);
		const { tools } = await client.listTools();

		expect(tools.map((t) => t.name).sort()).toEqual([
			'amend_review',
			'check_card',
			'create_card',
			'get_hint',
			'list_decks',
			'next_review',
			'submit_review'
		]);
		const readOnly = tools.filter((t) => t.annotations?.readOnlyHint).map((t) => t.name);
		expect(readOnly.sort()).toEqual(['check_card', 'list_decks', 'next_review']);
		expect(client.getInstructions()).toContain('easy');
	});

	describe('capture', () => {
		it('checks then creates a card, without duplicate on replay', async () => {
			const client = await connect(alice);

			const check = await call(client, 'check_card', { ...args, context: 'réunion' });
			expect(data(check)).toEqual({
				deck: 'Anglais',
				deepl_a_to_b: 'to take for granted',
				deepl_b_to_a: 'tenir pour acquis',
				duplicates: []
			});
			expect(text(check)).toContain('DeepL, français vers anglais');

			const created = data(await call(client, 'create_card', { ...args, context: 'réunion' }));
			expect(created).toMatchObject({
				...args,
				context: 'réunion',
				created: true,
				deck: 'Anglais'
			});

			clock = at(2);
			const replay = await call(client, 'create_card', { ...args, context: 'réunion' });
			expect(data(replay)).toEqual({ ...created, created: false });
			expect(text(replay)).toContain('déjà créée');
			expect(await db.card.count()).toBe(1);
			expect(await db.card.findFirst()).toMatchObject({ origin: 'claude' });
		});

		it('reports existing cards with the same side B', async () => {
			const existing = await cards.create(
				alice,
				aliceDeck,
				{ ...card, context: 'podcast' },
				'web',
				t0
			);
			await cards.create(bob, bobDeck, card, 'web', t0);
			const client = await connect(alice);

			const result = await call(client, 'check_card', {
				side_a: 'considérer comme acquis',
				side_b: ' To take for GRANTED '
			});
			expect(data(result).duplicates).toEqual([
				{ card_id: existing.id, ...args, context: 'podcast' }
			]);
			expect(text(result)).toContain('Doublon');
		});

		it('reports a DeepL failure instead of failing', async () => {
			const quota: Translator = {
				async translate() {
					throw new TranslatorError('quota', 'Quota exceeded');
				}
			};

			const result = await call(await connect(alice, quota), 'check_card', args);
			expect(data(result)).toEqual({
				deck: 'Anglais',
				deepl_a_to_b: null,
				deepl_b_to_a: null,
				deepl_error: 'le quota DeepL est épuisé',
				duplicates: []
			});

			const unconfigured = await call(await connect(alice, null), 'check_card', args);
			expect(data(unconfigured).deepl_error).toBe("DeepL n'est pas configuré");
		});

		it('names the faces after the languages of the deck', async () => {
			const client = await connect(alice);
			const { tools } = await client.listTools();
			const check = tools.find((t) => t.name === 'check_card')!;

			expect(client.getInstructions()).toContain('expressions en anglais');
			expect(client.getInstructions()).toContain('le français (side_a), l’anglais (side_b)');
			expect(check.inputSchema.properties).toMatchObject({
				side_a: { description: 'Texte en français de la carte.' },
				side_b: { description: 'Texte en anglais de la carte (mot ou phrase entière).' }
			});
			expect(check.description).toContain('avec cet anglais');
		});

		it('gives no DeepL second opinion for a subject deck, but still finds duplicates', async () => {
			const carol = await createUser(db, 'Carol');
			const deck = await createDeck(db, carol, capitals);
			const translator: Translator = {
				async translate() {
					throw new Error('DeepL must not be called for a subject deck');
				}
			};
			await db.card.create({
				data: { ownerId: carol, deckId: deck.id, sideA: 'Suisse', sideB: 'Berne', origin: 'web' }
			});
			const client = await connect(carol, translator);
			const { tools } = await client.listTools();

			expect(client.getInstructions()).toContain('« Pays » (side_a), « Capitale » (side_b)');
			expect(client.getInstructions()).toContain('pas de second avis DeepL');
			expect(client.getInstructions()).toContain('de « Pays » vers « Capitale » seulement');
			expect(tools.find((t) => t.name === 'create_card')!.description).toContain(
				'sa révision, due immédiatement'
			);

			const result = await call(client, 'check_card', { side_a: ' suisse ', side_b: 'Zurich' });
			expect(data(result)).toMatchObject({ deepl_a_to_b: null, deepl_b_to_a: null });
			expect(data(result)).not.toHaveProperty('deepl_error');
			expect(data(result).duplicates).toHaveLength(1);
			expect(text(result)).toContain('Pas de second avis DeepL');
		});

		it('refuses faces and context longer than the web limits', async () => {
			const client = await connect(alice);
			const cases = [
				{ field: 'side_a', value: 'a'.repeat(CARD_LIMITS.sideA + 1), max: CARD_LIMITS.sideA },
				{ field: 'side_b', value: 'b'.repeat(CARD_LIMITS.sideB + 1), max: CARD_LIMITS.sideB },
				{ field: 'context', value: 'c'.repeat(CARD_LIMITS.context + 1), max: CARD_LIMITS.context }
			];
			for (const tool of ['check_card', 'create_card']) {
				for (const { field, value, max } of cases) {
					const result = await call(client, tool, { ...args, [field]: value });
					expect(result.isError).toBe(true);
					expect(text(result)).toContain(`${max} caractères au plus`);
				}
			}
			expect(await db.card.count({ where: { ownerId: alice } })).toBe(0);

			const atLimit = { ...args, side_a: 'a'.repeat(CARD_LIMITS.sideA) };
			expect(data(await call(client, 'create_card', atLimit))).toMatchObject({ created: true });
		});

		it('refuses to capture without any deck, pointing to the deck creation page', async () => {
			const carol = await createUser(db, 'Carol');
			const client = await connect(carol);

			expect(client.getInstructions()).toContain('https://poj.test/decks/new');
			for (const tool of ['check_card', 'create_card']) {
				const result = await call(client, tool, args);
				expect(result.isError).toBe(true);
				expect(text(result)).toContain('aucun deck');
				expect(text(result)).toContain('https://poj.test/decks/new');
			}
			expect(await db.card.count({ where: { ownerId: carol } })).toBe(0);
			expect(await db.deck.count({ where: { ownerId: carol } })).toBe(0);
		});

		it('links to the deck creation page of the site serving the request', async () => {
			const carol = await createUser(db, 'Carol');
			const handle = createMcpRequestHandler(deps());
			const transport = new StreamableHTTPClientTransport(new URL('http://poj.test/mcp'), {
				fetch: (input, init) => handle(new Request(input, init), carol)
			});
			const client = new Client({ name: 'test', version: '1.0.0' });
			await client.connect(transport);

			const result = await call(client, 'create_card', args);
			expect(text(result)).toContain('http://poj.test/decks/new');
			await client.close();
		});
	});

	describe('deck choice', () => {
		/** Alice a deux decks : le français → anglais (le plus ancien) et les capitales. */
		let capitalsDeck: string;
		beforeEach(async () => {
			capitalsDeck = (await createDeck(db, alice, capitals)).id;
		});

		const neverTranslate: Translator = {
			async translate() {
				throw new Error('DeepL must not be called for a subject deck');
			}
		};

		it('lists the decks with their kind, faces and card count, deleted decks excluded', async () => {
			await cards.create(alice, aliceDeck, card, 'web', t0);
			await createDeck(db, alice, { name: 'Allemand', deletedAt: t0 });
			const result = await call(await connect(alice), 'list_decks');

			expect(data(result).decks).toEqual([
				{
					name: 'Anglais',
					kind: 'language',
					side_a: 'Français',
					side_b: 'Anglais',
					language_a: 'fr',
					language_b: 'en-GB',
					both_directions: true,
					card_count: 1
				},
				{
					name: 'Capitales',
					kind: 'subject',
					side_a: 'Pays',
					side_b: 'Capitale',
					language_a: null,
					language_b: null,
					both_directions: false,
					card_count: 0
				}
			]);
			expect(text(result)).toBe(
				[
					'« Anglais » : langue, Français → anglais (deux sens), 1 carte.',
					'« Capitales » : sujet, Pays → Capitale, 0 carte.'
				].join('\n')
			);
		});

		it('lists no deck, pointing to the deck creation page', async () => {
			const carol = await createUser(db, 'Carol');
			const result = await call(await connect(carol), 'list_decks');
			expect(data(result)).toEqual({ decks: [] });
			expect(text(result)).toContain('https://poj.test/decks/new');
		});

		it('tells Claude to deduce the deck or ask, DeepL for a language deck only', async () => {
			const client = await connect(alice);
			const instructions = client.getInstructions()!;

			expect(instructions).toContain(
				'- « Anglais » (langue) : le français (side_a), l’anglais (side_b), révisé dans les deux sens.'
			);
			expect(instructions).toContain(
				'- « Capitales » (sujet) : « Pays » (side_a), « Capitale » (side_b), révisé de « Pays » vers « Capitale » seulement.'
			);
			expect(instructions).toContain('déduis le deck de chaque carte');
			expect(instructions).toContain('En cas de doute, demande-le-lui');
			expect(instructions).toContain('Deck de langue : si DeepL diverge');
			expect(instructions).toContain('Deck de sujet : pas de second avis DeepL');
			expect(instructions).toContain('Relis-lui toujours la carte finale, avec son deck');
			expect(instructions).toContain('« on révise » mélange tous les decks');

			const { tools } = await client.listTools();
			const check = tools.find((t) => t.name === 'check_card')!;
			const create = tools.find((t) => t.name === 'create_card')!;
			expect(check.annotations?.openWorldHint).toBe(true);
			expect(check.description).toContain('Deck de sujet : pas de second avis DeepL');
			expect(create.description).toContain('relis-lui la carte finale (deck, faces, contexte)');
			expect(check.inputSchema.properties).toMatchObject({
				side_a: { description: expect.stringContaining('Face A de la carte, selon le deck') },
				deck: {
					description: expect.stringContaining(
						'« Capitales » : « Pays » (side_a), « Capitale » (side_b)'
					)
				}
			});
			expect(check.inputSchema.required).not.toContain('deck');
		});

		it('refuses to capture without a deck when there are several, naming them', async () => {
			const client = await connect(alice);
			for (const tool of ['check_card', 'create_card']) {
				const result = await call(client, tool, args);
				expect(result.isError).toBe(true);
				expect(text(result)).toContain('plusieurs decks (« Anglais », « Capitales »)');
			}
			expect(await db.card.count()).toBe(0);
		});

		it('captures in the named deck, ignoring case and spaces, DeepL for a language only', async () => {
			const client = await connect(alice, neverTranslate);
			const capital = { side_a: 'Suisse', side_b: 'Berne', deck: ' capitales ' };

			const check = await call(client, 'check_card', capital);
			expect(data(check)).toEqual({
				deck: 'Capitales',
				deepl_a_to_b: null,
				deepl_b_to_a: null,
				duplicates: []
			});
			expect(text(check)).toMatch(/^Deck « Capitales »\.\nPas de second avis DeepL/);

			const created = await call(client, 'create_card', capital);
			expect(data(created)).toMatchObject({ deck: 'Capitales', side_a: 'Suisse', created: true });
			expect(text(created)).toContain('Carte créée dans « Capitales »');
			const stored = await db.card.findFirstOrThrow({ include: { reviews: true } });
			expect(stored.deckId).toBe(capitalsDeck);
			expect(stored.reviews.map((r) => r.direction)).toEqual(['a_to_b']);

			const english = await call(await connect(alice), 'check_card', {
				...args,
				deck: 'Anglais'
			});
			expect(data(english)).toMatchObject({
				deck: 'Anglais',
				deepl_a_to_b: 'to take for granted'
			});
		});

		it('refuses an unknown or deleted deck, naming the decks', async () => {
			await createDeck(db, alice, { name: 'Allemand', deletedAt: t0 });
			const client = await connect(alice);
			for (const deck of ['Espagnol', 'Allemand']) {
				for (const [tool, input] of [
					['check_card', { ...args, deck }],
					['create_card', { ...args, deck }],
					['next_review', { deck }]
				] as const) {
					const result = await call(client, tool, input);
					expect(result.isError).toBe(true);
					expect(text(result)).toBe(
						`Deck « ${deck} » introuvable. Decks de l'utilisateur : « Anglais », « Capitales ».`
					);
				}
			}
			expect(await db.card.count()).toBe(0);
		});

		it('takes the only deck without a name, and accepts its name', async () => {
			const client = await connect(bob);
			const { tools } = await client.listTools();
			expect(
				tools.find((t) => t.name === 'create_card')!.inputSchema.properties?.deck
			).toMatchObject({ description: expect.stringContaining("n'a qu'un deck") });

			expect(data(await call(client, 'create_card', args))).toMatchObject({ created: true });
			const named = await call(client, 'check_card', { ...args, deck: 'anglais' });
			expect(data(named).duplicates).toHaveLength(1);
			expect(await db.card.count({ where: { ownerId: bob, deckId: bobDeck } })).toBe(1);
		});

		it('mixes all decks by default, and limits a session to a named deck', async () => {
			await cards.create(alice, aliceDeck, card, 'web', t0);
			await cards.create(alice, capitalsDeck, { sideA: 'Suisse', sideB: 'Berne' }, 'web', at(1));
			clock = at(2);
			const client = await connect(alice);

			const mixed = data(await call(client, 'next_review'));
			expect(mixed).toMatchObject({ deck: 'Anglais', remaining: 2 });

			const scoped = await call(client, 'next_review', { deck: 'Capitales' });
			expect(data(scoped)).toMatchObject({ deck: 'Capitales', prompt: 'Suisse', remaining: 1 });
			expect(text(scoped)).toMatch(/^Deck « Capitales »\.\n/);

			// remaining est compté dans le deck passé à submit_review.
			const answer = await call(client, 'submit_review', {
				review_id: data(scoped).review_id,
				version: data(scoped).version,
				rating: 'good',
				deck: 'Capitales'
			});
			expect(data(answer)).toMatchObject({ remaining: 0 });
			expect(text(answer)).toContain('Plus rien de dû.');

			const idle = await call(client, 'next_review', { deck: 'capitales' });
			expect(data(idle)).toMatchObject({ nothing_due: true });
			expect(text(idle)).toContain('Rien à réviser dans « Capitales »');
			expect(data(await call(client, 'next_review'))).toMatchObject({ remaining: 1 });

			const amended = await call(client, 'amend_review', {
				review_id: data(scoped).review_id,
				rating: 'again'
			});
			expect(data(amended)).toMatchObject({ remaining: 1 });
			// Un deck inconnu ne bloque pas la note : remaining est alors compté partout.
			const unknown = await call(client, 'amend_review', {
				review_id: data(scoped).review_id,
				rating: 'good',
				deck: 'Espagnol'
			});
			expect(data(unknown)).toMatchObject({ rating: 'good', changed: true, remaining: 1 });
		});
	});

	describe('review', () => {
		it('runs next, hint and submit, capping at hard after a hint', async () => {
			await cards.create(alice, aliceDeck, { ...card, context: 'réunion budget' }, 'web', t0);
			const client = await connect(alice);

			const next = data(await call(client, 'next_review'));
			expect(next).toMatchObject({ nothing_due: false, has_hint: true, remaining: 1 });
			expect(JSON.stringify(next)).not.toContain('réunion budget');

			const hint = await call(client, 'get_hint', { review_id: next.review_id });
			expect(data(hint)).toEqual({ context: 'réunion budget' });

			const submitted = await call(client, 'submit_review', {
				review_id: next.review_id,
				version: next.version,
				rating: 'good'
			});
			const answer = data(submitted);
			// Plafonnée à hard : pas de carte suivante avant la correction et la répétition.
			expect(answer).not.toHaveProperty('next');
			expect(text(submitted)).toContain('invite-le à la répéter une fois');
			expect(answer).toMatchObject({
				review_id: next.review_id,
				rating: 'hard',
				capped: true,
				replayed: false,
				context: 'réunion budget',
				// Le sens inverse est mis de côté pendant 24 heures.
				remaining: 0
			});
			expect(answer.next_due_in).toMatch(/^dans \d+ minutes?$/);
			const [log] = await db.reviewLog.findMany();
			expect(log).toMatchObject({ rating: 'hard', origin: 'claude', hintUsed: true });
		});

		it('chains the next card after good, and waits for a repetition after again or hard', async () => {
			await cards.create(alice, aliceDeck, card, 'web', t0);
			await cards.create(alice, aliceDeck, { sideA: 'chat', sideB: 'cat' }, 'web', at(1));
			await cards.create(alice, aliceDeck, { sideA: 'chien', sideB: 'dog' }, 'web', at(2));
			clock = at(3);
			const client = await connect(alice);

			const first = data(await call(client, 'next_review'));
			const good = await call(client, 'submit_review', {
				review_id: first.review_id,
				version: first.version,
				rating: 'good'
			});
			const second = data(good).next as Record<string, unknown>;
			expect(second).toMatchObject({ deck: 'Anglais', has_hint: false, remaining: 2 });
			expect(second.review_id).not.toBe(first.review_id);
			expect(text(good)).toContain('Carte suivante :\nÀ demander en ');
			expect(text(good)).toContain('Réponse attendue, à ne pas lire avant sa réponse');

			for (const rating of ['again', 'hard'] as const) {
				const current = data(await call(client, 'next_review'));
				const missed = await call(client, 'submit_review', {
					review_id: current.review_id,
					version: current.version,
					rating
				});
				expect(data(missed)).toMatchObject({ rating, remaining: rating === 'again' ? 1 : 0 });
				expect(data(missed)).not.toHaveProperty('next');
				expect(text(missed)).toContain(
					'Pas de carte suivante : donne la bonne réponse, invite-le à la répéter une fois à voix haute et attends sa réponse avant next_review.'
				);
			}
		});

		it('closes the session when nothing is due, and chains ahead when asked', async () => {
			for (const [i, sides] of [card, { sideA: 'chat', sideB: 'cat' }].entries()) {
				const { id } = await cards.create(alice, aliceDeck, sides, 'web', at(i));
				await db.review.updateMany({ where: { cardId: id }, data: { due: at(3 * DAY + i) } });
			}
			const client = await connect(alice);
			const submit = (review: Record<string, unknown>, ahead?: boolean) =>
				call(client, 'submit_review', {
					review_id: review.review_id,
					version: review.version,
					rating: 'good',
					ahead
				});

			const closed = await submit(data(await call(client, 'next_review', { ahead: true })));
			expect(data(closed)).not.toHaveProperty('next');
			expect(text(closed)).toContain(
				"Session terminée : propose de réviser en avance (next_review avec ahead) et, une fois, d'ajouter une carte tirée de sa journée."
			);

			const chained = await submit(data(await call(client, 'next_review', { ahead: true })), true);
			expect(data(chained).next).toMatchObject({ remaining: 0 });
			expect(text(chained)).toContain('Carte suivante :');
		});

		it('asks for the face to produce, in its language or by its label', async () => {
			await cards.create(alice, aliceDeck, card, 'web', t0);
			const next = await call(await connect(alice), 'next_review');
			expect(text(next)).toMatch(/^À demander en (anglais|français) : /);

			const deck = await createDeck(db, bob, capitals);
			await cards.create(bob, deck.id, { sideA: 'Suisse', sideB: 'Berne' }, 'web', t0);
			const subject = await call(await connect(bob), 'next_review');
			expect(data(subject)).toMatchObject({ direction: 'a_to_b', prompt: 'Suisse', remaining: 1 });
			expect(text(subject)).toContain('À demander (Pays → Capitale) : « Suisse ».');
		});

		it('ignores a replayed submit with a stale version', async () => {
			await cards.create(alice, aliceDeck, card, 'web', t0);
			const client = await connect(alice);
			const next = data(await call(client, 'next_review'));
			const submit = { review_id: next.review_id, version: next.version };

			const first = data(await call(client, 'submit_review', { ...submit, rating: 'good' }));
			clock = at(1);
			const replay = await call(client, 'submit_review', { ...submit, rating: 'again' });

			expect(data(replay)).toMatchObject({
				rating: 'good',
				replayed: true,
				capped: false,
				next_due: first.next_due
			});
			expect(text(replay)).toContain('Déjà enregistrée');
			expect(await db.reviewLog.count()).toBe(1);
		});

		it('amends the last answer within the hour, and refuses otherwise', async () => {
			const created = await cards.create(alice, aliceDeck, card, 'web', t0);
			const client = await connect(alice);
			const next = data(await call(client, 'next_review'));
			await call(client, 'submit_review', {
				review_id: next.review_id,
				version: next.version,
				rating: 'good'
			});

			clock = at(2);
			const amended = data(
				await call(client, 'amend_review', { review_id: next.review_id, rating: 'again' })
			);
			expect(amended).toMatchObject({ rating: 'again', capped: false, changed: true });
			expect(await db.reviewLog.findFirst()).toMatchObject({ rating: 'again' });

			const same = await call(client, 'amend_review', {
				review_id: next.review_id,
				rating: 'again'
			});
			expect(data(same)).toMatchObject({ rating: 'again', changed: false });
			expect(text(same)).toContain('Note inchangée');

			clock = at(HOUR + 1);
			const late = await call(client, 'amend_review', {
				review_id: next.review_id,
				rating: 'good'
			});
			expect(late.isError).toBe(true);
			expect(text(late)).toContain("dans l'heure");

			const other = created.reviews.find((r) => r.id !== next.review_id)!;
			const unanswered = await call(client, 'amend_review', {
				review_id: other.id,
				rating: 'good'
			});
			expect(unanswered.isError).toBe(true);
		});

		it('reports nothing due with the next due date, then reviews ahead', async () => {
			const { id } = await cards.create(alice, aliceDeck, card, 'web', t0);
			await db.review.updateMany({ where: { cardId: id }, data: { due: at(3 * DAY) } });
			const client = await connect(alice);

			const idle = await call(client, 'next_review');
			expect(data(idle)).toEqual({
				nothing_due: true,
				next_due: at(3 * DAY).toISOString(),
				next_due_in: 'dans 3 jours'
			});
			expect(text(idle)).toContain('dans 3 jours');

			const ahead = data(await call(client, 'next_review', { ahead: true }));
			expect(ahead).toMatchObject({ nothing_due: false, remaining: 0 });
		});

		it('isolates users from each other', async () => {
			const other = await cards.create(bob, bobDeck, { ...card, context: 'secret' }, 'web', t0);
			const [review] = other.reviews;
			const client = await connect(alice);

			expect(data(await call(client, 'next_review', { ahead: true }))).toMatchObject({
				nothing_due: true,
				next_due: null
			});
			for (const [name, args] of [
				['get_hint', { review_id: review.id }],
				['submit_review', { review_id: review.id, version: 'new', rating: 'good' }],
				['amend_review', { review_id: review.id, rating: 'good' }]
			] as const) {
				const result = await call(client, name, args);
				expect(result.isError).toBe(true);
				expect(text(result)).toContain('Révision introuvable');
			}
			expect(await db.review.findUniqueOrThrow({ where: { id: review.id } })).toMatchObject({
				hintRequestedAt: null,
				reps: 0
			});
		});

		it('rejects a malformed review id as a tool error', async () => {
			const result = await call(await connect(alice), 'get_hint', { review_id: 'abc' });
			expect(result.isError).toBe(true);
		});
	});

	describe('guidance', () => {
		/** Description d'un outil, telle que Claude la reçoit. */
		async function descriptions(client: Client) {
			const { tools } = await client.listTools();
			return Object.fromEntries(tools.map((t) => [t.name, t.description ?? '']));
		}

		it('tells Claude to correct, inspire from real situations and offer cards sparingly', async () => {
			const subjects = await createUser(db, 'Carol');
			await createDeck(db, subjects, capitals);
			const several = await createUser(db, 'Dave');
			await createDeck(db, several);
			await createDeck(db, several, capitals);

			for (const owner of [alice, subjects, several]) {
				const instructions = (await connect(owner)).getInstructions()!;
				expect(instructions).toContain('- Correction : après again ou hard');
				expect(instructions).toContain('« Répète-la une fois ? »');
				expect(instructions).toContain('jamais la carte suivante dans le même message');
				expect(instructions).toContain(
					'la transcription vocale déforme souvent les mots étrangers'
				);
				expect(instructions).toContain("- Manque d'idées : ");
				expect(instructions).toContain(
					'Ne propose jamais de cartes génériques sans situation réelle'
				);
				expect(instructions).toContain(
					'check_card, second avis DeepL pour une langue, relecture et confirmation'
				);
				expect(instructions).toContain("- Proposer d'ajouter des cartes : en fin de révision");
				expect(instructions).toContain("Jamais entre deux cartes d'une révision");
				expect(instructions).toContain("N'annonce jamais l'état de son objectif quotidien");
				expect(instructions).toContain('la répartition des notes');
			}
			expect((await connect(alice)).getInstructions()).not.toContain(
				'Vérification (deck de sujet)'
			);
		});

		it('repeats the essential rules in the tool descriptions', async () => {
			const tools = await descriptions(await connect(alice));

			expect(tools.check_card).toContain("Une carte part d'une situation réelle de l'utilisateur");
			expect(tools.check_card).not.toContain('recherche web');
			expect(tools.next_review).toContain('avec indulgence, jamais à la lettre');
			expect(tools.submit_review).toContain('Après good ou easy, renvoie la carte suivante (next)');
			expect(tools.submit_review).toContain('Correction : après again ou hard');
			expect(tools.submit_review).toContain('« Répète-la une fois ? »');
			expect(tools.submit_review).toContain("propose une fois d'ajouter une carte");
		});

		it('has every verifiable fact of a subject card checked against a recent source', async () => {
			const carol = await createUser(db, 'Carol');
			await createDeck(db, carol, capitals);
			const single = await connect(carol);
			await createDeck(db, alice, capitals);
			const several = await connect(alice);

			for (const client of [single, several]) {
				expect(client.getInstructions()).toContain(
					"- Vérification (deck de sujet) : toute information vérifiable que porte la carte (par exemple un fait, un chiffre, une date, une définition, une attribution ou une procédure) se vérifie auprès d'une source récente et fiable, par une recherche web, avant d'être proposée, jamais de mémoire. Mets la source et sa date dans le contexte de la carte. Si tu ne peux pas vérifier, dis-le au lieu d'inventer."
				);
				const tools = await descriptions(client);
				expect(tools.check_card).toContain('source récente et fiable, par une recherche web');
				expect(tools.check_card).toContain(
					"Si tu ne peux pas vérifier, dis-le au lieu d'inventer."
				);
				expect(tools.create_card).toContain(
					'toute information vérifiable se vérifie auprès d’une source récente et fiable (recherche web), jamais de mémoire, avec la source et sa date dans le contexte'
				);
			}
		});
	});

	describe('prompts', () => {
		/** Texte du message que le prompt met dans la bouche de l'utilisateur. */
		async function prompt(client: Client, name: string, args: Record<string, string> = {}) {
			const { messages } = await client.getPrompt({ name, arguments: args });
			expect(messages).toHaveLength(1);
			expect(messages[0].role).toBe('user');
			const { content } = messages[0];
			return content.type === 'text' ? content.text : '';
		}

		it('offers « Réviser » and « Ajouter une carte », with optional arguments', async () => {
			const { prompts } = await (await connect(alice)).listPrompts();

			expect(prompts.map(({ name, title }) => ({ name, title }))).toEqual([
				{ name: 'review', title: 'Réviser' },
				{ name: 'add_card', title: 'Ajouter une carte' }
			]);
			for (const { arguments: params } of prompts) {
				expect(params).toHaveLength(1);
				expect(params![0].required).toBeFalsy();
			}
		});

		it('starts a review session, on all decks or on a named one', async () => {
			await createDeck(db, alice, capitals);
			const client = await connect(alice);

			const mixed = await prompt(client, 'review');
			expect(mixed).toMatch(/^On révise\. Lance une session de révision Poj/);
			expect(mixed).toContain('Appelle next_review sans deck');
			expect(mixed).toContain('submit_review renvoie la carte suivante (next)');
			expect(mixed).toContain('- Correction : après again ou hard');
			expect(mixed).toContain('Rien à réviser (nothing_due)');
			expect(mixed).toContain('« on arrête »');
			expect(mixed).toContain("propose une fois, en une phrase, d'ajouter une carte");

			expect(await prompt(client, 'review', { deck: ' ' })).toContain('next_review sans deck');
			const scoped = await prompt(client, 'review', { deck: 'capitales' });
			expect(scoped).toMatch(/^On révise le deck « Capitales »\./);
			expect(scoped).toContain('Appelle next_review avec le deck « Capitales »');
		});

		it('captures a card met in a real situation', async () => {
			const text = await prompt(await connect(alice), 'add_card', {
				expression: "j'ai entendu « it's not rocket science » dans un podcast"
			});

			expect(text).toMatch(/^Je veux ajouter une carte : j'ai entendu « it's not rocket science »/);
			expect(text).toContain('pose-moi une question avant de proposer une carte');
			expect(text).toContain("qu'elle est idiomatique");
			expect(text).toContain('appelle toujours check_card avant create_card');
			expect(text).toContain('si DeepL diverge de ta proposition');
			expect(text).toContain('Relis-moi la carte finale (faces, contexte)');
			expect(text).not.toContain("Manque d'idées");
			expect(text).not.toContain('Vérification (deck de sujet)');
		});

		it('helps find a real situation when inspiration is lacking', async () => {
			const client = await connect(alice);
			const text = await prompt(client, 'add_card');

			expect(text).toMatch(/^Je veux ajouter une carte, mais je manque d'idées/);
			expect(text).toContain("- Manque d'idées : ");
			expect(text).toContain('Ne propose jamais de cartes génériques sans situation réelle');
			expect(text).toContain('appelle toujours check_card avant create_card');
			expect(text).toContain('attends ma confirmation explicite avant create_card');
			expect(await prompt(client, 'add_card', { expression: '  ' })).toBe(text);
		});

		it('adapts the capture to subject decks, several decks or none', async () => {
			const carol = await createUser(db, 'Carol');
			const subject = await prompt(await connect(carol), 'add_card');
			expect(subject).toContain('https://poj.test/decks/new');

			await createDeck(db, carol, capitals);
			const verified = await prompt(await connect(carol), 'add_card', {
				expression: 'la population du Portugal, lue dans un article'
			});
			expect(verified).toContain('Vérification (deck de sujet)');
			expect(verified).not.toContain('DeepL');

			await createDeck(db, alice, capitals);
			const several = await prompt(await connect(alice), 'add_card');
			expect(several).toContain('- Choix du deck : ');
			expect(several).toContain('Relis-moi la carte finale (faces, contexte, deck)');
			expect(several).toContain('Vérification (deck de sujet)');
		});
	});

	it('serves stateless Streamable HTTP from a Request', async () => {
		await cards.create(alice, aliceDeck, card, 'web', t0);
		const handle = createMcpRequestHandler(deps());
		// Le transport HTTP du client envoie ses requêtes directement au handler.
		const transport = new StreamableHTTPClientTransport(new URL('http://poj.test/mcp'), {
			fetch: (input, init) => handle(new Request(input, init), alice)
		});
		const client = new Client({ name: 'test', version: '1.0.0' });
		await client.connect(transport);

		const next = data(await call(client, 'next_review'));
		expect(next).toMatchObject({ nothing_due: false, remaining: 1 });
		expect([card.sideA, card.sideB]).toContain(next.prompt);
		await client.close();
	});

	it('serves 2025-era clients through the stateless fallback', async () => {
		const handle = createMcpRequestHandler(deps());
		const response = await handle(
			new Request('http://poj.test/mcp', {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					accept: 'application/json, text/event-stream',
					'mcp-protocol-version': '2025-06-18'
				},
				body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
			}),
			alice
		);

		expect(response.status).toBe(200);
		expect(await response.text()).toContain('submit_review');
	});
});
