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
	at,
	CARD_LIMITS,
	ConflictError,
	directionsOf,
	duplicateSide,
	findDeckByName,
	formatRelative,
	diverges,
	languagePair,
	MAX_BATCH_CARDS,
	NotFoundError,
	resetsProgress,
	resolveDeck,
	type BatchResult,
	type CardInput,
	type CardsService,
	type Deck,
	type DeckWithCount,
	type NextReview,
	type Rating,
	type ReviewsService,
	type Suggestion,
	type TranslationFailure,
	type TranslationService
} from '#lib/server/domain/index.js';
import {
	BATCH_CONFIRMATION,
	BATCH_FACT_CHECK,
	BATCH_SUMMARY,
	batchRule,
	CHECK_EDIT,
	CORRECTION_RULE,
	DECK_CHOICE_RULE,
	EDIT_ON_REQUEST,
	EDIT_RULE,
	END_RULE,
	FACT_CHECK,
	FACT_RULE,
	FACT_SOURCE,
	HESITATION_RULE,
	INSPIRATION_RULE,
	isLanguage,
	LAST_CARD_LINE,
	NOT_RECORDED,
	OFFER_RULE,
	quote,
	RATING_RULE,
	REAL_SITUATION,
	RETRY_LINE,
	REVIEW_RULE,
	ruleList,
	SESSION_OVER_LINE,
	VOICE_RULE
} from './guidance';
import { registerPrompts } from './prompts';

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

/** Règles communes à toutes les consignes, après celles de la capture. */
const SHARED_RULES = [
	INSPIRATION_RULE,
	OFFER_RULE,
	REVIEW_RULE,
	HESITATION_RULE,
	CORRECTION_RULE,
	RATING_RULE,
	END_RULE,
	EDIT_RULE,
	VOICE_RULE
];

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
${ruleList([
	`Parle français avec l'utilisateur${language ? `, sauf pour les expressions en ${b.name} elles-mêmes` : ''}.`,
	capture,
	!language && FACT_RULE,
	batchRule(!language),
	...SHARED_RULES
])}`;
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
${ruleList([
	`Parle français avec l'utilisateur${languages ? ', sauf pour les expressions étrangères elles-mêmes' : ''}.`,
	DECK_CHOICE_RULE,
	`Capture : appelle toujours check_card avant create_card. ${checks.join(' ')} Relis-lui toujours la carte finale, avec son deck, et attends sa confirmation explicite avant create_card.`,
	subjects && FACT_RULE,
	batchRule(subjects),
	"Révision : « on révise » mélange tous les decks, appelle review sans deck. Ne passe deck que s'il nomme un deck, et repasse le même à chaque appel de review et à amend_review.",
	...SHARED_RULES
])}`;
}

/** Fin de la phrase « À appeler avant chaque create_card… » des descriptions de check_card. */
const CHECK_BEFORE_EDIT = `, et avant chaque update_card qui change une face (${CHECK_EDIT})`;

/** Descriptions de check_card et create_card pour un seul deck (ou aucun), avec ses faces. */
function singleDeckToolTexts(deck: DeckFaces): { check: string; create: string } {
	const pair = languagePair(deck);
	const { a, b } = faces(deck);
	const sameFace = `avec ${(duplicateSide(deck) === 'sideA' ? a : b).same}`;
	return {
		check: pair
			? `${REAL_SITUATION} À appeler avant chaque create_card, avec la carte que tu proposes${CHECK_BEFORE_EDIT}. Renvoie les traductions DeepL dans les deux sens (en tenant compte du contexte) et les cartes existantes ${sameFace}. Si DeepL diverge de ta proposition, expose les options à l'utilisateur et laisse-le trancher. Si deepl_error est présent, signale-le : l'utilisateur décide de créer quand même ou non. Ne modifie rien.`
			: `${REAL_SITUATION} À appeler avant chaque create_card, avec la carte que tu proposes${CHECK_BEFORE_EDIT}. Renvoie les cartes existantes ${sameFace}. Ce deck n'a pas de second avis DeepL (deepl_a_to_b et deepl_b_to_a sont nuls) : vérifie toi-même la carte et relis-la avec l'utilisateur. Dans ce deck de sujet, ${FACT_CHECK} Ne modifie rien.`,
		create: `Crée une carte et ${directionsOf(deck).length > 1 ? 'ses deux révisions, dues' : 'sa révision, due'} immédiatement. Avant de l'appeler : appelle toujours check_card ; ${pair ? 'si DeepL diverge, expose les options et laisse-le trancher' : `vérifie toi-même la carte, ce deck n’a pas de second avis DeepL ; ${FACT_SOURCE}`} ; relis-lui la carte finale (${a.name}, ${b.name}, contexte) et attends sa confirmation explicite. Rejouer le même appel dans les 10 minutes renvoie la carte déjà créée sans doublon.`
	};
}

