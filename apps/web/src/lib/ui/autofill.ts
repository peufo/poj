/**
 * Attributs qui coupent l'autocomplétion d'un champ de contenu (nom de deck, face, recherche…).
 *
 * `autocomplete="off"` suffit au navigateur, mais pas aux gestionnaires de mots de passe et
 * d'identités, qui devinent le champ d'après son `name` ou son libellé (« Nom » → identité) :
 * chacun a son propre attribut d'exclusion.
 */
export const NO_AUTOFILL = {
	autocomplete: 'off',
	'data-protonpass-ignore': 'true',
	'data-1p-ignore': 'true',
	'data-lpignore': 'true',
	'data-bwignore': 'true',
	'data-form-type': 'other'
} as const;
