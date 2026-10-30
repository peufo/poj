import { McpServer, type CallToolResult } from '@modelcontextprotocol/server';
import * as z from 'zod';
import {
	directionFaces,
	directionLabel,
	faces,
	NO_DECK,
	type DeckFaces,
	type Face
} from '#lib/format/decks.js';
import { plural } from '#lib/format/labels.js';
import {
	CARD_LIMITS,
	ConflictError,
	directionsOf,
	duplicateSide,
	findDeckByName,
	formatRelative,
	languagePair,
	NotFoundError,
	resolveDeck,
	type CardInput,
	type CardsService,
	type Deck,
	type DeckWithCount,
	type Rating,
	type ReviewsService,
	type Suggestion,
	type TranslationFailure,
	type TranslationService
} from '#lib/server/domain/index.js';

/**
 * Dépendances du serveur MCP : un propriétaire déjà authentifié, ses decks et les services
 * du domaine.
 */
export interface PojMcpDeps {
	ownerId: string;
	/** Decks non supprimés du propriétaire, du plus ancien au plus récent. */
	decks: DeckWithCount[];
	/** Page de création d'un deck, proposée quand l'utilisateur n'en a aucun. */
	newDeckUrl: string;
	cards: CardsService;
	reviews: ReviewsService;
	translation: TranslationService;
	/** Horloge, injectable pour les tests. */
	now?: () => Date;
}

/** Erreur d'outil de capture sans deck : la carte n'aurait nulle part où aller. */
const noDeckMessage = (newDeckUrl: string) =>
	`L'utilisateur n'a encore aucun deck : aucune carte ne peut être créée. Invite-le à créer un deck sur ${newDeckUrl}, puis recommence.`;

const quote = (text: string) => `« ${text} »`;

const isLanguage = (deck: Pick<DeckFaces, 'kind'>) => deck.kind === 'language';

const REVIEW_RULE =
	"Révision : next_review, puis dis le prompt sans jamais lire la réponse attendue avant sa réponse. S'il demande un indice, appelle get_hint. Donne ensuite la réponse attendue, annonce la note retenue, appelle submit_review, puis enchaîne avec la carte suivante. S'il conteste la note, appelle amend_review sur la carte précédente.";
const RATING_RULE =
	'Notes : propose again, hard ou good en tolérant synonymes et approximations. Ne propose jamais easy : ne l’utilise que si l’utilisateur le demande explicitement (« trop facile »).';
const VOICE_RULE =
	"L'utilisateur révise souvent en voiture, à la voix : réponses brèves, pas de listes longues.";

/** « le français (side_a), l’anglais (side_b) » : les faces d'un deck et leurs clés. */
function sidesOf(deck: DeckFaces): string {
	const { a, b } = faces(deck);
	return `${a.the} (side_a), ${b.the} (side_b)`;
}

/** Consignes du serveur pour un seul deck (ou aucun), rendues avec ses faces. */
function singleDeckInstructions(deck: DeckFaces): string {
	const language = isLanguage(deck);
	const { a, b } = faces(deck);
	const subject = language ? `des expressions en ${b.name}` : `des cartes ${a.the} / ${b.the}`;
	const directions = deck.bothDirections
		? 'elle se révise dans les deux sens'
		: `elle se révise de ${a.the} vers ${b.the} seulement`;
	const capture = language
		? 'Capture : appelle toujours check_card avant create_card. Si DeepL diverge de ta proposition ou signale un doublon, expose les options et laisse-le trancher. Relis-lui la carte finale et attends sa confirmation explicite avant create_card.'
		: "Capture : appelle toujours check_card avant create_card. Ce deck n'a pas de second avis DeepL : vérifie toi-même l'exactitude de la carte, et signale un doublon s'il y en a. Relis-lui la carte finale et attends sa confirmation explicite avant create_card.";

	return `Poj aide l'utilisateur à retenir ${subject} par répétition espacée. Chaque carte associe ${sidesOf(deck)} et un contexte d'origine facultatif ; ${directions}.

Règles :
- Parle français avec l'utilisateur${language ? `, sauf pour les expressions en ${b.name} elles-mêmes` : ''}.
- ${capture}
- ${REVIEW_RULE}
- ${RATING_RULE}
- ${VOICE_RULE}`;
}

