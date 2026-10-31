// Retour standard des formulaires (remote functions `form`) : envoi en cours sur le bouton
// (`SubmitButton`), erreur de champ (`TextField` / `SelectField` avec `field`, voir
// `lib/ui/field.ts`), erreur globale (`FormIssues`) et succès sans redirection
// (`FormSuccess`).

/* eslint-disable @typescript-eslint/no-explicit-any -- champs et résultat de forme libre */

/** Attributs à répandre sur `<form>` : méthode, action et prise en main de l'envoi. */
type FormAttributes = {
	[attachment: symbol]: (node: HTMLFormElement) => void;
	method: 'POST';
	action: string;
};

/**
 * Un remote form quelconque, pour les composants partagés par plusieurs formulaires
 * (`DeckForm`, `CardForm`) : `RemoteForm<any, any>` n'accepte pas un remote form typé. Les
 * pages et les `.remote.ts` gardent le type exact.
 */
export interface AnyRemoteForm extends FormAttributes {
	readonly pending: number;
	readonly result: any;
	readonly fields: any;
	/** Accepte la prise en main de n'importe quel remote form typé. */
	enhance(callback: (form: any) => void | Promise<void>): FormAttributes;
}

/* eslint-enable @typescript-eslint/no-explicit-any */
