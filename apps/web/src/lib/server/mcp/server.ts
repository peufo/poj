import { McpServer, type CallToolResult } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { directionFaces, faces, type Face } from '#lib/format/decks.js';
import {
	ConflictError,
	directionsOf,
	duplicateSide,
	formatRelative,
	languagePair,
	NotFoundError,
	type CardInput,
	type CardsService,
	type Deck,
	type Rating,
	type ReviewsService,
	type Suggestion,
	type TranslationFailure,
	type TranslationService
} from '#lib/server/domain/index.js';

/**
 * Dépendances du serveur MCP : un propriétaire déjà authentifié, le deck des cartes
 * capturées (son deck par défaut tant qu'il n'y a pas de choix de deck) et les services
 * du domaine.
 */
export interface PojMcpDeps {
	ownerId: string;
	deck: Deck;
	cards: CardsService;
	reviews: ReviewsService;
	translation: TranslationService;
	/** Horloge, injectable pour les tests. */
	now?: () => Date;
}

/** Consignes du serveur, rendues avec les faces du deck. */
function instructions(deck: Deck): string {
	const { a, b } = faces(deck);
	const isLanguage = languagePair(deck) !== null;
	const subject = isLanguage ? `des expressions en ${b.name}` : `des cartes ${a.the} / ${b.the}`;
	const directions = deck.bothDirections
		? 'elle se révise dans les deux sens'
		: `elle se révise de ${a.the} vers ${b.the} seulement`;
	const capture = isLanguage
		? 'Capture : appelle toujours check_card avant create_card. Si DeepL diverge de ta proposition ou signale un doublon, expose les options et laisse-le trancher. Relis-lui la carte finale et attends sa confirmation explicite avant create_card.'
		: "Capture : appelle toujours check_card avant create_card. Ce deck n'a pas de second avis DeepL : vérifie toi-même l'exactitude de la carte, et signale un doublon s'il y en a. Relis-lui la carte finale et attends sa confirmation explicite avant create_card.";

	return `Poj aide l'utilisateur à retenir ${subject} par répétition espacée. Chaque carte associe ${a.the} (side_a), ${b.the} (side_b) et un contexte d'origine facultatif ; ${directions}.

Règles :
- Parle français avec l'utilisateur${isLanguage ? `, sauf pour les expressions en ${b.name} elles-mêmes` : ''}.
- ${capture}
- Révision : next_review, puis dis le prompt sans jamais lire la réponse attendue avant sa réponse. S'il demande un indice, appelle get_hint. Donne ensuite la réponse attendue, annonce la note retenue, appelle submit_review, puis enchaîne avec la carte suivante. S'il conteste la note, appelle amend_review sur la carte précédente.
- Notes : propose again, hard ou good en tolérant synonymes et approximations. Ne propose jamais easy : ne l'utilise que si l'utilisateur le demande explicitement (« trop facile »).
- L'utilisateur révise souvent en voiture, à la voix : réponses brèves, pas de listes longues.`;
}

const ratingSchema = z
	.enum(['again', 'hard', 'good', 'easy'])
	.describe(
		'again : faux ou inconnu ; hard : juste avec indice ou hésitation ; good : juste ; easy : trop facile, seulement sur demande explicite.'
	);

/** « Texte en anglais de la carte », ou « Face « Pays » de la carte » pour un sujet. */
const fieldOf = (face: Face) =>
	face.lang ? `Texte en ${face.name} de la carte` : `Face ${face.the} de la carte`;