/** Descriptions de check_card et create_card quand l'utilisateur a plusieurs decks. */
const MULTI_DECK_TOOL_TEXTS = {
	check: `${REAL_SITUATION} À appeler avant chaque create_card, avec la carte que tu proposes et son deck (déduis-le de la carte, ou demande-le en cas de doute)${CHECK_BEFORE_EDIT}. Deck de langue : renvoie les traductions DeepL dans les deux sens (en tenant compte du contexte) ; si DeepL diverge de ta proposition, expose les options à l'utilisateur et laisse-le trancher ; si deepl_error est présent, signale-le : l'utilisateur décide de créer quand même ou non. Deck de sujet : pas de second avis DeepL (deepl_a_to_b et deepl_b_to_a sont nuls), vérifie toi-même la carte ; ${FACT_CHECK} Renvoie aussi les cartes existantes du deck avec la même face (B pour une langue, A pour un sujet). Ne modifie rien.`,
	create: `Crée une carte dans le deck indiqué, et ses révisions, dues immédiatement (une seule, de A vers B, dans un deck à sens unique). Avant de l'appeler : appelle toujours check_card avec le même deck ; pour un deck de langue, si DeepL diverge, expose les options et laisse-le trancher ; pour un sujet, vérifie toi-même la carte : ${FACT_SOURCE} ; relis-lui la carte finale (deck, faces, contexte) et attends sa confirmation explicite. Rejouer le même appel dans les 10 minutes renvoie la carte déjà créée sans doublon.`
};

/**
 * Descriptions de check_cards et create_cards, selon que l'ajout peut viser un deck de
 * langue (`languages`) ou de sujet (`subjects`).
 */
function batchToolTexts(languages: boolean, subjects: boolean): { check: string; create: string } {
	return {
		check: `${REAL_SITUATION} Vérifie un lot de cartes d'un même deck (${MAX_BATCH_CARDS} au plus par appel) avant create_cards, au lieu d'appeler check_card pour chaque carte. Ne renvoie que les problèmes, repérés par leur position dans le lot (à partir de 1) : doublons (dans le lot, ou déjà dans le deck) et cartes déjà créées il y a moins de 10 minutes${languages ? ". Deck de langue : divergences DeepL, quand ni la traduction de la face A ni celle de la face B ne correspondent à la carte ; si deepl_error est présent, signale-le : l'utilisateur décide de créer quand même ou non" : ''}.${subjects ? ` Deck de sujet : pas de second avis DeepL ; ${BATCH_FACT_CHECK}` : ''} Ensuite, ${BATCH_SUMMARY}. Ne modifie rien.`,
		create: `Crée un lot de cartes dans un même deck (${MAX_BATCH_CARDS} au plus par appel), et leurs révisions : les nouvelles cartes sont présentées au fil des jours, dans la limite quotidienne du deck, dans l'ordre du lot. ${BATCH_CONFIRMATION} Les doublons (dans le lot, ou déjà dans le deck) ne sont pas créés : skipped les liste ; pour en garder un quand même, passe par create_card. Tout ou rien : après une erreur, aucune carte n'est créée. Rejouer le même lot (après une erreur ou une coupure) ne recrée pas les cartes déjà créées.`
	};
}

/**
 * Description de update_card, selon que la carte peut être d'un deck de langue (`languages`)
 * ou de sujet (`subjects`).
 */
function updateToolText(languages: boolean, subjects: boolean): string {
	const checks = [
		languages && 'second avis DeepL pour une langue',
		subjects && `pour un sujet, ${FACT_SOURCE}`,
		'doublons'
	].filter(Boolean);
	return `Modifie les faces ou le contexte d'une carte existante (card_id renvoyé par search_cards), ${EDIT_ON_REQUEST} Passe seulement ce qui change : un champ absent reste inchangé, context à null ou vide le supprime. Modifier une face réinitialise la progression de la carte (ses révisions repartent de zéro, l'historique est conservé) ; modifier seulement le contexte la conserve. Avant de l'appeler : si une face change, appelle check_card ${CHECK_EDIT} (${checks.join(' ; ')}) ; relis-lui la carte avant et après, préviens-le si sa progression sera réinitialisée, et attends sa confirmation explicite. La suppression d'une carte se fait sur le web.`;
}

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

/**
 * Champ `deck` des outils de capture : le nom du deck, avec la correspondance des faces.
 * `of` désigne ce qui va dans le deck : la carte, ou les cartes d'un lot.
 */
function captureDeckField(decks: readonly Deck[], of: 'card' | 'batch' = 'card') {
	const [what, from] = of === 'card' ? ['de la carte', 'de la carte'] : ['du lot', 'des cartes'];
	const [only] = decks;
	const description =
		decks.length > 1
			? `Nom du deck ${what}, obligatoire : l'utilisateur a plusieurs decks. Déduis-le ${from} (langue de l'expression, sujet), ou demande-le en cas de doute. Decks : ${decks.map((deck) => `${quote(deck.name)} : ${sidesOf(deck)}`).join(' ; ')}.`
			: only
				? `Nom du deck ${what}, facultatif : l'utilisateur n'a qu'un deck, ${quote(only.name)}.`
				: `Nom du deck ${what}.`;
	return deckNameSchema.describe(description);
}

