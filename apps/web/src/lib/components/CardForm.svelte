<script lang="ts" generics="Mode extends 'create' | 'edit'">
	import type { Snippet } from 'svelte';
	import { exampleFor, faces, type DeckView, type Face } from '#lib/format/decks.js';
	import Button from '#lib/ui/Button.svelte';
	import Notice from '#lib/ui/Notice.svelte';
	import TextField from '#lib/ui/TextField.svelte';
	import FormIssues from './form/FormIssues.svelte';
	import SubmitButton from './form/SubmitButton.svelte';
	import type { CardEditForm, NewCardForm, SuggestionView } from '#lib/server/web/card-form.js';

	// Formulaire de carte (création et modification, WEB-2 et WEB-5), sur le remote form de la
	// page (`createCard`, `updateCard`). Boutons d'envoi : « Traduire avec DeepL » sur chaque
	// face d'un deck de langue, qui traduit l'autre face (`intent=translate` remplit la face B,
	// `intent=translate_back` la face A) et dont la suggestion arrive sans recharger la page,
	// et l'enregistrement (`intent=save`). Le serveur peut d'abord renvoyer un doublon, à
	// confirmer (`confirm` : la face confirmée telle quelle), ou demander l'accord sur la
	// réinitialisation (`acknowledge_reset`, envoyé dès que l'avertissement est affiché).

	/** Suggestion affichée : celle du serveur, ou l'attente avant ou pendant la demande. */
	type Suggestion = { status: 'idle' } | { status: 'loading' } | SuggestionView;

	/** Face que la suggestion DeepL remplit. */
	type Target = 'sideA' | 'sideB';

	/** Bouton « Traduire avec DeepL » de chaque face : il traduit l'autre face. */
	const INTENT = { sideA: 'translate_back', sideB: 'translate' } as const;

	/** Remote form de chaque mode : `mode` et `form` vont ensemble. */
	type Forms = { create: NewCardForm; edit: CardEditForm };

	/** Un envoi en cours, tel que `enhance` le donne, dans l'un ou l'autre mode. */
	type Submission = {
		[M in keyof Forms]: Parameters<Parameters<Forms[M]['enhance']>[0]>[0];
	}[keyof Forms];

	type Props = {
		mode: Mode;
		/** `createCard` à la création, `updateCard` en modification. */
		form: Forms[Mode];
		/** Deck de la carte : nomme les faces ; DeepL seulement pour un deck de langue. */
		deck: DeckView;
		/** Deck choisi, à la création : changer de deck écarte la suggestion et le doublon. */
		deckId?: string;
		sideA?: string;
		sideB?: string;
		context?: string;
		/** Texte enregistré, en modification : un écart réinitialise la progression. */
		original?: { sideA: string; sideB: string };
		cancelHref: string;
		/** Champs en tête du formulaire (ex. le choix du deck). */
		header?: Snippet;
	};

	let {
		form,
		mode,
		deck,
		deckId,
		sideA = $bindable(''),
		sideB = $bindable(''),
		context = $bindable(''),
		original,
		cancelHref,
		header
	}: Props = $props();

	const IDLE: Suggestion = { status: 'idle' };

	/** Le remote form de modification (`mode` et `form` vont ensemble, voir `Props`). */
	const editForm = $derived(mode === 'edit' ? (form as CardEditForm) : null);

	const face = $derived(faces(deck));
	const translate = $derived({
		sideA: form.fields.intent.as('submit', INTENT.sideA),
		sideB: form.fields.intent.as('submit', INTENT.sideB)
	});
	const save = $derived(form.fields.intent.as('submit', 'save'));

	/** Suggestion demandée, la face qu'elle remplit, et le deck pour lequel elle l'a été. */
	let asked: { deckId?: string; target: Target; suggestion: Suggestion } = $state({
		target: 'sideB',
		suggestion: IDLE
	});
	const suggestion = $derived(asked.deckId === deckId ? asked.suggestion : IDLE);
	/** Suggestion affichée sous la face `target`. */
	const suggestionOf = (target: Target) => (asked.target === target ? suggestion : IDLE);

	// La suggestion DeepL arrive sans recharger les données de la page ; la saisie reste.
	const enhanced = $derived(
		form.enhance(async ({ fields, submit }: Submission) => {
			const intent = fields.intent.value();
			if (intent !== INTENT.sideA && intent !== INTENT.sideB) {
				await submit();
				return;
			}
			const scope = deckId;
			const target = intent === INTENT.sideA ? 'sideA' : 'sideB';
			asked = { deckId: scope, target, suggestion: { status: 'loading' } };
			await submit().updates();
			const result = form.result;
			asked = {
				deckId: scope,
				target,
				suggestion: result && 'suggestion' in result ? result.suggestion : IDLE
			};
		})
	);

	/** Face qui identifie la carte, renvoyée telle quelle pour confirmer un doublon. */
	const duplicateKey = $derived((deck.duplicateSide === 'sideA' ? sideA : sideB).trim());

	// L'avertissement vaut pour la face vérifiée et son deck : changer l'une ou l'autre
	// relance la vérification.
	const duplicate = $derived.by(() => {
		const result = form.result;
		const found = result && 'duplicate' in result ? result.duplicate : null;
		if (!found || found.forValue !== duplicateKey) return null;
		if (deckId !== undefined && found.deckId !== deckId) return null;
		return found;
	});

	const resets = $derived(
		mode === 'edit' &&
			!!original &&
			(sideA.trim() !== original.sideA || sideB.trim() !== original.sideB)
	);
	const taken = $derived(
		suggestion.status === 'ready' &&
			(asked.target === 'sideA' ? sideA : sideB).trim() === suggestion.text
	);

	function take(text: string) {
		if (asked.target === 'sideA') sideA = text;
		else sideB = text;
	}
