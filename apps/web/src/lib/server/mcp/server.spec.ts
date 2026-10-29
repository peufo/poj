import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { InMemoryTransport, type CallToolResult } from '@modelcontextprotocol/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { useTestDatabase } from '../testing/db';
import { createDeck, createUser } from '../testing/factories';
import {
	createCardsService,
	createDecksService,
	createReviewsService,
	createTranslationService,
	TranslatorError,
	type Deck,
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

/**
 * Client MCP relié en mémoire à un serveur Poj pour ce propriétaire, sur son plus ancien
 * deck sauf mention contraire (`null` : aucun deck).
 */
async function connect(ownerId: string, translator?: Translator | null, deck?: Deck | null) {
	const server = createPojMcpServer({
		ownerId,
		deck: deck === undefined ? await decks.first(ownerId) : deck,
		newDeckUrl: 'https://poj.test/decks/new',
		...deps(translator)
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
	it('exposes the six tools, with read-only hints and instructions', async () => {
		const client = await connect(alice);
		const { tools } = await client.listTools();

		expect(tools.map((t) => t.name).sort()).toEqual([
			'amend_review',
			'check_card',
			'create_card',
			'get_hint',
			'next_review',
			'submit_review'
		]);
		const readOnly = tools.filter((t) => t.annotations?.readOnlyHint).map((t) => t.name);
		expect(readOnly.sort()).toEqual(['check_card', 'next_review']);
		expect(client.getInstructions()).toContain('easy');
	});

	describe('capture', () => {
		it('checks then creates a card, without duplicate on replay', async () => {
			const client = await connect(alice);

			const check = await call(client, 'check_card', { ...args, context: 'réunion' });
			expect(data(check)).toEqual({
				deepl_a_to_b: 'to take for granted',
				deepl_b_to_a: 'tenir pour acquis',
				duplicates: []
			});
			expect(text(check)).toContain('DeepL, français vers anglais');

			const created = data(await call(client, 'create_card', { ...args, context: 'réunion' }));
			expect(created).toMatchObject({ ...args, context: 'réunion', created: true });

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
			const deck = await createDeck(db, alice, capitals);
			const translator: Translator = {
				async translate() {
					throw new Error('DeepL must not be called for a subject deck');
				}
			};
			await db.card.create({
				data: { ownerId: alice, deckId: deck.id, sideA: 'Suisse', sideB: 'Berne', origin: 'web' }
			});
			const client = await connect(alice, translator, deck);
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

	describe('review', () => {
		it('runs next, hint and submit, capping at hard after a hint', async () => {
			await cards.create(alice, aliceDeck, { ...card, context: 'réunion budget' }, 'web', t0);
			const client = await connect(alice);

			const next = data(await call(client, 'next_review'));
			expect(next).toMatchObject({ nothing_due: false, has_hint: true, remaining: 1 });
			expect(JSON.stringify(next)).not.toContain('réunion budget');

			const hint = await call(client, 'get_hint', { review_id: next.review_id });
			expect(data(hint)).toEqual({ context: 'réunion budget' });

			const answer = data(
				await call(client, 'submit_review', {
					review_id: next.review_id,
					version: next.version,
					rating: 'good'
				})
			);
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

		it('asks for the face to produce, in its language or by its label', async () => {
			await cards.create(alice, aliceDeck, card, 'web', t0);
			const next = await call(await connect(alice), 'next_review');
			expect(text(next)).toMatch(/^À demander en (anglais|français) : /);

			const deck = await createDeck(db, bob, capitals);
			await cards.create(bob, deck.id, { sideA: 'Suisse', sideB: 'Berne' }, 'web', t0);
			const subject = await call(await connect(bob, echo, deck), 'next_review');
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