/**
 * Champs d'une carte capturée. Avec un seul deck (ou aucun), `shape`, les faces sont nommées
 * d'après lui ; avec plusieurs (`null`), le champ `deck` donne la correspondance.
 */
function cardFields(shape: DeckFaces | null) {
	const sides = shape && faces(shape);
	return {
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
			.describe("Contexte d'origine facultatif (où, quand, avec qui l'expression a été entendue).")
	};
}

/** Entrée de check_card et create_card. */
const cardInputSchema = (shape: DeckFaces | null, decks: readonly Deck[]) =>
	z.object({ ...cardFields(shape), deck: captureDeckField(decks) });

const cardIdSchema = z.uuid();

/** Entrée de check_card : celle de create_card, et la carte à modifier s'il y en a une. */
const checkInputSchema = (shape: DeckFaces | null, decks: readonly Deck[]) =>
	cardInputSchema(shape, decks).extend({
		card_id: cardIdSchema
			.optional()
			.describe(
				"Pour vérifier la modification d'une carte existante : son card_id (search_cards). Son deck s'impose, elle n'est pas comptée parmi les doublons, un context absent reprend le sien, et progress_reset dit si la modification réinitialisera sa progression. Absent pour une nouvelle carte."
			)
	});

/** Champ facultatif de update_card : absent, la valeur actuelle de la carte est gardée. */
const unchangedIfAbsent = <T extends z.ZodType>(field: T) =>
	field.optional().describe(`${field.description ?? ''} Absent : inchangé.`.trim());

/** Entrée de update_card : seuls les champs passés changent. */
function updateInputSchema(shape: DeckFaces | null) {
	const { side_a, side_b, context } = cardFields(shape);
	return z.object({
		card_id: cardIdSchema.describe('card_id de la carte à modifier, renvoyé par search_cards.'),
		side_a: unchangedIfAbsent(side_a),
		side_b: unchangedIfAbsent(side_b),
		context: context.describe(
			"Nouveau contexte d'origine. Absent : inchangé ; null ou vide : supprimé. Pour un deck de sujet, garde sa ligne « Source : »."
		)
	});
}

/** Nombre maximal de cartes renvoyées par search_cards : une réponse courte, pour la voix. */
const SEARCH_LIMIT = 10;

/** Entrée de check_cards et create_cards : un lot plafonné, pour un seul deck. */
const batchInputSchema = (shape: DeckFaces | null, decks: readonly Deck[]) =>
	z.object({
		cards: z
			.array(z.object(cardFields(shape)))
			.min(1)
			.max(
				MAX_BATCH_CARDS,
				`${MAX_BATCH_CARDS} cartes au plus par appel : découpe le lot en plusieurs appels.`
			)
			.describe(
				`Cartes du lot, dans l'ordre où les présenter, ${MAX_BATCH_CARDS} au plus par appel.`
			),
		deck: captureDeckField(decks, 'batch')
	});

const toCardInput = (input: {
	side_a: string;
	side_b: string;
	context?: string | null;
}): CardInput => ({ sideA: input.side_a, sideB: input.side_b, context: input.context });

/** Carte modifiée : les champs passés, et ceux de la carte actuelle pour les autres. */
const editedCard = (
	current: { sideA: string; sideB: string; context: string | null },
	input: { side_a?: string; side_b?: string; context?: string | null }
): CardInput => ({
	sideA: input.side_a ?? current.sideA,
	sideB: input.side_b ?? current.sideB,
	context: input.context === undefined ? current.context : input.context
});

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

/** Carte existante, dans les sorties des outils de capture. */
const cardOutputSchema = z.object({
	card_id: z.string(),
	side_a: z.string(),
	side_b: z.string(),
	context: z.string().nullable()
});

/** Carte existante avec le nom de son deck, dans les sorties de search_cards et update_card. */
const deckCardOutputSchema = cardOutputSchema.extend({ deck: z.string() });

const deckCardOutput = (card: Parameters<typeof cardOutput>[0], deck: Pick<Deck, 'name'>) => ({
	...cardOutput(card),
	deck: deck.name
});

/** Carte d'un lot, repérée par sa position (à partir de 1). */
const batchCardOutput = { position: z.number(), side_a: z.string(), side_b: z.string() };

/** Carte d'un lot, telle que les sorties la repèrent. */
const batchCard = (input: CardInput, index: number) => ({
	position: index + 1,
	side_a: input.sideA,
	side_b: input.sideB
});

/** « n°3 « Suisse » = « Berne » » : une carte d'un lot, pour le texte des résultats. */
const batchLine = (input: CardInput, index: number) =>
	`n°${index + 1} ${describeCard({ ...input, context: null })}`;

const BATCH_FAILED =
	"Le lot n'a pas pu être créé : aucune carte n'a été ajoutée. Rejoue le même appel ; s'il échoue encore, dis-le à l'utilisateur.";