function cardInputSchema(deck: Deck) {
	const { a, b } = faces(deck);
	return z.object({
		side_a: z
			.string()
			.trim()
			.min(1)
			.describe(`${fieldOf(a)}.`),
		side_b: z
			.string()
			.trim()
			.min(1)
			.describe(`${fieldOf(b)}${b.lang ? ' (mot ou phrase entière)' : ''}.`),
		context: z
			.string()
			.nullish()
			.describe("Contexte d'origine facultatif (où, quand, avec qui l'expression a été entendue).")
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

const quote = (text: string) => `« ${text} »`;

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
	deck,
	cards,
	reviews,
	translation,
	now = () => new Date()
}: PojMcpDeps): McpServer {
	const server = new McpServer(
		{ name: 'poj', version: '1.0.0' },
		{ instructions: instructions(deck) }
	);
	const { a, b } = faces(deck);
	const pair = languagePair(deck);
	const cardInput = cardInputSchema(deck);
	const duplicateFace = duplicateSide(deck) === 'sideA' ? a : b;
	const sameFace = pair
		? `au même ${duplicateFace.name}`
		: `avec la même face ${duplicateFace.the}`;

	/** Révisions encore dues, mise de côté du sens inverse comprise. */
	async function remainingDue(at: Date): Promise<number> {
		const next = await reviews.next(ownerId, at);
		return next.review ? next.remaining : 0;
	}

	server.registerTool(
		'check_card',
		{
			title: 'Vérifier une carte',
			description: pair
				? `À appeler avant chaque create_card, avec la carte que tu proposes. Renvoie les traductions DeepL dans les deux sens (en tenant compte du contexte) et les cartes existantes ${sameFace}. Si DeepL diverge de ta proposition, expose les options à l'utilisateur et laisse-le trancher. Si deepl_error est présent, signale-le : l'utilisateur décide de créer quand même ou non. Ne modifie rien.`
				: `À appeler avant chaque create_card, avec la carte que tu proposes. Renvoie les cartes existantes ${sameFace}. Ce deck n'a pas de second avis DeepL (deepl_a_to_b et deepl_b_to_a sont nuls) : vérifie toi-même la carte et relis-la avec l'utilisateur. Ne modifie rien.`,
			inputSchema: cardInput,
			outputSchema: z.object({
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
			annotations: { readOnlyHint: true, openWorldHint: pair !== null }
		},
		async (input) => {
			const proposed = toCardInput(input);
			const [check, duplicates] = await Promise.all([
				pair && translation.check(pair, proposed),
				cards.findDuplicates(ownerId, deck, proposed)
			]);
			const text = (s: Suggestion | undefined) => (s?.ok ? s.text : null);
			const failure = check && [check.aToB, check.bToA].find((s) => !s.ok);
			const deeplError = failure && !failure.ok ? failureLabels[failure.reason] : undefined;

			const lines: string[] = [];
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
			description: `Crée une carte et ${directionsOf(deck).length > 1 ? 'ses deux révisions, dues' : 'sa révision, due'} immédiatement. Avant de l'appeler : appelle toujours check_card ; ${pair ? 'si DeepL diverge, expose les options et laisse-le trancher' : 'vérifie toi-même la carte, ce deck n’a pas de second avis DeepL'} ; relis-lui la carte finale (${a.name}, ${b.name}, contexte) et attends sa confirmation explicite. Rejouer le même appel dans les 10 minutes renvoie la carte déjà créée sans doublon.`,
			inputSchema: cardInput,
			outputSchema: z.object({
				card_id: z.string(),
				created: z.boolean(),
				side_a: z.string(),
				side_b: z.string(),
				context: z.string().nullable()
			}),
			annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false }
		},
		async (input) => {
			const { card, created } = await cards.createOnce(
				ownerId,
				toCardInput(input),
				'claude',
				now()
			);
			const summary = describeCard(card);
			return result(
				created
					? `Carte créée : ${summary}.`
					: `Carte déjà créée il y a moins de 10 minutes, rien d'ajouté : ${summary}.`,
				{ ...cardOutput(card), created }
			);
		}
	);

	server.registerTool(
		'next_review',
		{
			title: 'Prochaine révision',
			description:
				"Renvoie la prochaine révision due : dis le prompt à l'utilisateur, mais ne lis jamais expected avant sa réponse. Le contexte n'est pas fourni ici : s'il demande un indice, appelle get_hint. Garde review_id et version pour submit_review. Si rien n'est dû (nothing_due), annonce la prochaine échéance et propose de réviser en avance en rappelant l'outil avec ahead à true.",
			inputSchema: z.object({
				ahead: z
					.boolean()
					.optional()
					.describe('true pour réviser en avance les prochaines révisions quand rien n’est dû.')
			}),
			outputSchema: z.object({
				nothing_due: z.boolean(),
				review_id: z.string().optional(),
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
		async ({ ahead = false }) => {
			const at = now();
			const next = await reviews.next(ownerId, at, { ahead });

			if (!next.review) {
				const nextDueIn = next.nextDue && formatRelative(next.nextDue, at);
				return result(
					nextDueIn
						? `Rien à réviser pour l'instant. Prochaine révision ${nextDueIn}.`
						: 'Aucune carte à réviser.',
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
				rating: ratingSchema
			}),
			outputSchema: answerOutput.extend({ replayed: z.boolean() }),
			annotations: {
				readOnlyHint: false,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: false
			}
		},
		({ review_id, version, rating }) =>
			guard(async () => {
				const at = now();
				const answer = await reviews.answer(
					ownerId,
					review_id,
					{ rating, version, origin: 'claude' },
					at
				);
				return answerResult(answer, rating, at, { replayed: answer.replayed });
			}, 'Cette révision a été modifiée entre-temps : rien n’a été enregistré. Appelle next_review pour continuer.')
	);

	server.registerTool(
		'amend_review',
		{
			title: 'Corriger la dernière note',
			description:
				"Remplace la dernière note enregistrée d'une révision, quand l'utilisateur la conteste après submit_review (« non, compte-la fausse »). Seule la dernière réponse est corrigeable, et seulement dans l'heure qui suit. Le plafond à hard après un indice s'applique toujours. N'utilise easy que si l'utilisateur le demande explicitement.",
			inputSchema: z.object({ review_id: reviewIdSchema, rating: ratingSchema }),
			outputSchema: answerOutput.extend({ changed: z.boolean() }),
			annotations: {
				readOnlyHint: false,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: false
			}
		},
		({ review_id, rating }) =>
			guard(async () => {
				const at = now();
				const answer = await reviews.amend(ownerId, review_id, rating, at);
				return answerResult(answer, rating, at, { changed: answer.changed });
			}, "Impossible de corriger cette note : seule la dernière réponse d'une révision se corrige, dans l'heure qui suit.")
	);

	async function answerResult(
		answer: { reviewId: string; rating: Rating; due: Date; context: string | null },
		requested: Rating,
		at: Date,
		{ replayed, changed }: { replayed?: boolean; changed?: boolean } = {}
	): Promise<CallToolResult> {
		const remaining = await remainingDue(at);
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