/** « « Capitales » (sujet) : « Pays » (side_a), « Capitale » (side_b), de « Pays » vers « Capitale » seulement » */
function deckLine(deck: Deck): string {
	const { a, b } = faces(deck);
	const directions = deck.bothDirections
		? 'dans les deux sens'
		: `de ${a.the} vers ${b.the} seulement`;
	return `${quote(deck.name)} (${isLanguage(deck) ? 'langue' : 'sujet'}) : ${sidesOf(deck)}, révisé ${directions}`;
}

/** Consignes du serveur pour plusieurs decks : Claude choisit le deck de chaque carte. */
function multiDeckInstructions(decks: readonly Deck[]): string {
	const languages = decks.some(isLanguage);
	const subjects = !decks.every(isLanguage);
	const checks = [
		languages &&
			'Deck de langue : si DeepL diverge de ta proposition ou signale un doublon, expose les options et laisse-le trancher.',
		subjects &&
			"Deck de sujet : pas de second avis DeepL, vérifie toi-même l'exactitude de la carte, et signale un doublon s'il y en a."
	].filter(Boolean);

	return `Poj aide l'utilisateur à retenir ses cartes par répétition espacée. Chaque carte appartient à un deck et associe une face A (side_a), une face B (side_b) et un contexte d'origine facultatif. Ses decks :
${decks.map((deck) => `- ${deckLine(deck)}.`).join('\n')}

Règles :
- Parle français avec l'utilisateur${languages ? ', sauf pour les expressions étrangères elles-mêmes' : ''}.
- Choix du deck : déduis le deck de chaque carte (langue de l'expression, sujet) et passe son nom en deck à check_card et create_card. En cas de doute, demande-le-lui en une question courte. Garde ensuite ce deck pour les cartes suivantes, sauf indice contraire. list_decks liste les decks.
- Capture : appelle toujours check_card avant create_card. ${checks.join(' ')} Relis-lui toujours la carte finale, avec son deck, et attends sa confirmation explicite avant create_card.
- Révision : « on révise » mélange tous les decks, appelle next_review sans deck. Ne passe deck que s'il nomme un deck, et repasse le même à submit_review et amend_review.
- ${REVIEW_RULE}
- ${RATING_RULE}
- ${VOICE_RULE}`;
}

/** Descriptions de check_card et create_card pour un seul deck (ou aucun), avec ses faces. */
function singleDeckToolTexts(deck: DeckFaces): { check: string; create: string } {
	const pair = languagePair(deck);
	const { a, b } = faces(deck);
	const sameFace = `avec ${(duplicateSide(deck) === 'sideA' ? a : b).same}`;
	return {
		check: pair
			? `À appeler avant chaque create_card, avec la carte que tu proposes. Renvoie les traductions DeepL dans les deux sens (en tenant compte du contexte) et les cartes existantes ${sameFace}. Si DeepL diverge de ta proposition, expose les options à l'utilisateur et laisse-le trancher. Si deepl_error est présent, signale-le : l'utilisateur décide de créer quand même ou non. Ne modifie rien.`
			: `À appeler avant chaque create_card, avec la carte que tu proposes. Renvoie les cartes existantes ${sameFace}. Ce deck n'a pas de second avis DeepL (deepl_a_to_b et deepl_b_to_a sont nuls) : vérifie toi-même la carte et relis-la avec l'utilisateur. Ne modifie rien.`,
		create: `Crée une carte et ${directionsOf(deck).length > 1 ? 'ses deux révisions, dues' : 'sa révision, due'} immédiatement. Avant de l'appeler : appelle toujours check_card ; ${pair ? 'si DeepL diverge, expose les options et laisse-le trancher' : 'vérifie toi-même la carte, ce deck n’a pas de second avis DeepL'} ; relis-lui la carte finale (${a.name}, ${b.name}, contexte) et attends sa confirmation explicite. Rejouer le même appel dans les 10 minutes renvoie la carte déjà créée sans doublon.`
	};
}