</script>

<!-- « Traduire avec DeepL » sur la face `target` (`to`), depuis le texte `source` de l'autre
face. Pas de second avis DeepL pour un sujet. -->
{#snippet deepl(target: Target, to: Face, source: string)}
	{#if deck.kind === 'language'}<Button
			size="sm"
			variant="ghost"
			icon="translate"
			class="-mr-2 text-accent-text! hover:bg-accent-soft!"
			type="submit"
			name={translate[target].name}
			value={translate[target].value}
			aria-label="Traduire avec DeepL vers {to.the}"
			formnovalidate
			disabled={!source.trim()}
			loading={suggestionOf(target).status === 'loading'}
		>
			Traduire avec DeepL
		</Button>{/if}
{/snippet}

<!-- Suggestion DeepL sous la face qu'elle remplit. -->
{#snippet suggestionFor(target: Target, to: Face)}
	{@const shown = suggestionOf(target)}
	{#if shown.status === 'loading'}
		<div
			class="flex h-14 items-center gap-3 rounded-lg bg-surface px-3"
			aria-label="Traduction en cours"
		>
			<span class="h-3 w-12 animate-pulse rounded-full bg-line-strong"></span>
			<span class="h-3 w-32 animate-pulse rounded-full bg-line-strong"></span>
		</div>
	{:else if shown.status === 'ready'}
		{@const text = shown.text}
		<div class="flex min-h-14 items-center gap-3 rounded-lg bg-surface py-2 pr-2 pl-3">
			<div class="min-w-0 flex-1">
				<p class="text-xs text-ink-3">
					Suggestion DeepL{context.trim() ? ', avec le contexte' : ''}
				</p>
				<p class="text-ink" lang={to.lang}>{text}</p>
			</div>
			<Button
				size="sm"
				icon={taken ? 'check' : undefined}
				disabled={taken}
				onclick={() => take(text)}
			>
				{taken ? 'Reprise' : 'Reprendre'}
			</Button>
		</div>
	{:else if shown.status === 'error'}
		<p class="flex items-start gap-1.5 text-sm text-warn">{shown.message}</p>
	{/if}
{/snippet}

<form {...enhanced} class="flex flex-col gap-6">
	{@render header?.()}

	<TextField
		label={face.a.label}
		field={form.fields.sideA}
		bind:value={sideA}
		multiline
		rows={1}
		required
		lang={face.a.lang ?? undefined}
		placeholder={exampleFor(face.a)}
	>
		{#snippet action()}{@render deepl('sideA', face.a, sideB)}{/snippet}
		{#snippet below()}{@render suggestionFor('sideA', face.a)}{/snippet}
	</TextField>

	<TextField
		label="Contexte d'origine"
		field={form.fields.context}
		bind:value={context}
		multiline
		rows={2}
		optional
		lang="fr"
		hint="Où, quand, avec qui ? Il lève l'ambiguïté et servira d'indice en révision."
	/>

	<TextField
		label={face.b.label}
		field={form.fields.sideB}
		bind:value={sideB}
		multiline
		rows={1}
		required
		lang={face.b.lang ?? undefined}
		placeholder={exampleFor(face.b)}
	>
		{#snippet action()}{@render deepl('sideB', face.b, sideA)}{/snippet}
		{#snippet below()}{@render suggestionFor('sideB', face.b)}{/snippet}
	</TextField>

	{#if resets}
		<input {...editForm?.fields.acknowledge_reset.as('hidden', '1')} />
		<Notice tone="warn" title="La progression repartira de zéro">
			Tu modifies {face.a.the} ou {face.b.the} :
			{deck.bothDirections
				? 'les deux sens redeviendront neufs et dus immédiatement.'
				: 'la carte redeviendra neuve et due immédiatement.'}
			L'historique des réponses est conservé.
		</Notice>
	{/if}

	{#if duplicate}
		<input {...form.fields.confirm.as('hidden', duplicateKey)} />
		<Notice
			tone="warn"
			title="Une carte a déjà {face[deck.duplicateSide === 'sideA' ? 'a' : 'b'].same}"
		>
			<a
				href="/cards/{duplicate.id}"
				class="font-medium text-ink underline decoration-line-strong hover:decoration-ink"
			>
				<span lang={face.b.lang}>{duplicate.sideB}</span> ·
				<span lang={face.a.lang}>{duplicate.sideA}</span>
			</a>
			{#if duplicate.context}<span class="block">{duplicate.context}</span>{/if}
			<span class="mt-1 block"
				>Dans un autre contexte, une même expression peut avoir un autre sens.</span
			>
		</Notice>
	{/if}

	<FormIssues issues={form.fields.issues()} />

	<div
		class="sticky bottom-0 -mx-4 mt-2 flex gap-2 border-t border-line bg-canvas/90 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-xl md:static md:mx-0 md:justify-end md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none"
	>
		<Button href={cancelHref} size="lg" variant="ghost" class="max-md:hidden">Annuler</Button>
		<SubmitButton
			remote={form}
			active={suggestion.status !== 'loading'}
			name={save.name}
			value={save.value}
			size="lg"
			variant="primary"
			block
			class="md:w-auto"
		>
			{#if duplicate}Enregistrer quand même{:else if mode === 'create'}Enregistrer la carte{:else}Enregistrer
				les modifications{/if}
		</SubmitButton>
	</div>
</form>
