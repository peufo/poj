import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { InMemoryTransport, type CallToolResult } from '@modelcontextprotocol/server';
import { assert, beforeEach, describe, expect, it } from 'vitest';
import { useTestDatabase } from '../testing/db';
import { createDeck, createUser } from '../testing/factories';
import {
	CARD_LIMITS,
	MAX_BATCH_CARDS,
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
	async translate({ texts, to }) {
		return texts.map(() => (to === 'en-GB' ? 'to take for granted' : 'tenir pour acquis'));
	}
};

/** Faux DeepL d'après un dictionnaire, qui compte ses requêtes. */
function dictionary(entries: Record<string, string>): Translator & { requests: number } {
	return {
		requests: 0,
		async translate({ texts }) {
			this.requests += 1;
			return texts.map((text) => entries[text] ?? text);
		}
	};
}

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

type Entry = Record<string, unknown>;

/** Cartes renvoyées par review. */
const cardsOf = (result: CallToolResult) => data(result).cards as Entry[];

/** Entrée answer de review : la réponse donnée à cette carte. */
const answerOf = (card: Entry, rating: string) => ({
	review_id: card.review_id,
	version: card.version,
	rating
});

describe('MCP server', () => {
	it('exposes the eight tools, with read-only hints and instructions', async () => {
		const client = await connect(alice);
		const { tools } = await client.listTools();

		expect(tools.map((t) => t.name).sort()).toEqual([
			'amend_review',
			'check_card',
			'check_cards',
			'create_card',
			'create_cards',
			'get_hint',
			'list_decks',
			'review'
		]);
		const readOnly = tools.filter((t) => t.annotations?.readOnlyHint).map((t) => t.name);
		expect(readOnly.sort()).toEqual(['check_card', 'check_cards', 'list_decks']);
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
			const check = tools.find((t) => t.name === 'check_card');
			assert.exists(check);

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
			expect(tools.find((t) => t.name === 'create_card')?.description).toContain(
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

	describe('batch', () => {
		const translations = {
			chat: 'cat',
			cat: 'chat',
			chien: 'dog',
			dog: 'chien',
			maison: 'house',
			home: 'domicile'
		};
		/** Un lot : un doublon du deck, un doublon dans le lot et une divergence DeepL. */
		const batch = [
			{ side_a: 'chat', side_b: 'cat' },
			{ side_a: 'considérer comme acquis', side_b: ' To take for GRANTED ' },
			{ side_a: 'chien', side_b: 'dog' },
			{ side_a: 'chaton', side_b: 'Cat' },
			{ side_a: 'maison', side_b: 'home' }
		];

		it('checks a batch in one call, reporting only its problems', async () => {
			const existing = await cards.create(
				alice,
				aliceDeck,
				{ ...card, context: 'podcast' },
				'web',
				t0
			);
			const translator = dictionary(translations);
			const client = await connect(alice, translator);

			const result = await call(client, 'check_cards', { cards: batch });
			expect(data(result)).toEqual({
				deck: 'Anglais',
				count: 5,
				already_created: [],
				duplicates: [
					{
						position: 2,
						side_a: 'considérer comme acquis',
						side_b: 'To take for GRANTED',
						same_as: null,
						existing: [{ card_id: existing.id, ...args, context: 'podcast' }]
					},
					{ position: 4, side_a: 'chaton', side_b: 'Cat', same_as: 1, existing: [] }
				],
				divergences: [
					{
						position: 5,
						side_a: 'maison',
						side_b: 'home',
						deepl_a_to_b: 'house',
						deepl_b_to_a: 'domicile'
					}
				]
			});
			expect(text(result)).toContain(
				'Lot de 5 cartes pour « Anglais » : 2 doublons, 1 divergence DeepL.'
			);
			expect(text(result)).toContain('n°4 « chaton » = « Cat » : doublon de la n°1 du lot.');
			// Une requête DeepL par sens pour tout le lot, doublons exclus.
			expect(translator.requests).toBe(2);
			expect(await db.card.count()).toBe(1);
		});

		it('reports a DeepL failure once for the whole batch', async () => {
			const quota: Translator = {
				async translate() {
					throw new TranslatorError('quota', 'Quota exceeded');
				}
			};

			const result = await call(await connect(alice, quota), 'check_cards', { cards: batch });
			expect(data(result)).toMatchObject({
				divergences: [],
				deepl_error: 'le quota DeepL est épuisé'
			});
			expect(text(result).match(/quota/g)).toHaveLength(1);
		});

		it('creates a batch in one call, skipping duplicates, in the order of the batch', async () => {
			await cards.create(alice, aliceDeck, card, 'web', t0);
			const client = await connect(alice);

			const result = await call(client, 'create_cards', { cards: batch });
			const created = data(result);
			expect(created).toMatchObject({
				deck: 'Anglais',
				created: 3,
				already_created: 0,
				skipped: [
					{ position: 2, reason: 'duplicate' },
					{ position: 4, reason: 'duplicate_in_batch' }
				]
			});
			expect(text(result)).toContain('3 cartes créées.');
			expect(text(result)).toContain('Doublons non créés : n°2');

			const saved = await db.card.findMany({
				where: { origin: 'claude' },
				orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
				include: { reviews: true }
			});
			expect(saved.map((c) => c.id)).toEqual(
				(created.cards as { card_id: string }[]).map((c) => c.card_id)
			);
			expect(saved.map((c) => c.sideA)).toEqual(['chat', 'chien', 'maison']);
			expect(saved.every((c) => c.reviews.length === 2)).toBe(true);
		});

		it('creates nothing more when a batch is replayed', async () => {
			const client = await connect(alice);
			const first = data(await call(client, 'create_cards', { cards: batch }));

			clock = at(2);
			const replay = await call(client, 'create_cards', { cards: batch });
			expect(data(replay)).toMatchObject({
				created: 0,
				already_created: 4,
				cards: (first.cards as { card_id: string }[]).map((c) => ({ ...c, created: false }))
			});
			expect(text(replay)).toContain('4 cartes déjà créées il y a moins de 10 minutes');
			expect(await db.card.count()).toBe(4);

			// Plus tard, les mêmes cartes sont des doublons : toujours rien de créé.
			clock = at(HOUR);
			const later = data(await call(client, 'create_cards', { cards: batch }));
			expect(later).toMatchObject({ created: 0, already_created: 0 });
			expect(later.skipped).toHaveLength(5);
			expect(await db.card.count()).toBe(4);
		});

		it('creates nothing when the batch fails partway, then the replay creates it all', async () => {
			const client = await connect(alice);
			// Postgres refuse le caractère nul : la troisième carte échoue en base.
			const broken = batch.map((c, i) => (i === 2 ? { ...c, context: 'a\u0000b' } : c));

			const failed = await call(client, 'create_cards', { cards: broken });
			expect(failed.isError).toBe(true);
			expect(text(failed)).toContain("aucune carte n'a été ajoutée. Rejoue le même appel");
			expect(await db.card.count()).toBe(0);

			expect(data(await call(client, 'create_cards', { cards: batch }))).toMatchObject({
				created: 4
			});
		});

		it('refuses more cards than the cap in one call, with a clear message', async () => {
			const client = await connect(alice);
			const many = (count: number) =>
				Array.from({ length: count }, (_, i) => ({ side_a: `mot ${i}`, side_b: `word ${i}` }));

			for (const tool of ['check_cards', 'create_cards']) {
				const result = await call(client, tool, { cards: many(MAX_BATCH_CARDS + 1) });
				expect(result.isError).toBe(true);
				expect(text(result)).toContain(
					`${MAX_BATCH_CARDS} cartes au plus par appel : découpe le lot en plusieurs appels.`
				);
			}
			expect(await db.card.count()).toBe(0);

			const full = data(await call(client, 'create_cards', { cards: many(MAX_BATCH_CARDS) }));
			expect(full.created).toBe(MAX_BATCH_CARDS);
		});

		it('checks a subject batch without DeepL, duplicates on side A, in the named deck', async () => {
			const deck = await createDeck(db, alice, capitals);
			await cards.create(alice, deck.id, { sideA: 'Suisse', sideB: 'Berne' }, 'web', t0);
			const translator: Translator = {
				async translate() {
					throw new Error('DeepL must not be called for a subject deck');
				}
			};
			const client = await connect(alice, translator);
			const countries = [
				{ side_a: 'suisse', side_b: 'Zurich' },
				{ side_a: 'Australie', side_b: 'Canberra', context: 'Source : Wikipédia, 2026-11-01' }
			];

			const check = await call(client, 'check_cards', { cards: countries, deck: 'capitales' });
			expect(data(check)).toMatchObject({
				deck: 'Capitales',
				duplicates: [{ position: 1, existing: [{ side_a: 'Suisse' }] }],
				divergences: []
			});
			expect(text(check)).toContain('Pas de second avis DeepL');

			const created = data(
				await call(client, 'create_cards', { cards: countries, deck: 'Capitales' })
			);
			expect(created).toMatchObject({ deck: 'Capitales', created: 1 });
			expect(
				await db.card.findFirst({ where: { sideA: 'Australie' }, include: { reviews: true } })
			).toMatchObject({ deckId: deck.id, reviews: [{ direction: 'a_to_b' }] });

			const refused = await call(client, 'create_cards', { cards: countries });
			expect(refused.isError).toBe(true);
			expect(text(refused)).toContain('plusieurs decks');
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
			const instructions = client.getInstructions();
			assert.exists(instructions);

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
			const check = tools.find((t) => t.name === 'check_card');
			const create = tools.find((t) => t.name === 'create_card');
			assert.exists(check);
			assert.exists(create);
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
					['review', { deck }]
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
				tools.find((t) => t.name === 'create_card')?.inputSchema.properties?.deck
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

			const mixed = data(await call(client, 'review'));
			expect(mixed).toMatchObject({
				remaining: 2,
				cards: [{ deck: 'Anglais' }, { deck: 'Capitales' }]
			});

			const scoped = await call(client, 'review', { deck: 'Capitales' });
			expect(data(scoped)).toMatchObject({
				remaining: 1,
				cards: [{ deck: 'Capitales', prompt: 'Suisse' }]
			});
			expect(text(scoped)).toMatch(/^Carte à poser maintenant :\nDeck « Capitales »\.\n/);
			const [capital] = cardsOf(scoped);
			assert.exists(capital);

			// remaining est compté dans le deck de la session.
			const answer = await call(client, 'review', {
				answer: answerOf(capital, 'good'),
				deck: 'Capitales'
			});
			expect(data(answer)).toMatchObject({
				answer: { rating: 'good' },
				cards: [],
				remaining: 0,
				nothing_due: true
			});
			expect(text(answer)).toContain('Rien à réviser dans « Capitales »');

			const idle = await call(client, 'review', { deck: 'capitales' });
			expect(data(idle)).toMatchObject({ nothing_due: true });
			expect(text(idle)).toContain('Rien à réviser dans « Capitales »');
			expect(data(await call(client, 'review'))).toMatchObject({ remaining: 1 });

			const amended = await call(client, 'amend_review', {
				review_id: capital.review_id,
				rating: 'again'
			});
			expect(data(amended)).toMatchObject({ remaining: 1 });
			// Un deck inconnu ne bloque pas la note : remaining est alors compté partout.
			const unknown = await call(client, 'amend_review', {
				review_id: capital.review_id,
				rating: 'good',
				deck: 'Espagnol'
			});
			expect(data(unknown)).toMatchObject({ rating: 'good', changed: true, remaining: 1 });
		});
	});

	describe('review', () => {
		it('presents only the new cards of the day, as on the web', async () => {
			for (let i = 0; i < 15; i += 1) {
				await cards.create(alice, aliceDeck, { sideA: `q${i}`, sideB: `r${i}` }, 'web', t0);
			}
			const client = await connect(alice);

			const start = data(await call(client, 'review'));
			expect(start).toMatchObject({ nothing_due: false, remaining: 10 });
			let [current, held] = start.cards as (Entry | undefined)[];
			let last: Entry = start;
			for (let i = 10; i > 0; i -= 1) {
				assert.exists(current);
				last = data(
					await call(client, 'review', {
						answer: answerOf(current, 'easy'),
						holding: held?.review_id
					})
				);
				expect(last.remaining).toBe(i - 1);
				[current, held] = [held, (last.cards as Entry[])[0]];
			}
			expect(last).toMatchObject({ nothing_due: true, next_due: '2026-01-05T23:00:00.000Z' });

			// Les 5 autres attendent demain (minuit à Zurich).
			const idle = data(await call(client, 'review'));
			expect(idle).toMatchObject({ nothing_due: true, next_due: '2026-01-05T23:00:00.000Z' });
		});

		it('runs review and hint, capping at hard after a hint', async () => {
			await cards.create(alice, aliceDeck, { ...card, context: 'réunion budget' }, 'web', t0);
			const client = await connect(alice);

			const start = await call(client, 'review');
			// Un seul sens de la carte : l'autre ne peut pas être la carte d'avance.
			expect(data(start)).toMatchObject({ nothing_due: false, remaining: 1 });
			const [next] = cardsOf(start);
			assert.exists(next);
			expect(cardsOf(start)).toHaveLength(1);
			expect(next).toMatchObject({ has_hint: true });
			expect(JSON.stringify(data(start))).not.toContain('réunion budget');

			const hint = await call(client, 'get_hint', { review_id: next.review_id });
			expect(data(hint)).toEqual({ context: 'réunion budget' });

			const reviewed = await call(client, 'review', { answer: answerOf(next, 'good') });
			expect(data(reviewed).answer).toMatchObject({
				review_id: next.review_id,
				rating: 'hard',
				capped: true,
				replayed: false,
				context: 'réunion budget'
			});
			expect((data(reviewed).answer as Entry).next_due_in).toMatch(/^dans \d+ minutes?$/);
			// Note enregistrée avant le choix : le sens inverse est déjà mis de côté.
			expect(data(reviewed)).toMatchObject({ cards: [], remaining: 0, nothing_due: true });
			expect(text(reviewed)).toContain('invite-le à la répéter une fois');
			const [log] = await db.reviewLog.findMany();
			expect(log).toMatchObject({ rating: 'hard', origin: 'claude', hintUsed: true });
		});

		it('never gives the source of a card as a hint, nor caps the rating for it', async () => {
			const carol = await createUser(db, 'Carol');
			const deck = await createDeck(db, carol, capitals);
			const source = 'Source : fr.wikipedia.org/wiki/Canberra, consulté le 2026-11-01';
			await cards.create(
				carol,
				deck.id,
				{ sideA: 'Australie', sideB: 'Canberra', context: source },
				'claude',
				t0
			);
			await cards.create(
				carol,
				deck.id,
				{
					sideA: 'Canada',
					sideB: 'Ottawa',
					context: `Quiz du jeudi — ${source.replace('Canberra', 'Ottawa')}`
				},
				'claude',
				at(1)
			);
			clock = at(2);
			const client = await connect(carol);

			const start = await call(client, 'review');
			const [sourceOnly, mixed] = cardsOf(start);
			assert.exists(sourceOnly);
			assert.exists(mixed);
			expect(sourceOnly).toMatchObject({ prompt: 'Australie', has_hint: false });
			expect(mixed).toMatchObject({ prompt: 'Canada', has_hint: true });
			expect(text(start)).toContain('Pas d’indice.');
			const none = await call(client, 'get_hint', { review_id: sourceOnly.review_id });
			expect(data(none)).toEqual({ context: null });
			expect(text(none)).not.toContain('Canberra');
			const passed = data(
				await call(client, 'review', {
					answer: answerOf(sourceOnly, 'good'),
					holding: mixed.review_id
				})
			);
			expect(passed.answer).toMatchObject({ rating: 'good', capped: false });

			const hint = await call(client, 'get_hint', { review_id: mixed.review_id });
			expect(data(hint)).toEqual({ context: 'Quiz du jeudi' });
			expect(text(hint)).not.toContain('Ottawa');
		});

		it('always keeps a card ahead, and waits for a repetition after again or hard', async () => {
			const created: Awaited<ReturnType<typeof cards.create>>[] = [];
			for (const [i, sides] of ['un', 'deux', 'trois', 'quatre', 'cinq'].entries()) {
				created.push(
					await cards.create(alice, aliceDeck, { sideA: sides, sideB: `${i}` }, 'web', at(i))
				);
			}
			clock = at(5);
			const client = await connect(alice);
			/** Numéro (à partir de 1) de la carte de chaque révision renvoyée. */
			const numberOf = (c: Entry) =>
				created.findIndex((card) => card.reviews.some((r) => r.id === c.review_id)) + 1;
			const numbers = (result: CallToolResult) => cardsOf(result).map(numberOf);
			const byNumber = new Map<number, Entry>();
			const keep = (result: CallToolResult) => {
				for (const entry of cardsOf(result)) byNumber.set(numberOf(entry), entry);
				return result;
			};
			const shown = (n: number) => {
				const entry = byNumber.get(n);
				assert.exists(entry, `card ${n} was never presented`);
				return entry;
			};
			const answer = (n: number, rating = 'good') => answerOf(shown(n), rating);
			const holding = (n: number) => shown(n).review_id;

			const start = keep(await call(client, 'review'));
			expect(numbers(start)).toEqual([1, 2]);
			expect(data(start)).toMatchObject({ remaining: 5, nothing_due: false });
			expect(text(start)).toMatch(/^Carte à poser maintenant :\nÀ demander en /);
			expect(text(start)).toContain("Carte d'avance, à garder pour après :\nÀ demander en ");
			expect(text(start)).toContain('Réponse attendue, à ne pas lire avant sa réponse');

			const third = keep(await call(client, 'review', { answer: answer(1), holding: holding(2) }));
			expect(numbers(third)).toEqual([3]);
			expect(data(third)).toMatchObject({ answer: { rating: 'good' }, remaining: 4 });
			expect(text(third)).toMatch(/^Note retenue : good\./);
			expect(text(third)).not.toContain('répéter');
			const fourth = keep(await call(client, 'review', { answer: answer(2), holding: holding(3) }));
			expect(numbers(fourth)).toEqual([4]);
			// Claude ne tenait rien : deux cartes, la quatrième de nouveau.
			const fifth = keep(await call(client, 'review', { answer: answer(3) }));
			expect(numbers(fifth)).toEqual([4, 5]);
			expect(data(fifth)).toMatchObject({ remaining: 2 });

			const missed = await call(client, 'review', {
				answer: answer(4, 'again'),
				holding: holding(5)
			});
			expect(data(missed)).toMatchObject({
				answer: { rating: 'again' },
				cards: [],
				remaining: 1,
				nothing_due: false
			});
			expect(text(missed)).toContain(
				'Après again ou hard : donne la bonne réponse, invite-le à la répéter une fois à voix haute et attends sa réponse avant de poser la carte que tu tiens.'
			);
			expect(text(missed)).toContain("Pas d'autre carte : celle que tu tiens est la dernière.");

			const hard = await call(client, 'review', { answer: answer(5, 'hard') });
			expect(data(hard)).toMatchObject({ answer: { rating: 'hard' }, nothing_due: true });
			expect(text(hard)).toContain('invite-le à la répéter une fois');
		});

		it('ignores an unknown or foreign held card, and refuses a malformed one', async () => {
			await cards.create(alice, aliceDeck, card, 'web', t0);
			await cards.create(alice, aliceDeck, { sideA: 'chat', sideB: 'cat' }, 'web', at(1));
			const foreign = await cards.create(bob, bobDeck, card, 'web', t0);
			clock = at(2);
			const client = await connect(alice);

			const [foreignReview] = foreign.reviews;
			assert.exists(foreignReview);

			for (const holding of [foreignReview.id, '01900000-0000-7000-8000-000000000000']) {
				expect(cardsOf(await call(client, 'review', { holding }))).toHaveLength(2);
			}
			expect((await call(client, 'review', { holding: 'abc' })).isError).toBe(true);
		});

		it('records nothing on a version conflict, and says the held card stays valid', async () => {
			await cards.create(alice, aliceDeck, card, 'web', t0);
			await cards.create(alice, aliceDeck, { sideA: 'chat', sideB: 'cat' }, 'web', at(1));
			clock = at(2);
			const client = await connect(alice);
			const [current, held] = cardsOf(await call(client, 'review'));
			assert.exists(current);
			assert.exists(held);

			const conflict = await call(client, 'review', {
				answer: { ...answerOf(current, 'good'), version: t0.toISOString() },
				holding: held.review_id
			});
			expect(conflict.isError).toBe(true);
			expect(text(conflict)).toContain('Cette révision a été modifiée entre-temps.');
			expect(text(conflict)).toContain('La carte que tu tiens reste valable.');
			expect(await db.reviewLog.count()).toBe(0);
		});

		it('closes the session when nothing is due, and reviews ahead when asked', async () => {
			for (const [i, sides] of [card, { sideA: 'chat', sideB: 'cat' }].entries()) {
				const { id } = await cards.create(alice, aliceDeck, sides, 'web', at(i));
				await db.review.updateMany({ where: { cardId: id }, data: { due: at(3 * DAY + i) } });
			}
			const client = await connect(alice);

			const idle = await call(client, 'review');
			expect(data(idle)).toMatchObject({ nothing_due: true, cards: [] });
			expect(text(idle)).not.toContain('Session terminée');

			const [first, second] = cardsOf(await call(client, 'review', { ahead: true }));
			assert.exists(first);
			assert.exists(second);
			const last = await call(client, 'review', {
				answer: answerOf(first, 'good'),
				holding: second.review_id
			});
			expect(data(last)).toMatchObject({ cards: [], nothing_due: false });
			expect(text(last)).toContain("Pas d'autre carte : celle que tu tiens est la dernière.");

			const closed = await call(client, 'review', { answer: answerOf(second, 'good') });
			expect(data(closed)).toMatchObject({ cards: [], nothing_due: true });
			expect(text(closed)).toContain(
				"Session terminée : propose de réviser en avance (review avec ahead) et, une fois, d'ajouter une carte tirée de sa journée."
			);

			const ahead = await call(client, 'review', { ahead: true });
			expect(data(ahead)).toMatchObject({ nothing_due: false, remaining: 0 });
			expect(text(ahead)).toContain('Carte à poser maintenant :');
		});

		it('asks for the face to produce, in its language or by its label', async () => {
			await cards.create(alice, aliceDeck, card, 'web', t0);
			const next = await call(await connect(alice), 'review');
			expect(text(next)).toMatch(
				/^Carte à poser maintenant :\nÀ demander en (anglais|français) : /
			);

			const deck = await createDeck(db, bob, capitals);
			await cards.create(bob, deck.id, { sideA: 'Suisse', sideB: 'Berne' }, 'web', t0);
			const subject = await call(await connect(bob), 'review');
			expect(data(subject)).toMatchObject({
				cards: [{ direction: 'a_to_b', prompt: 'Suisse' }],
				remaining: 1
			});
			expect(text(subject)).toContain('À demander (Pays → Capitale) : « Suisse ».');
		});

		it('ignores a replayed answer with the same version', async () => {
			await cards.create(alice, aliceDeck, card, 'web', t0);
			const client = await connect(alice);
			const [next] = cardsOf(await call(client, 'review'));
			assert.exists(next);

			const first = data(await call(client, 'review', { answer: answerOf(next, 'good') }));
			clock = at(1);
			const replay = await call(client, 'review', { answer: answerOf(next, 'again') });

			expect(data(replay).answer).toMatchObject({
				rating: 'good',
				replayed: true,
				capped: false,
				next_due: (first.answer as Entry).next_due
			});
			expect(text(replay)).toContain('Déjà enregistrée');
			expect(await db.reviewLog.count()).toBe(1);
		});

		it('amends the last answer within the hour, and refuses otherwise', async () => {
			const created = await cards.create(alice, aliceDeck, card, 'web', t0);
			const client = await connect(alice);
			const [next] = cardsOf(await call(client, 'review'));
			assert.exists(next);
			await call(client, 'review', { answer: answerOf(next, 'good') });

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

			const other = created.reviews.find((r) => r.id !== next.review_id);
			assert.exists(other);
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

			const idle = await call(client, 'review');
			expect(data(idle)).toEqual({
				cards: [],
				remaining: 0,
				nothing_due: true,
				next_due: at(3 * DAY).toISOString(),
				next_due_in: 'dans 3 jours'
			});
			expect(text(idle)).toContain('dans 3 jours');

			const ahead = data(await call(client, 'review', { ahead: true }));
			expect(ahead).toMatchObject({ nothing_due: false, remaining: 0 });
			expect(ahead.cards).toHaveLength(1);
		});

		it('isolates users from each other', async () => {
			const other = await cards.create(bob, bobDeck, { ...card, context: 'secret' }, 'web', t0);
			const [review] = other.reviews;
			assert.exists(review);
			const client = await connect(alice);

			expect(data(await call(client, 'review', { ahead: true }))).toMatchObject({
				nothing_due: true,
				next_due: null
			});
			for (const [name, args] of [
				['get_hint', { review_id: review.id }],
				['review', { answer: { review_id: review.id, version: 'new', rating: 'good' } }],
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
				const instructions = (await connect(owner)).getInstructions();
				assert.exists(instructions);
				expect(instructions).toContain("- Révision, toujours une carte d'avance : ");
				expect(instructions).toContain(
					"aucun appel d'outil entre sa réponse et la question suivante"
				);
				expect(instructions).toContain('- Hésitation : une réponse hésitante');
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
				expect(instructions).not.toContain('objectif quotidien');
				expect(instructions).toContain('la répartition des notes');
			}
			expect((await connect(alice)).getInstructions()).not.toContain(
				'Vérification (deck de sujet)'
			);
		});

		it('lets a batch drawn from a source go through one check and one confirmation', async () => {
			const several = await createUser(db, 'Dave');
			await createDeck(db, several);
			await createDeck(db, several, capitals);

			for (const owner of [alice, several]) {
				const client = await connect(owner);
				const instructions = client.getInstructions();
				assert.exists(instructions);
				expect(instructions).toContain(
					`- Ajout en lot : pour beaucoup de cartes tirées d'une source`
				);
				expect(instructions).toContain(
					`vérifie-les avec check_cards (${MAX_BATCH_CARDS} au plus par appel), sans check_card carte par carte`
				);
				expect(instructions).toContain(
					'attends une seule confirmation explicite pour tout le lot, même découpé en plusieurs appels'
				);
				// La règle « pas de carte générique » admet un lot tiré d'une source.
				expect(instructions).toContain(
					"Un lot tiré d'une source qu'il apporte ou demande (son cours, un article, les pays du monde) n'en est pas un"
				);
				const tools = await descriptions(client);
				expect(tools.check_cards).toContain("ou d'une source qu'il apporte ou demande");
				expect(tools.check_cards).toContain('Ne renvoie que les problèmes');
				expect(tools.check_cards).toContain('divergences DeepL');
				expect(tools.create_cards).toContain('vérifie le lot avec check_cards');
				expect(tools.create_cards).toContain('une seule confirmation explicite pour tout le lot');
				expect(tools.create_cards).toContain('Tout ou rien');
			}
			expect((await connect(alice)).getInstructions()).not.toContain(
				'la vérification des faits vaut pour chaque carte du lot'
			);
		});

		it('repeats the essential rules in the tool descriptions', async () => {
			const tools = await descriptions(await connect(alice));

			expect(tools.check_card).toContain("Une carte part d'une situation réelle de l'utilisateur");
			expect(tools.check_card).not.toContain('recherche web');
			expect(tools.review).toContain('avec indulgence, jamais à la lettre');
			expect(tools.review).toContain(
				'pose aussitôt la carte que tu tiens, puis appelle review dans le même tour'
			);
			expect(tools.review).toContain(
				"aucun appel d'outil entre sa réponse et la question suivante"
			);
			expect(tools.review).toContain('Hésitation : une réponse hésitante');
			expect(tools.review).toContain('Correction : après again ou hard');
			expect(tools.review).toContain('« Répète-la une fois ? »');
			expect(tools.review).toContain("rejoue-le à l'identique");
			expect(tools.review).toContain("propose une fois d'ajouter une carte");
		});

		it('has every verifiable fact of a subject card checked against a recent source', async () => {
			const carol = await createUser(db, 'Carol');
			await createDeck(db, carol, capitals);
			const single = await connect(carol);
			await createDeck(db, alice, capitals);
			const several = await connect(alice);

			for (const client of [single, several]) {
				expect(client.getInstructions()).toContain(
					"- Vérification (deck de sujet) : toute information vérifiable que porte la carte (par exemple un fait, un chiffre, une date, une définition, une attribution ou une procédure) se vérifie auprès d'une source récente et fiable, par une recherche web, avant d'être proposée, jamais de mémoire. Mets la source et sa date dans le contexte de la carte, sur une ligne à part qui commence par « Source : » (get_hint ne la donne jamais comme indice). Si tu ne peux pas vérifier, dis-le au lieu d'inventer."
				);
				expect(client.getInstructions()).toContain(
					"Deck de sujet : la vérification des faits vaut pour chaque carte du lot : vérifie le lot auprès d'une source récente et fiable"
				);
				const tools = await descriptions(client);
				expect(tools.check_card).toContain('source récente et fiable, par une recherche web');
				expect(tools.check_card).toContain(
					"Si tu ne peux pas vérifier, dis-le au lieu d'inventer."
				);
				expect(tools.create_card).toContain(
					'toute information vérifiable se vérifie auprès d’une source récente et fiable (recherche web), jamais de mémoire, avec la source et sa date sur une ligne « Source : » du contexte'
				);
				expect(tools.check_cards).toContain(
					'la vérification des faits vaut pour chaque carte du lot'
				);
			}
		});
	});

	describe('prompts', () => {
		/** Texte du message que le prompt met dans la bouche de l'utilisateur. */
		async function prompt(client: Client, name: string, args: Record<string, string> = {}) {
			const { messages } = await client.getPrompt({ name, arguments: args });
			const [message] = messages;
			expect(messages).toHaveLength(1);
			assert.exists(message);
			expect(message.role).toBe('user');
			const { content } = message;
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
				expect(params?.[0]?.required).toBeFalsy();
			}
		});

		it('starts a review session, on all decks or on a named one', async () => {
			await createDeck(db, alice, capitals);
			const client = await connect(alice);

			const mixed = await prompt(client, 'review');
			expect(mixed).toMatch(/^On révise\. Lance une session de révision Poj/);
			expect(mixed).toContain('Appelle review sans deck');
			expect(mixed).toContain("Révision, toujours une carte d'avance");
			expect(mixed).toContain('- Hésitation : une réponse hésitante');
			expect(mixed).toContain('- Correction : après again ou hard');
			expect(mixed).toContain('Rien à réviser (nothing_due)');
			expect(mixed).toContain('« on arrête »');
			expect(mixed).toContain("propose une fois, en une phrase, d'ajouter une carte");

			expect(await prompt(client, 'review', { deck: ' ' })).toContain('review sans deck');
			const scoped = await prompt(client, 'review', { deck: 'capitales' });
			expect(scoped).toMatch(/^On révise le deck « Capitales »\./);
			expect(scoped).toContain('Appelle review avec le deck « Capitales »');
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

		const next = await call(client, 'review');
		expect(data(next)).toMatchObject({ nothing_due: false, remaining: 1 });
		const [presented] = cardsOf(next);
		assert.exists(presented);
		expect([card.sideA, card.sideB]).toContain(presented.prompt);
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
		expect(await response.text()).toContain('"review"');
	});
});