/** Descriptions de check_card et create_card quand l'utilisateur a plusieurs decks. */
const MULTI_DECK_TOOL_TEXTS = {
	check:
		"À appeler avant chaque create_card, avec la carte que tu proposes et son deck (déduis-le de la carte, ou demande-le en cas de doute). Deck de langue : renvoie les traductions DeepL dans les deux sens (en tenant compte du contexte) ; si DeepL diverge de ta proposition, expose les options à l'utilisateur et laisse-le trancher ; si deepl_error est présent, signale-le : l'utilisateur décide de créer quand même ou non. Deck de sujet : pas de second avis DeepL (deepl_a_to_b et deepl_b_to_a sont nuls), vérifie toi-même la carte. Renvoie aussi les cartes existantes du deck avec la même face (B pour une langue, A pour un sujet). Ne modifie rien.",
	create:
		"Crée une carte dans le deck indiqué, et ses révisions, dues immédiatement (une seule, de A vers B, dans un deck à sens unique). Avant de l'appeler : appelle toujours check_card avec le même deck ; pour un deck de langue, si DeepL diverge, expose les options et laisse-le trancher ; pour un sujet, vérifie toi-même la carte ; relis-lui la carte finale (deck, faces, contexte) et attends sa confirmation explicite. Rejouer le même appel dans les 10 minutes renvoie la carte déjà créée sans doublon."
};

/** Nom d'un deck, tel que Claude le passe aux outils. */
const deckNameSchema = z.string().trim().min(1).optional();

const ratingSchema = z
	.enum(['again', 'hard', 'good', 'easy'])
	.describe(
		'again : faux ou inconnu ; hard : juste avec indice ou hésitation ; good : juste ; easy : trop facile, seulement sur demande explicite.'
	);

/** Message d'un champ trop long, pour que Claude raccourcisse et réessaie. */
const tooLong = (max: number) => `${max} caractères au plus : raccourcis le texte.`;

/** « Texte en anglais de la carte », ou « Face « Pays » de la carte » pour un sujet. */
const fieldOf = (face: Face) =>
	face.lang ? `Texte en ${face.name} de la carte` : `Face ${face.the} de la carte`;

/** Champ `deck` des outils de capture : le nom du deck, avec la correspondance des faces. */
function captureDeckField(decks: readonly Deck[]) {
	const description =
		decks.length > 1
			? `Nom du deck de la carte, obligatoire : l'utilisateur a plusieurs decks. Déduis-le de la carte (langue de l'expression, sujet), ou demande-le en cas de doute. Decks : ${decks.map((deck) => `${quote(deck.name)} : ${sidesOf(deck)}`).join(' ; ')}.`
			: decks.length === 1
				? `Nom du deck de la carte, facultatif : l'utilisateur n'a qu'un deck, ${quote(decks[0].name)}.`
				: 'Nom du deck de la carte.';
	return deckNameSchema.describe(description);
}

/**
 * Entrée des outils de capture. Avec un seul deck (ou aucun), `shape`, les faces sont
 * nommées d'après lui ; avec plusieurs (`null`), le champ `deck` donne la correspondance.
 */