const reviewIdSchema = z.uuid().describe('review_id renvoyé par review.');

/** Carte à présenter, dans les cards de review. */
const reviewOutput = z.object({
	review_id: z.string(),
	deck: z.string(),
	direction: z.enum(['a_to_b', 'b_to_a']),
	prompt: z.string(),
	expected: z.string(),
	has_hint: z.boolean(),
	version: z.string()
});

/** Note enregistrée, dans les sorties de review et amend_review. */
const answerFields = {
	review_id: z.string(),
	rating: ratingSchema,
	capped: z.boolean(),
	next_due: z.string(),
	next_due_in: z.string(),
	context: z.string().nullable()
};

const failureLabels: Record<TranslationFailure, string> = {
	not_configured: "DeepL n'est pas configuré",
	auth: 'la clé DeepL est refusée',
	quota: 'le quota DeepL est épuisé',
	unavailable: 'DeepL est indisponible'
};

/** Raison du premier échec DeepL parmi des suggestions, telle que dite à l'utilisateur. */
function deeplErrorOf(suggestions: readonly Suggestion[]): string | undefined {
	const failure = suggestions.find((s) => !s.ok);
	return failure && !failure.ok ? failureLabels[failure.reason] : undefined;
}

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

const REVIEW_NOT_FOUND = 'Révision introuvable (carte supprimée ou identifiant erroné).';

const CARD_NOT_FOUND =
	'Carte introuvable (supprimée ou identifiant erroné) : retrouve-la avec search_cards.';

/**
 * Traduit les erreurs du domaine en résultats d'erreur lisibles par Claude (`conflict` à
 * `null` pour un outil qui ne rencontre pas de conflit).
 */
async function guard(
	run: () => Promise<CallToolResult>,
	conflict: string | null,
	notFound = REVIEW_NOT_FOUND
): Promise<CallToolResult> {
	try {
		return await run();
	} catch (error) {
		if (error instanceof NotFoundError) return toolError(notFound);
		if (error instanceof ConflictError && conflict !== null) return toolError(conflict);
		throw error;
	}
}

