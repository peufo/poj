import { McpServer, type CallToolResult } from '@modelcontextprotocol/server';
import { z } from 'zod';
import {
	ConflictError,
	formatRelative,
	NotFoundError,
	type CardsService,
	type Rating,
	type ReviewsService,
	type Suggestion,
	type TranslationFailure,
	type TranslationService
} from '#lib/server/domain/index.js';

/** Dépendances du serveur MCP : un propriétaire déjà authentifié et les services du domaine. */
export interface PojMcpDeps {
	ownerId: string;
	cards: CardsService;
	reviews: ReviewsService;
	translation: TranslationService;
	/** Horloge, injectable pour les tests. */
	now?: () => Date;
}

const INSTRUCTIONS = `Poj aide l'utilisateur à retenir des expressions anglaises par répétition espacée. Chaque carte associe un français, un anglais et un contexte d'origine facultatif ; elle se révise dans les deux sens.

Règles :
- Parle français avec l'utilisateur, sauf pour les expressions anglaises elles-mêmes.
- Capture : appelle toujours check_card avant create_card. Si DeepL diverge de ta proposition ou signale un doublon, expose les options et laisse-le trancher. Relis-lui la carte finale et attends sa confirmation explicite avant create_card.
- Révision : next_review, puis dis le prompt sans jamais lire la réponse attendue avant sa réponse. S'il demande un indice, appelle get_hint. Donne ensuite la réponse attendue, annonce la note retenue, appelle submit_review, puis enchaîne avec la carte suivante. S'il conteste la note, appelle amend_review sur la carte précédente.
- Notes : propose again, hard ou good en tolérant synonymes et approximations. Ne propose jamais easy : ne l'utilise que si l'utilisateur le demande explicitement (« trop facile »).
- L'utilisateur révise souvent en voiture, à la voix : réponses brèves, pas de listes longues.`;

const ratingSchema = z
	.enum(['again', 'hard', 'good', 'easy'])
	.describe(
		'again : faux ou inconnu ; hard : juste avec indice ou hésitation ; good : juste ; easy : trop facile, seulement sur demande explicite.'
	);

const cardInput = z.object({
	french: z.string().trim().min(1).describe('Texte français de la carte.'),
	english: z.string().trim().min(1).describe('Texte anglais de la carte (mot ou phrase entière).'),
	context: z
		.string()
		.nullish()
		.describe("Contexte d'origine facultatif (où, quand, avec qui l'expression a été entendue).")
});

const reviewIdSchema = z.uuid().describe('review_id renvoyé par next_review.');

const failureLabels: Record<TranslationFailure, string> = {
	not_configured: "DeepL n'est pas configuré",
	auth: 'la clé DeepL est refusée',
	quota: 'le quota DeepL est épuisé',
	unavailable: 'DeepL est indisponible'
};

const quote = (text: string) => `« ${text} »`;

function describeCard(card: { french: string; english: string; context: string | null }) {
	const base = `${quote(card.french)} = ${quote(card.english)}`;
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
	cards,
	reviews,
	translation,
	now = () => new Date()
}: PojMcpDeps): McpServer {
	const server = new McpServer({ name: 'poj', version: '1.0.0' }, { instructions: INSTRUCTIONS });

	/** Révisions encore dues, mise de côté du sens inverse comprise. */
	async function remainingDue(at: Date): Promise<number> {
		const next = await reviews.next(ownerId, at);
		return next.review ? next.remaining : 0;
	}

	server.registerTool(
		'check_card',
		{
			title: 'Vérifier une carte',
			description:
				"À appeler avant chaque create_card, avec la carte que tu proposes. Renvoie les traductions DeepL dans les deux sens (en tenant compte du contexte) et les cartes existantes au même anglais. Si DeepL diverge de ta proposition, expose les options à l'utilisateur et laisse-le trancher. Si deepl_error est présent, signale-le : l'utilisateur décide de créer quand même ou non. Ne modifie rien.",
			inputSchema: cardInput,
			outputSchema: z.object({
				deepl_french_to_english: z.string().nullable(),
				deepl_english_to_french: z.string().nullable(),
				deepl_error: z.string().optional(),
				duplicates: z.array(
					z.object({
						card_id: z.string(),
						french: z.string(),
						english: z.string(),
						context: z.string().nullable()
					})
				)
			}),
			annotations: { readOnlyHint: true, openWorldHint: true }
		},
		async (input) => {
			const [check, duplicates] = await Promise.all([
				translation.check(input),
				cards.findDuplicates(ownerId, input.english)
			]);
			const text = (s: Suggestion) => (s.ok ? s.text : null);
			const failure = [check.frenchToEnglish, check.englishToFrench].find((s) => !s.ok);
			const deeplError = failure && !failure.ok ? failureLabels[failure.reason] : undefined;

			const lines: string[] = [];
			if (check.frenchToEnglish.ok) {
				lines.push(`DeepL, français vers anglais : ${quote(check.frenchToEnglish.text)}.`);
			}
			if (check.englishToFrench.ok) {
				lines.push(`DeepL, anglais vers français : ${quote(check.englishToFrench.text)}.`);
			}
			if (deeplError) lines.push(`DeepL : ${deeplError}.`);
			lines.push(
				duplicates.length === 0
					? 'Aucun doublon.'
					: `Doublon${duplicates.length > 1 ? 's' : ''} : ${duplicates.map(describeCard).join(' ; ')}.`
			);

			return result(lines.join('\n'), {
				deepl_french_to_english: text(check.frenchToEnglish),
				deepl_english_to_french: text(check.englishToFrench),
				...(deeplError && { deepl_error: deeplError }),
				duplicates: duplicates.map((card) => ({
					card_id: card.id,
					french: card.french,
					english: card.english,
					context: card.context
				}))
			});
		}
	);

	server.registerTool(
		'create_card',
		{
			title: 'Créer une carte',
			description:
				"Crée une carte et ses deux révisions, dues immédiatement. Avant de l'appeler : appelle toujours check_card ; si DeepL diverge, expose les options et laisse-le trancher ; relis-lui la carte finale (français, anglais, contexte) et attends sa confirmation explicite. Rejouer le même appel dans les 10 minutes renvoie la carte déjà créée sans doublon.",
			inputSchema: cardInput,
			outputSchema: z.object({
				card_id: z.string(),
				created: z.boolean(),
				french: z.string(),
				english: z.string(),
				context: z.string().nullable()
			}),
			annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false }
		},
		async (input) => {
			const { card, created } = await cards.createOnce(ownerId, input, 'claude', now());
			const summary = describeCard(card);
			return result(
				created
					? `Carte créée : ${summary}.`
					: `Carte déjà créée il y a moins de 10 minutes, rien d'ajouté : ${summary}.`,
				{
					card_id: card.id,
					created,
					french: card.french,
					english: card.english,
					context: card.context
				}
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
				direction: z.enum(['fr_to_en', 'en_to_fr']).optional(),
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
			const frToEn = review.direction === 'fr_to_en';
			const lines = [
				`À demander ${frToEn ? 'en anglais' : 'en français'} : ${quote(review.prompt)}.`,
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