function cardInputSchema(shape: DeckFaces | null, decks: readonly Deck[]) {
	const sides = shape && faces(shape);
	return z.object({
		side_a: z
			.string()
			.trim()
			.min(1)
			.max(CARD_LIMITS.sideA, tooLong(CARD_LIMITS.sideA))
			.describe(
				sides
					? `${fieldOf(sides.a)}.`
					: 'Face A de la carte, selon le deck : texte dans la langue connue (deck de langue) ou première face (sujet).'
			),
		side_b: z
			.string()
			.trim()
			.min(1)
			.max(CARD_LIMITS.sideB, tooLong(CARD_LIMITS.sideB))
			.describe(
				sides
					? `${fieldOf(sides.b)}${sides.b.lang ? ' (mot ou phrase entière)' : ''}.`
					: 'Face B de la carte, selon le deck : texte dans la langue apprise, mot ou phrase entière (deck de langue), ou seconde face (sujet).'
			),
		context: z
			.string()
			.max(CARD_LIMITS.context, tooLong(CARD_LIMITS.context))
			.nullish()
			.describe("Contexte d'origine facultatif (où, quand, avec qui l'expression a été entendue)."),
		deck: captureDeckField(decks)
	});
}

const toCardInput = (input: {
	side_a: string;
	side_b: string;
	context?: string | null;
}): CardInput => ({ sideA: input.side_a, sideB: input.side_b, context: input.context });

const cardOutput = (card: {
	id: string;
	sideA: string;
	sideB: string;
	context: string | null;
}) => ({
	card_id: card.id,
	side_a: card.sideA,
	side_b: card.sideB,
	context: card.context
});

const reviewIdSchema = z.uuid().describe('review_id renvoyé par next_review.');

const failureLabels: Record<TranslationFailure, string> = {
	not_configured: "DeepL n'est pas configuré",
	auth: 'la clé DeepL est refusée',
	quota: 'le quota DeepL est épuisé',
	unavailable: 'DeepL est indisponible'
};

function describeCard(card: { sideA: string; sideB: string; context: string | null }) {
	const base = `${quote(card.sideA)} = ${quote(card.sideB)}`;
	return card.context ? `${base}, contexte ${quote(card.context)}` : base;
}

/** Résultat d'outil : un texte court pour la voix et le même contenu structuré. */
function result<T extends Record<string, unknown>>(text: string, structured: T): CallToolResult {
	return { content: [{ type: 'text', text }], structuredContent: structured };
}

function toolError(text: string): CallToolResult {
	return { content: [{ type: 'text', text }], isError: true };
}

/** Vrai pour un résultat d'erreur renvoyé à la place d'un deck. */
const isToolResult = (value: Deck | CallToolResult | undefined): value is CallToolResult =>
	value !== undefined && 'content' in value;

const REVIEW_NOT_FOUND =
	'Révision introuvable (carte supprimée ou identifiant erroné). Appelle next_review pour continuer.';

/** Traduit les erreurs du domaine en résultats d'erreur lisibles par Claude. */
async function guard(
	run: () => Promise<CallToolResult>,
	conflict: string
): Promise<CallToolResult> {
	try {
		return await run();
	} catch (error) {
		if (error instanceof NotFoundError) return toolError(REVIEW_NOT_FOUND);
		if (error instanceof ConflictError) return toolError(conflict);
		throw error;
	}
}