/** `guard` des outils qui lisent une carte par son card_id. */
const cardGuard = (run: () => Promise<CallToolResult>) => guard(run, null, CARD_NOT_FOUND);

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
	registerPrompts(server, { decks, noDeck });
	const cardInput = cardInputSchema(shape, decks);
	const toolTexts = shape ? singleDeckToolTexts(shape) : MULTI_DECK_TOOL_TEXTS;
	const batchInput = batchInputSchema(shape, decks);
	// Les textes des outils ne parlent que des types de decks que l'utilisateur a.
	const languages = shape ? isLanguage(shape) : decks.some(isLanguage);
	const subjects = shape ? !isLanguage(shape) : !decks.every(isLanguage);
	const batchTexts = batchToolTexts(languages, subjects);

	/** « dans « Anglais » » quand l'utilisateur a plusieurs decks, sinon rien. */
	const inDeck = (deck: Pick<Deck, 'name'>) => (several ? ` dans ${quote(deck.name)}` : '');
	/** Ligne d'en-tête « Deck « Anglais ». » quand l'utilisateur a plusieurs decks. */
	const deckHeader = (deck: Pick<Deck, 'name'>) => (several ? [`Deck ${quote(deck.name)}.`] : []);

	/** Texte d'une révision à présenter : le prompt, et la réponse attendue à ne pas lire. */
	function reviewLines(review: NextReview): string[] {
		const { from, to } = directionFaces(review.direction, review.deck);
		return [
			...deckHeader(review.deck),
			to.lang
				? `À demander en ${to.name} : ${quote(review.prompt)}.`
				: `À demander (${from.label} → ${to.label}) : ${quote(review.prompt)}.`,
			`Réponse attendue, à ne pas lire avant sa réponse : ${quote(review.expected)}.`,
			review.hint !== null ? 'Indice disponible.' : 'Pas d’indice.',
			`review_id : ${review.id} ; version : ${review.version}`
		];
	}

	/** Contenu structuré d'une carte à présenter, dans les cards de review. */
	const reviewData = (review: NextReview): z.infer<typeof reviewOutput> => ({
		review_id: review.id,
		deck: review.deck.name,
		direction: review.direction,
		prompt: review.prompt,
		expected: review.expected,
		has_hint: review.hint !== null,
		version: review.version
	});

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
		"Le deck passé à review, s'il y en avait un : remaining est alors compté dans ce deck (tous les decks si le nom est inconnu)."
	);

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
			inputSchema: checkInputSchema(shape, decks),
			outputSchema: z.object({
				deck: z.string(),
				deepl_a_to_b: z.string().nullable(),
				deepl_b_to_a: z.string().nullable(),
				deepl_error: z.string().optional(),
				duplicates: z.array(cardOutputSchema),
				progress_reset: z.boolean().optional()
			}),
			annotations: { readOnlyHint: true, openWorldHint: decks.some(isLanguage) }
		},
		({ card_id, ...input }) =>
			cardGuard(async () => {
				// Une modification se vérifie dans le deck de la carte, avec son contexte par défaut.
				const current = card_id === undefined ? undefined : await cards.get(ownerId, card_id);
				const deck = current?.deck ?? captureDeck(input.deck);
				if (isToolResult(deck)) return deck;
				const pair = languagePair(deck);
				const { a, b } = faces(deck);
				const proposed = current ? editedCard(current, input) : toCardInput(input);
				const [check, duplicates] = await Promise.all([
					pair && translation.check(pair, proposed),
					cards.findDuplicates(ownerId, deck, proposed, { excludeId: card_id })
				]);
				const progressReset = current && resetsProgress(current, proposed);
				const text = (s: Suggestion | undefined) => (s?.ok ? s.text : null);
				const deeplError = check ? deeplErrorOf([check.aToB, check.bToA]) : undefined;

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
				if (progressReset !== undefined) {
					lines.push(
						progressReset
							? 'Cette modification réinitialisera sa progression (historique conservé).'
							: 'Cette modification conservera sa progression.'
					);
				}

				return result(lines.join('\n'), {
					deck: deck.name,
					deepl_a_to_b: text(check?.aToB),
					deepl_b_to_a: text(check?.bToA),
					...(deeplError && { deepl_error: deeplError }),
					duplicates: duplicates.map(cardOutput),
					...(progressReset !== undefined && { progress_reset: progressReset })
				});
			})
	);

	server.registerTool(
		'search_cards',
		{
			title: 'Rechercher des cartes',
			description: `Cherche les cartes de l'utilisateur qui contiennent un texte, dans leurs faces ou leur contexte (casse et accents ignorés), dans tous ses decks ou dans un deck nommé. Renvoie les ${SEARCH_LIMIT} plus récentes au plus, avec leur card_id, à passer à check_card et update_card. Ne modifie rien.`,
			inputSchema: z.object({
				query: z
					.string()
					.trim()
					.min(1)
					.max(CARD_LIMITS.context, tooLong(CARD_LIMITS.context))
					.describe('Texte à chercher : un mot ou un morceau de la carte, pas une phrase entière.'),
				deck: deckNameSchema.describe(
					`Nom d'un deck pour n'y chercher que ses cartes. Sans deck, la recherche porte sur tous les decks (${names}).`
				)
			}),
			outputSchema: z.object({
				cards: z.array(deckCardOutputSchema),
				total: z.number(),
				truncated: z.boolean()
			}),
			annotations: { readOnlyHint: true, openWorldHint: false }
		},
		async ({ query, deck: deckName }) => {
			const scope = deckName === undefined ? undefined : namedDeck(deckName);
			if (isToolResult(scope)) return scope;
			const found = await cards.list(ownerId, { query, deckId: scope?.id });
			const shown = found.slice(0, SEARCH_LIMIT);
			const truncated = found.length > shown.length;

			const where = scope ? ` dans ${quote(scope.name)}` : '';
			const header =
				found.length === 0
					? `Aucune carte trouvée pour ${quote(query)}${where}.`
					: truncated
						? `${found.length} cartes trouvées${where}, voici les ${SEARCH_LIMIT} plus récentes : affine la recherche si besoin.`
						: `${plural(found.length, 'carte trouvée', 'cartes trouvées')}${where} :`;
			const lines = shown.map(
				(card) =>
					`${several && !scope ? `${quote(card.deck.name)} : ` : ''}${describeCard(card)} (card_id : ${card.id}).`
			);
			return result([header, ...lines].join('\n'), {
				cards: shown.map((card) => deckCardOutput(card, card.deck)),
				total: found.length,
				truncated
			});
		}
	);

	server.registerTool(
		'update_card',
		{
			title: 'Modifier une carte',
			description: updateToolText(languages, subjects),
			inputSchema: updateInputSchema(shape),
			outputSchema: deckCardOutputSchema.extend({ progress_reset: z.boolean() }),
			annotations: {
				readOnlyHint: false,
				destructiveHint: true,
				idempotentHint: true,
				openWorldHint: false
			}
		},
		({ card_id, side_a, side_b, context }) =>
			cardGuard(async () => {
				if (side_a === undefined && side_b === undefined && context === undefined) {
					return toolError('Rien à modifier : passe au moins side_a, side_b ou context.');
				}
				const current = await cards.get(ownerId, card_id);
				const { card, progressReset } = await cards.update(
					ownerId,
					card_id,
					editedCard(current, { side_a, side_b, context }),
					now()
				);
				return result(
					[
						`Carte modifiée${inDeck(current.deck)} : ${describeCard(card)}.`,
						progressReset
							? 'Progression réinitialisée : ses révisions repartent de zéro (historique conservé).'
							: 'Progression conservée.'
					].join('\n'),
					{ ...deckCardOutput(card, current.deck), progress_reset: progressReset }
				);
			})
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
		'check_cards',
		{
			title: 'Vérifier un lot de cartes',
			description: batchTexts.check,
			inputSchema: batchInput,
			outputSchema: z.object({
				deck: z.string(),
				count: z.number(),
				already_created: z.array(z.object({ ...batchCardOutput, card_id: z.string() })),
				duplicates: z.array(
					z.object({
						...batchCardOutput,
						same_as: z.number().nullable(),
						existing: z.array(cardOutputSchema)
					})
				),
				divergences: z.array(
					z.object({
						...batchCardOutput,
						deepl_a_to_b: z.string(),
						deepl_b_to_a: z.string()
					})
				),
				deepl_error: z.string().optional()
			}),
			annotations: { readOnlyHint: true, openWorldHint: decks.some(isLanguage) }
		},
		async (input) => {
			const deck = captureDeck(input.deck);
			if (isToolResult(deck)) return deck;
			const batch = input.cards.map(toCardInput);
			const entries = await cards.checkBatch(ownerId, deck, batch, now());
			const items = batch.map((card, i) => ({ i, card, entry: at(entries, i) }));
			// DeepL ne vérifie que les cartes qui seraient créées.
			const fresh = items.filter(({ entry }) => entry.status === 'new');
			const pair = languagePair(deck);
			const checks = pair
				? await translation.checkAll(
						pair,
						fresh.map(({ card }) => card)
					)
				: [];
			const deeplError = deeplErrorOf(checks.flatMap(({ aToB, bToA }) => [aToB, bToA]));
			const divergent = checks.flatMap((check, k) => {
				const { i, card } = at(fresh, k);
				return diverges(card, check) ? [{ i, card, check }] : [];
			});

			const alreadyCreated = items.flatMap(({ i, card, entry }) =>
				entry.status === 'existing' ? [{ ...batchCard(card, i), card_id: entry.card.id }] : []
			);
			const duplicates = items.flatMap(({ i, card, entry }) =>
				entry.status === 'duplicate' || entry.status === 'duplicate_in_batch'
					? [
							{
								...batchCard(card, i),
								same_as: entry.status === 'duplicate_in_batch' ? entry.of + 1 : null,
								existing: entry.status === 'duplicate' ? entry.duplicates.map(cardOutput) : []
							}
						]
					: []
			);
			const lines = items.flatMap(({ i, card, entry }) => {
				const line = batchLine(card, i);
				switch (entry.status) {
					case 'existing':
						return [`${line} : déjà créée il y a moins de 10 minutes.`];
					case 'duplicate':
						return [
							`${line} : doublon de ${entry.duplicates.map(describeCard).join(' ; ')}, déjà dans le deck.`
						];
					case 'duplicate_in_batch':
						return [`${line} : doublon de la n°${entry.of + 1} du lot.`];
					case 'new':
						return [];
				}
			});
			const { a, b } = faces(deck);
			for (const { i, card, check } of divergent) {
				lines.push(
					`${batchLine(card, i)} : DeepL propose ${quote(check.aToB.text)} (${a.name} vers ${b.name}) et ${quote(check.bToA.text)} (${b.name} vers ${a.name}).`
				);
			}
			if (!pair) lines.push('Pas de second avis DeepL pour ce deck.');
			if (deeplError) lines.push(`DeepL : ${deeplError}.`);

			const problems = [
				duplicates.length > 0 && plural(duplicates.length, 'doublon'),
				alreadyCreated.length > 0 &&
					plural(alreadyCreated.length, 'carte déjà créée', 'cartes déjà créées'),
				divergent.length > 0 && plural(divergent.length, 'divergence DeepL', 'divergences DeepL')
			].filter(Boolean);
			const summary = `Lot de ${plural(batch.length, 'carte')} pour ${quote(deck.name)} : ${problems.length > 0 ? problems.join(', ') : 'aucun problème'}.`;

			return result([summary, ...lines].join('\n'), {
				deck: deck.name,
				count: batch.length,
				already_created: alreadyCreated,
				duplicates,
				divergences: divergent.map(({ i, card, check }) => ({
					...batchCard(card, i),
					deepl_a_to_b: check.aToB.text,
					deepl_b_to_a: check.bToA.text
				})),
				...(deeplError && { deepl_error: deeplError })
			});
		}
	);

	server.registerTool(
		'create_cards',
		{
			title: 'Créer un lot de cartes',
			description: batchTexts.create,
			inputSchema: batchInput,
			outputSchema: z.object({
				deck: z.string(),
				created: z.number(),
				already_created: z.number(),
				skipped: z.array(
					z.object({
						...batchCardOutput,
						reason: z.enum(['duplicate', 'duplicate_in_batch'])
					})
				),
				cards: z.array(
					z.object({ position: z.number(), card_id: z.string(), created: z.boolean() })
				)
			}),
			annotations: {
				readOnlyHint: false,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: false
			}
		},
		async (input) => {
			const deck = captureDeck(input.deck);
			if (isToolResult(deck)) return deck;
			const batch = input.cards.map(toCardInput);
			let results: BatchResult[];
			try {
				results = await cards.createBatch(ownerId, deck.id, batch, 'claude', now());
			} catch (error) {
				console.error(error);
				return toolError(BATCH_FAILED);
			}

			const saved = results.flatMap((entry, i) =>
				entry.status === 'created' || entry.status === 'existing'
					? [{ position: i + 1, card_id: entry.card.id, created: entry.status === 'created' }]
					: []
			);
			const skipped = results.flatMap((entry, i) =>
				entry.status === 'duplicate' || entry.status === 'duplicate_in_batch'
					? [{ i, card: at(batch, i), reason: entry.status }]
					: []
			);
			const created = saved.filter((card) => card.created).length;
			const alreadyCreated = saved.length - created;

			const lines = [
				`${plural(created, 'carte créée', 'cartes créées')}${inDeck(deck)}.`,
				alreadyCreated > 0 &&
					`${plural(alreadyCreated, 'carte déjà créée', 'cartes déjà créées')} il y a moins de 10 minutes, rien d'ajouté pour elles.`,
				skipped.length > 0 &&
					`Doublons non créés : ${skipped.map(({ i, card }) => batchLine(card, i)).join(' ; ')}.`,
				created > 0 &&
					'Les nouvelles cartes viendront en révision au fil des jours, dans la limite du deck.'
			];
			return result(lines.filter(Boolean).join('\n'), {
				deck: deck.name,
				created,
				already_created: alreadyCreated,
				skipped: skipped.map(({ i, card, reason }) => ({ ...batchCard(card, i), reason })),
				cards: saved
			});
		}
	);

	server.registerTool(
		'get_hint',
		{
			title: 'Indice',
			description:
				"Renvoie l'indice de la carte en cours, son contexte d'origine sans la source, à appeler seulement si l'utilisateur demande un indice. Le serveur mémorise la demande : la note de cette révision sera plafonnée à hard.",
			inputSchema: z.object({ review_id: reviewIdSchema }),
			outputSchema: z.object({ context: z.string().nullable() }),
			annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false }
		},
		({ review_id }) =>
			guard(async () => {
				const { context } = await reviews.requestHint(ownerId, review_id, now());
				return result(context ? `Indice : ${quote(context)}.` : 'Pas d’indice pour cette carte.', {
					context
				});
			}, REVIEW_NOT_FOUND)
	);

	server.registerTool(
		'review',
		{
			title: 'Réviser',
			description: `Révision avec toujours une carte d'avance : renvoie deux cartes si tu n'en tiens aucune (la première à poser maintenant, l'autre à garder pour après), une sinon (la carte d'avance). Dis le prompt à l'utilisateur, mais ne lis jamais expected avant sa réponse. Le contexte n'est pas fourni ici : s'il demande un indice, appelle get_hint. ${HESITATION_RULE} Juge ensuite sa réponse avec indulgence, jamais à la lettre : la transcription vocale déforme souvent les mots étrangers ; tolère synonymes et approximations. Propose again, hard ou good ; n'utilise easy que si l'utilisateur le demande explicitement. Après un indice, le serveur plafonne la note à hard. Après good ou easy : donne la réponse attendue et la note retenue, pose aussitôt la carte que tu tiens, puis appelle review dans le même tour, avec answer (la carte répondue) et holding (la carte que tu viens de poser) : aucun appel d'outil entre sa réponse et la question suivante. ${CORRECTION_RULE} La note est enregistrée avant le choix de la carte d'avance. Si l'appel n'aboutit pas (coupure), rejoue-le à l'identique : une note n'est jamais comptée deux fois, et la carte que tu tiens reste valable. Évoque le contexte renvoyé en renforcement si c'est utile. Si rien n'est dû (nothing_due), annonce la prochaine échéance et propose de réviser en avance (ahead à true, à repasser à chaque appel) ; en fin de session, propose une fois d'ajouter une carte tirée de sa journée. Sans deck, la session mélange tous les decks : ne passe deck que si l'utilisateur en nomme un, et repasse-le à chaque appel.`,
			inputSchema: z.object({
				answer: z
					.object({
						review_id: reviewIdSchema.describe(
							'review_id de la carte à laquelle il vient de répondre.'
						),
						version: z.string().describe('version de cette carte, renvoyée avec elle par review.'),
						rating: ratingSchema
					})
					.optional()
					.describe(
						'Sa réponse à la carte précédente, à enregistrer. Absent au début de la session.'
					),
				holding: z
					.uuid()
					.optional()
					.describe(
						"review_id de la carte que tu tiens déjà : celle que tu viens de poser, ou que tu gardes pour après une correction. Ni elle ni l'autre sens de sa carte ne sont renvoyés, et review ne renvoie qu'une carte. Absent si tu ne tiens aucune carte."
					),
				deck: reviewDeckField,
				ahead: z
					.boolean()
					.optional()
					.describe(
						'true pour réviser en avance les prochaines révisions quand rien n’est dû, à repasser à chaque appel de la session.'
					)
			}),
			outputSchema: z.object({
				answer: z.object({ ...answerFields, replayed: z.boolean() }).optional(),
				cards: z.array(reviewOutput),
				remaining: z.number(),
				nothing_due: z.boolean(),
				next_due: z.string().nullable().optional(),
				next_due_in: z.string().nullable().optional()
			}),
			annotations: {
				readOnlyHint: false,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: false
			}
		},
		async ({ answer, holding, deck: deckName, ahead = false }) => {
			const scope = deckName === undefined ? undefined : namedDeck(deckName);
			if (isToolResult(scope)) return scope;
			return guard(
				async () => {
					const at = now();
					// La note d'abord : une carte ratée qui doit revenir vite peut être choisie.
					const recorded =
						answer &&
						(await reviews.answer(
							ownerId,
							answer.review_id,
							{ rating: answer.rating, version: answer.version, origin: 'claude' },
							at
						));
					const lead = await reviews.lead(ownerId, at, { ahead, holding, deckId: scope?.id });
					const nothingDue = lead.reviews.length === 0 && !lead.held;

					const summary =
						recorded && answerSummary(recorded, answer.rating, at, { replayed: recorded.replayed });
					const lines = summary?.lines ?? [];
					if (recorded && (recorded.rating === 'again' || recorded.rating === 'hard')) {
						lines.push(RETRY_LINE);
					}
					lead.reviews.forEach((review, i) => {
						lines.push(
							i === 0 && !lead.held
								? 'Carte à poser maintenant :'
								: "Carte d'avance, à garder pour après :",
							...reviewLines(review)
						);
					});
					if (lead.held && lead.reviews.length === 0) lines.push(LAST_CARD_LINE);

					const nextDueIn = lead.nextDue && formatRelative(lead.nextDue, at);
					if (nothingDue) {
						const where = scope ? ` dans ${quote(scope.name)}` : '';
						lines.push(
							nextDueIn
								? `Rien à réviser${where} pour l'instant. Prochaine révision ${nextDueIn}.`
								: `Aucune carte à réviser${where}.`
						);
						if (recorded) lines.push(SESSION_OVER_LINE);
					} else {
						lines.push(`Encore ${plural(lead.remaining, 'due')}.`);
					}

					return result(lines.join('\n'), {
						...(summary && { answer: summary.data }),
						cards: lead.reviews.map(reviewData),
						remaining: lead.remaining,
						nothing_due: nothingDue,
						...(nothingDue && {
							next_due: lead.nextDue?.toISOString() ?? null,
							next_due_in: nextDueIn
						})
					});
				},
				`Cette révision a été modifiée entre-temps. ${NOT_RECORDED}`,
				`${REVIEW_NOT_FOUND} ${NOT_RECORDED}`
			);
		}
	);

	/** Deck de la session, par son nom : `remaining` y est compté (tous les decks s'il est inconnu). */
	const sessionDeckId = (name: string | undefined) =>
		name === undefined ? undefined : findDeckByName(decks, name)?.id;

	server.registerTool(
		'amend_review',
		{
			title: 'Corriger la dernière note',
			description:
				"Remplace la dernière note enregistrée d'une révision, quand l'utilisateur la conteste après son enregistrement par review (« non, compte-la fausse »). Seule la dernière réponse est corrigeable, et seulement dans l'heure qui suit. Le plafond à hard après un indice s'applique toujours. N'utilise easy que si l'utilisateur le demande explicitement.",
			inputSchema: z.object({
				review_id: reviewIdSchema,
				rating: ratingSchema,
				deck: sessionDeckField
			}),
			outputSchema: z.object({ ...answerFields, remaining: z.number(), changed: z.boolean() }),
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
				const remaining = await reviews.countDue(ownerId, at, { deckId: sessionDeckId(deck) });
				const { lines, data } = answerSummary(answer, rating, at, { changed: answer.changed });
				lines.push(remaining === 0 ? 'Plus rien de dû.' : `Encore ${plural(remaining, 'due')}.`);
				return result(lines.join('\n'), { ...data, remaining });
			}, "Impossible de corriger cette note : seule la dernière réponse d'une révision se corrige, dans l'heure qui suit.")
	);

	/** Texte et contenu structuré d'une note enregistrée (review) ou corrigée (amend_review). */
	function answerSummary(
		answer: { reviewId: string; rating: Rating; due: Date; context: string | null },
		requested: Rating,
		at: Date,
		{ replayed, changed }: { replayed?: boolean; changed?: boolean }
	) {
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
			...(answer.context ? [`Contexte : ${quote(answer.context)}.`] : [])
		];
		return {
			lines,
			data: {
				review_id: answer.reviewId,
				rating: answer.rating,
				capped,
				next_due: answer.due.toISOString(),
				next_due_in: nextDueIn,
				context: answer.context,
				...(replayed !== undefined && { replayed }),
				...(changed !== undefined && { changed })
			}
		};
	}

	return server;
}
