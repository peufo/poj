import type { GetPromptResult, McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod';
import { findDeckByName, type Deck } from '#lib/server/domain/index.js';
import {
	CORRECTION_RULE,
	DECK_CHOICE_RULE,
	END_RULE,
	FACT_RULE,
	INSPIRATION_RULE,
	isLanguage,
	OFFER_RULE,
	quote,
	RATING_RULE,
	REVIEW_RULE,
	ruleList,
	VOICE_RULE
} from './guidance';

export interface PromptDeps {
	/** Decks non supprimés du propriétaire. */
	decks: readonly Deck[];
	/** Message d'un utilisateur sans deck : la capture renvoie vers la création d'un deck. */
	noDeck: string;
}

/** Prompt rendu comme un message de l'utilisateur, qui lance le déroulé. */
const userMessage = (text: string): GetPromptResult => ({
	messages: [{ role: 'user', content: { type: 'text', text } }]
});

/** Argument texte facultatif (un prompt ne reçoit que des chaînes). */
const optionalText = (description: string) => z.string().optional().describe(description);

/** Saisie d'un argument, une saisie vide valant absence. */
const filled = (value: string | undefined) => value?.trim() || undefined;

/**
 * Prompts « Réviser » et « Ajouter une carte », proposés par le client (menu du
 * connecteur) : ils lancent les mêmes déroulés que les consignes, rendus selon les decks.
 */
export function registerPrompts(server: McpServer, { decks, noDeck }: PromptDeps) {
	const several = decks.length > 1;
	const languages = decks.some(isLanguage);
	// Sans deck, les faces sont neutres, comme celles d'un deck de sujet.
	const subjects = decks.length === 0 || !decks.every(isLanguage);

	server.registerPrompt(
		'review',
		{
			title: 'Réviser',
			description: 'Lance une session de révision des cartes dues, à la voix ou par écrit.',
			argsSchema: z.object({
				deck: optionalText(
					several
						? `Deck à réviser, facultatif : sans deck, la session mélange tous les decks (${decks.map((deck) => quote(deck.name)).join(', ')}).`
						: 'Deck à réviser, facultatif.'
				)
			})
		},
		(args) => {
			const name = filled(args.deck);
			const deck = name === undefined ? undefined : (findDeckByName(decks, name)?.name ?? name);
			const start =
				deck === undefined
					? 'Appelle next_review sans deck : la session mélange tous mes decks.'
					: `Appelle next_review avec le deck ${quote(deck)}, et repasse-le à submit_review et amend_review.`;
			return userMessage(`On révise${deck === undefined ? '' : ` le deck ${quote(deck)}`}. Lance une session de révision Poj, avec ces règles :
${ruleList([
	start,
	REVIEW_RULE,
	CORRECTION_RULE,
	RATING_RULE,
	'Rien à réviser (nothing_due) : annonce-moi la prochaine échéance et propose de réviser en avance (next_review avec ahead à true, puis submit_review avec ahead à true).',
	END_RULE,
	OFFER_RULE,
	VOICE_RULE
])}`);
		}
	);

	server.registerPrompt(
		'add_card',
		{
			title: 'Ajouter une carte',
			description:
				"Capture une carte à partir d'une situation réelle : une expression rencontrée, ou de l'aide pour en retrouver une.",
			argsSchema: z.object({
				expression: optionalText(
					"Ce que tu as entendu, lu ou voulu dire, et où. Facultatif : sans rien, Claude t'aide à retrouver une situation réelle."
				)
			})
		},
		(args) => {
			const expression = filled(args.expression);
			const capture = [
				'Capture : appelle toujours check_card avant create_card.',
				languages &&
					'Pour un deck de langue, si DeepL diverge de ta proposition, expose-moi les options avec tes arguments et laisse-moi trancher ; si DeepL est indisponible, dis-le-moi et laisse-moi décider.',
				'Si une carte proche existe déjà, signale-la et demande-moi si j’en veux quand même une nouvelle.',
				`Relis-moi la carte finale (faces, contexte${several ? ', deck' : ''}) et attends ma confirmation explicite avant create_card.`
			]
				.filter(Boolean)
				.join(' ');
			const rules = ruleList([
				...(expression === undefined
					? [INSPIRATION_RULE]
					: [
							'Si le sens est ambigu (mot à plusieurs sens, contexte insuffisant), pose-moi une question avant de proposer une carte.',
							languages &&
								"Si je l'ai entendue ou lue dans la langue apprise, vérifie d'abord qu'elle existe et qu'elle est idiomatique ; sinon, propose la forme correcte.",
							"Le contexte d'origine de la carte est la situation où je l'ai rencontrée."
						]),
				several && DECK_CHOICE_RULE,
				capture,
				subjects && FACT_RULE,
				VOICE_RULE
			]);
			const request =
				expression === undefined
					? "Je veux ajouter une carte, mais je manque d'idées : aide-moi à retrouver une situation réelle."
					: `Je veux ajouter une carte : ${expression}`;
			return userMessage(
				`${request}\n\n${decks.length === 0 ? `${noDeck}\n\n` : ''}Suis la capture Poj :\n${rules}`
			);
		}
	);
}
