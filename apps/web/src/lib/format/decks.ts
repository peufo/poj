// Noms des faces d'un deck et des sens de révision, partagés par le web et le serveur MCP.
// Aucune paire n'est écrite ici : tout vient du deck (doc/decisions.md, 2026-10-29).
import { capitalize, type Direction } from './labels';

/** Ce qu'il faut d'un deck pour nommer ses faces (le `Deck` du domaine convient). */
export interface DeckFaces {
	kind: 'language' | 'subject';
	/** Faux : seul le sens `a_to_b` est révisé. */
	bothDirections: boolean;
	/** Étiquettes BCP 47 (`fr`, `en-GB`), pour un deck de langue seulement. */
	languageA: string | null;
	languageB: string | null;
	/** Libellés choisis, prioritaires sur le nom de la langue ou « Question » / « Réponse ». */
	labelA: string | null;
	labelB: string | null;
}

/** Deck tel que les pages le reçoivent (`deckView`). */
export interface DeckView extends DeckFaces {
	/** Face qui identifie une carte pour les doublons (B pour une langue, A pour un sujet). */
	duplicateSide: 'sideA' | 'sideB';
}

/**
 * Faces neutres (« Question » / « Réponse »), quand aucun deck n'est encore choisi : un
 * formulaire de carte sans deck, un serveur MCP pour un utilisateur sans deck.
 */
export const NO_DECK: DeckView = {
	kind: 'subject',
	languageA: null,
	languageB: null,
	labelA: null,
	labelB: null,
	bothDirections: true,
	duplicateSide: 'sideA'
};

/** Deck de la navigation et des choix de deck (`deckSummary`). */
export interface DeckSummary extends DeckView {
	id: string;
	name: string;
	/** Cartes non supprimées. */
	cardCount: number;
}

export interface Face {
	/** Libellé de champ : « Français », « Pays », « Question ». */
	label: string;
	/** Au fil d'une phrase, sans article : « anglais », « Pays ». */
	name: string;
	/** Dans une phrase : « le français », « l’anglais », « « Pays » ». */
	the: string;
	/** Désigne un texte de cette face : « cet anglais », « la même face « Pays » ». */
	same: string;
	/** Langue de la face (attribut `lang`), `null` pour un sujet. */
	lang: string | null;
	/** Abréviation de la face à produire dans une puce : « EN », « FR », « P ». */
	short: string;
}

const languageNames = new Intl.DisplayNames('fr', { type: 'language' });

/** Langue seule d'une étiquette : `en-GB` → `en`. */
export const baseLanguage = (tag: string) => new Intl.Locale(tag).language;

/** Nom français d'une langue, sans la variante : `en-GB` → « anglais ». */
export const languageName = (tag: string) => languageNames.of(baseLanguage(tag)) ?? tag;

const startsWithVowel = (name: string) => /^[aeiouyàâéèêîïôh]/i.test(name);

/** Exemples de saisie par langue, en placeholder du formulaire. */
const EXAMPLES: Record<string, string> = { fr: 'tenir le coup', en: 'to hang in there' };

/** Exemple de saisie pour une face de langue, s'il y en a un. */
export const exampleFor = (face: Face) =>
	face.lang ? EXAMPLES[baseLanguage(face.lang)] : undefined;

function face(deck: DeckFaces, side: 'A' | 'B'): Face {
	const lang = deck.kind === 'language' ? deck[`language${side}`] : null;
	const label = deck[`label${side}`];
	// Libellé choisi, sinon « Question » / « Réponse » pour un sujet.
	if (label !== null || lang === null) {
		const text = label ?? (side === 'A' ? 'Question' : 'Réponse');
		return {
			label: text,
			name: text,
			the: `« ${text} »`,
			same: `la même face « ${text} »`,
			lang,
			short: text.charAt(0).toUpperCase()
		};
	}
	// Sinon, le nom de la langue.
	const name = languageName(lang);
	return {
		label: capitalize(name),
		name,
		// Les noms de langue sont masculins : « le français », « l’anglais ».
		the: startsWithVowel(name) ? `l’${name}` : `le ${name}`,
		same: startsWithVowel(name) ? `cet ${name}` : `ce ${name}`,
		lang,
		short: baseLanguage(lang).toUpperCase()
	};
}

/** Les deux faces d'un deck : A (langue connue, ou question) et B (langue apprise, ou réponse). */
export function faces(deck: DeckFaces): { a: Face; b: Face } {
	return { a: face(deck, 'A'), b: face(deck, 'B') };
}

/** Faces présentée (`from`) et attendue (`to`) d'un sens. */
export function directionFaces(direction: Direction, deck: DeckFaces): { from: Face; to: Face } {
	const { a, b } = faces(deck);
	return direction === 'a_to_b' ? { from: a, to: b } : { from: b, to: a };
}

/** « Français → anglais », « Pays → Capitale » : la face présentée, puis celle à produire. */
export function directionLabel(direction: Direction, deck: DeckFaces): string {
	const { from, to } = directionFaces(direction, deck);
	return `${from.label} → ${to.name}`;
}

/** Champs du formulaire de deck (création et modification), tels que saisis. */
export interface DeckFormValues {
	name: string;
	kind: 'language' | 'subject';
	/** Langue connue (face A) et langue apprise (face B), pour une langue. */
	languageA: string;
	languageB: string;
	/** Noms des faces, pour un sujet. */
	labelA: string;
	labelB: string;
	bothDirections: boolean;
}

/** Un nouveau deck : une langue depuis le français, révisée dans les deux sens. */
export const NEW_DECK_VALUES: DeckFormValues = {
	name: '',
	kind: 'language',
	languageA: 'fr',
	languageB: '',
	labelA: 'Question',
	labelB: 'Réponse',
	bothDirections: true
};