export function createPojMcpServer({
	ownerId,
	decks,
	newDeckUrl,
	cards,
	reviews,
	translation,
	now = () => new Date()
}: PojMcpDeps): McpServer {
	const several = decks.length > 1;
	// Avec un seul deck (ou aucun, faces neutres), les textes nomment ses faces.
	const shape = several ? null : (decks[0] ?? NO_DECK);
	const noDeck = noDeckMessage(newDeckUrl);
	const names = decks.length > 0 ? decks.map((deck) => quote(deck.name)).join(', ') : 'aucun';
	const server = new McpServer(
		{ name: 'poj', version: '1.0.0' },
		{
			instructions: shape
				? singleDeckInstructions(shape) + (decks.length === 0 ? `\n\n${noDeck}` : '')
				: multiDeckInstructions(decks)
		}
	);
	const cardInput = cardInputSchema(shape, decks);
	const toolTexts = shape ? singleDeckToolTexts(shape) : MULTI_DECK_TOOL_TEXTS;

	/** « dans « Anglais » » quand l'utilisateur a plusieurs decks, sinon rien. */
	const inDeck = (deck: Pick<Deck, 'name'>) => (several ? ` dans ${quote(deck.name)}` : '');
	/** Ligne d'en-tête « Deck « Anglais ». » quand l'utilisateur a plusieurs decks. */
	const deckHeader = (deck: Pick<Deck, 'name'>) => (several ? [`Deck ${quote(deck.name)}.`] : []);

	const unknownDeck = (name: string) =>
		toolError(`Deck ${quote(name)} introuvable. Decks de l'utilisateur : ${names}.`);

	/** Deck nommé, ou erreur d'outil qui liste les decks de l'utilisateur. */
	const namedDeck = (name: string): Deck | CallToolResult =>
		findDeckByName(decks, name) ?? unknownDeck(name);

	/**
	 * Deck d'une carte capturée : celui nommé, ou le seul deck de l'utilisateur. Avec
	 * plusieurs decks, Claude doit le nommer : il le déduit ou le demande.
	 */
	function captureDeck(name: string | undefined): Deck | CallToolResult {
		const choice = resolveDeck(decks, name === undefined ? undefined : { name });
		switch (choice.status) {
			case 'none':
				return toolError(noDeck);
			case 'unknown':
				return unknownDeck(choice.request.name);
			case 'several':
				return toolError(
					`L'utilisateur a plusieurs decks (${names}) : passe le nom du deck en deck. Déduis-le de la carte, ou demande-le-lui en cas de doute.`
				);
			case 'found':
				return choice.deck;
		}
	}

	const reviewDeckField = deckNameSchema.describe(
		`Nom d'un deck, seulement si l'utilisateur en nomme un : la session se limite alors à ce deck. Sans deck, elle mélange tous les decks (${names}).`
	);
	const sessionDeckField = deckNameSchema.describe(
		"Le deck passé à next_review, s'il y en avait un : remaining est alors compté dans ce deck (tous les decks si le nom est inconnu)."
	);

	/** Révisions encore dues (du deck de la session), mise de côté du sens inverse comprise. */
	async function remainingDue(at: Date, deckId?: string): Promise<number> {
		const next = await reviews.next(ownerId, at, { deckId });
		return next.review ? next.remaining : 0;
	}

	server.registerTool(
		'list_decks',
		{
			title: 'Lister les decks',
			description:
				"Liste les decks de l'utilisateur : nom, type (langue ou sujet), faces, langues et nombre de cartes. Le nom se passe en deck aux autres outils. Ne modifie rien.",
			inputSchema: z.object({}),
			outputSchema: z.object({
				decks: z.array(
					z.object({
						name: z.string(),
						kind: z.enum(['language', 'subject']),
						side_a: z.string(),
						side_b: z.string(),
						language_a: z.string().nullable(),
						language_b: z.string().nullable(),
						both_directions: z.boolean(),
						card_count: z.number()
					})
				)
			}),
			annotations: { readOnlyHint: true, openWorldHint: false }
		},
		async () => {
			if (decks.length === 0) return result(noDeck, { decks: [] });
			const lines = decks.map(
				(deck) =>
					`${quote(deck.name)} : ${isLanguage(deck) ? 'langue' : 'sujet'}, ${directionLabel('a_to_b', deck)}${deck.bothDirections ? ' (deux sens)' : ''}, ${plural(deck.cardCount, 'carte')}.`
			);
			return result(lines.join('\n'), {
				decks: decks.map((deck) => {
					const { a, b } = faces(deck);
					return {
						name: deck.name,
						kind: deck.kind,
						side_a: a.label,
						side_b: b.label,
						language_a: deck.languageA,
						language_b: deck.languageB,
						both_directions: deck.bothDirections,
						card_count: deck.cardCount
					};
				})
			});
		}
	);

	server.registerTool(
		'check_card',
		{
			title: 'Vérifier une carte',
			description: toolTexts.check,
			inputSchema: cardInput,
			outputSchema: z.object({
				deck: z.string(),
				deepl_a_to_b: z.string().nullable(),
				deepl_b_to_a: z.string().nullable(),
				deepl_error: z.string().optional(),
				duplicates: z.array(
					z.object({
						card_id: z.string(),
						side_a: z.string(),
						side_b: z.string(),
						context: z.string().nullable()
					})
				)
			}),
			annotations: { readOnlyHint: true, openWorldHint: decks.some(isLanguage) }
		},
		async (input) => {
			const deck = captureDeck(input.deck);
			if (isToolResult(deck)) return deck;
			const pair = languagePair(deck);
			const { a, b } = faces(deck);
			const proposed = toCardInput(input);
			const [check, duplicates] = await Promise.all([
				pair && translation.check(pair, proposed),
				cards.findDuplicates(ownerId, deck, proposed)
			]);
			const text = (s: Suggestion | undefined) => (s?.ok ? s.text : null);
			const failure = check && [check.aToB, check.bToA].find((s) => !s.ok);
			const deeplError = failure && !failure.ok ? failureLabels[failure.reason] : undefined;

			const lines: string[] = [];
			lines.push(...deckHeader(deck));
			if (!check) lines.push('Pas de second avis DeepL pour ce deck.');
			if (check?.aToB.ok) {
				lines.push(`DeepL, ${a.name} vers ${b.name} : ${quote(check.aToB.text)}.`);
			}
			if (check?.bToA.ok) {
				lines.push(`DeepL, ${b.name} vers ${a.name} : ${quote(check.bToA.text)}.`);
			}
			if (deeplError) lines.push(`DeepL : ${deeplError}.`);
			lines.push(
				duplicates.length === 0
					? 'Aucun doublon.'
					: `Doublon${duplicates.length > 1 ? 's' : ''} : ${duplicates.map(describeCard).join(' ; ')}.`
			);

			return result(lines.join('\n'), {
				deck: deck.name,
				deepl_a_to_b: text(check?.aToB),
				deepl_b_to_a: text(check?.bToA),
				...(deeplError && { deepl_error: deeplError }),
				duplicates: duplicates.map(cardOutput)
			});
		}
	);

	server.registerTool(
		'create_card',
		{
			title: 'Créer une carte',
			description: toolTexts.create,
			inputSchema: cardInput,
			outputSchema: z.object({
				card_id: z.string(),
				created: z.boolean(),
				deck: z.string(),
				side_a: z.string(),
				side_b: z.string(),
				context: z.string().nullable()
			}),
			annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false }
		},
		async (input) => {
			const deck = captureDeck(input.deck);
			if (isToolResult(deck)) return deck;
			const { card, created } = await cards.createOnce(
				ownerId,
				deck.id,
				toCardInput(input),
				'claude',
				now()
			);
			const summary = describeCard(card);
			return result(
				created
					? `Carte créée${inDeck(deck)} : ${summary}.`
					: `Carte déjà créée${inDeck(deck)} il y a moins de 10 minutes, rien d'ajouté : ${summary}.`,
				{ ...cardOutput(card), created, deck: deck.name }
			);
		}
	);

	server.registerTool(
		'next_review',
		{
			title: 'Prochaine révision',
			description:
				"Renvoie la prochaine révision due : dis le prompt à l'utilisateur, mais ne lis jamais expected avant sa réponse. Le contexte n'est pas fourni ici : s'il demande un indice, appelle get_hint. Garde review_id et version pour submit_review. Si rien n'est dû (nothing_due), annonce la prochaine échéance et propose de réviser en avance en rappelant l'outil avec ahead à true. Sans deck, la session mélange tous les decks : ne passe deck que si l'utilisateur en nomme un, et repasse-le à submit_review.",
			inputSchema: z.object({
				ahead: z
					.boolean()
					.optional()
					.describe('true pour réviser en avance les prochaines révisions quand rien n’est dû.'),
				deck: reviewDeckField
			}),
			outputSchema: z.object({
				nothing_due: z.boolean(),
				review_id: z.string().optional(),
				deck: z.string().optional(),
				direction: z.enum(['a_to_b', 'b_to_a']).optional(),
				prompt: z.string().optional(),
				expected: z.string().optional(),
				has_hint: z.boolean().optional(),
				version: z.string().optional(),
				remaining: z.number().optional(),
				next_due: z.string().nullable().optional(),
				next_due_in: z.string().nullable().optional()
			}),
			annotations: { readOnlyHint: true, openWorldHint: false }
		},
		async ({ ahead = false, deck: deckName }) => {
			const scope = deckName === undefined ? undefined : namedDeck(deckName);
			if (isToolResult(scope)) return scope;
			const at = now();
			const next = await reviews.next(ownerId, at, { ahead, deckId: scope?.id });

			if (!next.review) {
				const nextDueIn = next.nextDue && formatRelative(next.nextDue, at);
				const where = scope ? ` dans ${quote(scope.name)}` : '';
				return result(
					nextDueIn
						? `Rien à réviser${where} pour l'instant. Prochaine révision ${nextDueIn}.`
						: `Aucune carte à réviser${where}.`,
					{
						nothing_due: true,
						next_due: next.nextDue?.toISOString() ?? null,
						next_due_in: nextDueIn
					}
				);
			}

			const { review, remaining } = next;
			const { from, to } = directionFaces(review.direction, review.deck);
			const lines = [
				...deckHeader(review.deck),
				to.lang
					? `À demander en ${to.name} : ${quote(review.prompt)}.`
					: `À demander (${from.label} → ${to.label}) : ${quote(review.prompt)}.`,
				`Réponse attendue, à ne pas lire avant sa réponse : ${quote(review.expected)}.`,
				review.hasHint ? 'Indice disponible.' : 'Pas d’indice.',
				`Encore ${remaining} due${remaining > 1 ? 's' : ''}.`,
				`review_id : ${review.id} ; version : ${review.version}`
			];
			return result(lines.join('\n'), {
				nothing_due: false,
				review_id: review.id,
				deck: review.deck.name,
				direction: review.direction,
				prompt: review.prompt,
				expected: review.expected,
				has_hint: review.hasHint,
				version: review.version,
				remaining
			});
		}
	);

	server.registerTool(
		'get_hint',
		{
			title: 'Indice',
			description:
				"Renvoie le contexte d'origine de la carte en cours, à appeler seulement si l'utilisateur demande un indice. Le serveur mémorise la demande : la note de cette révision sera plafonnée à hard.",
			inputSchema: z.object({ review_id: reviewIdSchema }),
			outputSchema: z.object({ context: z.string().nullable() }),
			annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false }
		},
		({ review_id }) =>
			guard(async () => {
				const { context } = await reviews.requestHint(ownerId, review_id, now());
				return result(
					context ? `Indice : ${quote(context)}.` : 'Pas de contexte pour cette carte.',
					{
						context
					}
				);
			}, REVIEW_NOT_FOUND)
	);

	const answerOutput = z.object({
		review_id: z.string(),
		rating: ratingSchema,
		capped: z.boolean(),
		next_due: z.string(),
		next_due_in: z.string(),
		context: z.string().nullable(),
		remaining: z.number()
	});

	server.registerTool(
		'submit_review',
		{
			title: 'Enregistrer la note',
			description:
				"Enregistre la note de la révision en cours, avec review_id et version tels que renvoyés par next_review. Propose again, hard ou good d'après la réponse de l'utilisateur, en tolérant synonymes et approximations. N'utilise easy que si l'utilisateur le demande explicitement. Après un indice, le serveur plafonne la note à hard. Annonce la note retenue et la prochaine échéance, évoque le contexte en renforcement si c'est utile, puis enchaîne avec next_review.",
			inputSchema: z.object({
				review_id: reviewIdSchema,
				version: z.string().describe('version renvoyée par next_review.'),
				rating: ratingSchema,
				deck: sessionDeckField
			}),
			outputSchema: answerOutput.extend({ replayed: z.boolean() }),
			annotations: {
				readOnlyHint: false,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: false
			}
		},
		({ review_id, version, rating, deck }) =>
			guard(async () => {
				const at = now();
				const answer = await reviews.answer(
					ownerId,
					review_id,
					{ rating, version, origin: 'claude' },
					at
				);
				return answerResult(answer, rating, at, deck, { replayed: answer.replayed });
			}, 'Cette révision a été modifiée entre-temps : rien n’a été enregistré. Appelle next_review pour continuer.')
	);

	server.registerTool(
		'amend_review',
		{
			title: 'Corriger la dernière note',
			description:
				"Remplace la dernière note enregistrée d'une révision, quand l'utilisateur la conteste après submit_review (« non, compte-la fausse »). Seule la dernière réponse est corrigeable, et seulement dans l'heure qui suit. Le plafond à hard après un indice s'applique toujours. N'utilise easy que si l'utilisateur le demande explicitement.",
			inputSchema: z.object({
				review_id: reviewIdSchema,
				rating: ratingSchema,
				deck: sessionDeckField
			}),
			outputSchema: answerOutput.extend({ changed: z.boolean() }),
			annotations: {
				readOnlyHint: false,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: false
			}
		},
		({ review_id, rating, deck }) =>
			guard(async () => {
				const at = now();
				const answer = await reviews.amend(ownerId, review_id, rating, at);
				return answerResult(answer, rating, at, deck, { changed: answer.changed });
			}, "Impossible de corriger cette note : seule la dernière réponse d'une révision se corrige, dans l'heure qui suit.")
	);

	async function answerResult(
		answer: { reviewId: string; rating: Rating; due: Date; context: string | null },
		requested: Rating,
		at: Date,
		/** Deck de la session : `remaining` y est compté, ou dans tous les decks s'il est inconnu. */
		deckName: string | undefined,
		{ replayed, changed }: { replayed?: boolean; changed?: boolean } = {}
	): Promise<CallToolResult> {
		const scope = deckName === undefined ? undefined : findDeckByName(decks, deckName);
		const remaining = await remainingDue(at, scope?.id);
		const capped = !replayed && answer.rating !== requested;
		const nextDueIn = formatRelative(answer.due, at);

		const lines = [
			replayed
				? `Déjà enregistrée, rien n'a été appliqué une seconde fois. Note : ${answer.rating}.`
				: changed === false
					? `Note inchangée : c'était déjà ${answer.rating}${capped ? ' (plafonnée à hard, car un indice a été demandé)' : ''}. Rien n'a été modifié.`
					: capped
						? `Note plafonnée à ${answer.rating}, car un indice a été demandé.`
						: `Note retenue : ${answer.rating}.`,
			`Prochaine révision ${nextDueIn}.`,
			...(answer.context ? [`Contexte : ${quote(answer.context)}.`] : []),
			remaining === 0 ? 'Plus rien de dû.' : `Encore ${remaining} due${remaining > 1 ? 's' : ''}.`
		];
		return result(lines.join('\n'), {
			review_id: answer.reviewId,
			rating: answer.rating,
			capped,
			next_due: answer.due.toISOString(),
			next_due_in: nextDueIn,
			context: answer.context,
			remaining,
			...(replayed !== undefined && { replayed }),
			...(changed !== undefined && { changed })
		});
	}

	return server;
}
