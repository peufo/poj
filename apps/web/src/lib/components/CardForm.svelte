<script lang="ts" module>
	export type Suggestion =
		| { status: 'idle' }
		| { status: 'loading' }
		| { status: 'ready'; text: string }
		| { status: 'error'; message: string };

	export type Duplicate = { href: string; sideA: string; sideB: string; context: string | null };
</script>

<script lang="ts">
	import type { SubmitFunction } from '$app/forms';
	import { onMount, type Snippet } from 'svelte';
	import { fromAction } from 'svelte/attachments';
	import { enhance as kitEnhance } from '$app/forms';
	import { exampleFor, faces, type DeckView } from '#lib/format/decks.js';
	import Button from '#lib/ui/Button.svelte';
	import Notice from '#lib/ui/Notice.svelte';
	import TextField from '#lib/ui/TextField.svelte';

	// Formulaire de carte (création et modification, WEB-2 et WEB-5). Purement présentationnel :
	// la page fournit l'action du formulaire, la suggestion DeepL et l'éventuel doublon.
	//
	// Sans JavaScript, il reste utilisable : « Traduire avec DeepL » poste le formulaire sur
	// `translateAction`, la confirmation d'un doublon renvoie la face confirmée
	// (`confirmValue`), et l'accord sur la réinitialisation part dans `acknowledge_reset`
	// dès que l'avertissement est affiché.

	type Props = {
		mode: 'create' | 'edit';
		/** Deck de la carte : nomme les faces ; DeepL seulement pour un deck de langue. */
		deck: DeckView;
		sideA?: string;
		sideB?: string;
		context?: string;
		/** Texte enregistré, en modification : un écart réinitialise la progression. */
		original?: { sideA: string; sideB: string };
		suggestion?: Suggestion;
		duplicate?: Duplicate | null;
		saving?: boolean;
		errors?: Partial<Record<'sideA' | 'sideB' | 'context', string>>;
		action?: string;
		/** Action serveur de la suggestion DeepL : le bouton devient un envoi du formulaire. */
		translateAction?: string;
		/** Valeur envoyée avec `confirm` par « Enregistrer quand même ». */
		confirmValue?: string;
		/** Amélioration progressive des actions serveur (`use:enhance`). */
		enhance?: SubmitFunction;
		cancelHref: string;
		/** Champs en tête du formulaire (ex. le choix du deck). */
		header?: Snippet;
		ontranslate?: () => void;
		onsubmit?: (event: SubmitEvent) => void;
	};

	let {
		mode,
		deck,
		sideA = $bindable(''),
		sideB = $bindable(''),
		context = $bindable(''),
		original,
		suggestion = { status: 'idle' },
		duplicate = null,
		saving = false,
		errors = {},
		action,
		translateAction,
		confirmValue = '1',
		enhance,
		cancelHref,
		header,
		ontranslate,
		onsubmit
	}: Props = $props();

	const enhanceForm = (form: HTMLFormElement, submit: SubmitFunction) => kitEnhance(form, submit);

	const face = $derived(faces(deck));

	// Sans JavaScript, le bouton DeepL reste actif : le serveur valide la face A.
	let hydrated = $state(false);
	onMount(() => (hydrated = true));

	const resets = $derived(
		mode === 'edit' &&
			!!original &&
			(sideA.trim() !== original.sideA || sideB.trim() !== original.sideB)
	);
	const taken = $derived(suggestion.status === 'ready' && sideB.trim() === suggestion.text);
</script>

<form
	method="post"
	{action}
	{onsubmit}
	{@attach enhance && fromAction(enhanceForm, () => enhance)}
	class="flex flex-col gap-6"
>
	{@render header?.()}

	<TextField
		label={face.a.label}
		name="sideA"
		bind:value={sideA}
		multiline
		rows={1}
		required
		lang={face.a.lang ?? undefined}
		error={errors.sideA}
		placeholder={exampleFor(face.a)}
	/>

	<TextField
		label="Contexte d'origine"
		name="context"
		bind:value={context}
		multiline
		rows={2}
		optional
		lang="fr"
		error={errors.context}
		hint="Où, quand, avec qui ? Il lève l'ambiguïté et servira d'indice en révision."
	/>

	<TextField
		label={face.b.label}
		name="sideB"
		bind:value={sideB}
		multiline
		rows={1}
		required
		lang={face.b.lang ?? undefined}
		error={errors.sideB}
		placeholder={exampleFor(face.b)}
	>
		{#snippet action()}
			<!-- Pas de second avis DeepL pour un sujet. -->
			{#if deck.kind === 'language'}<Button
					size="sm"
					variant="ghost"
					icon="translate"
					class="-mr-2 text-accent-text! hover:bg-accent-soft!"
					type={translateAction ? 'submit' : 'button'}
					formaction={translateAction}
					formnovalidate={translateAction ? true : undefined}
					disabled={hydrated && !sideA.trim()}
					loading={suggestion.status === 'loading'}
					onclick={ontranslate}
				>
					Traduire avec DeepL
				</Button>{/if}
		{/snippet}
		{#snippet below()}
			{#if suggestion.status === 'loading'}
				<div
					class="flex h-14 items-center gap-3 rounded-lg bg-surface px-3"
					aria-label="Traduction en cours"
				>
					<span class="h-3 w-12 animate-pulse rounded-full bg-line-strong"></span>
					<span class="h-3 w-32 animate-pulse rounded-full bg-line-strong"></span>
				</div>
			{:else if suggestion.status === 'ready'}
				<div class="flex min-h-14 items-center gap-3 rounded-lg bg-surface py-2 pr-2 pl-3">
					<div class="min-w-0 flex-1">
						<p class="text-xs text-ink-3">
							Suggestion DeepL{context.trim() ? ', avec le contexte' : ''}
						</p>
						<p class="text-ink" lang={face.b.lang}>{suggestion.text}</p>
					</div>
					<Button
						size="sm"
						icon={taken ? 'check' : undefined}
						disabled={taken}
						onclick={() => (sideB = suggestion.status === 'ready' ? suggestion.text : sideB)}
					>
						{taken ? 'Reprise' : 'Reprendre'}
					</Button>
				</div>
			{:else if suggestion.status === 'error'}
				<p class="flex items-start gap-1.5 text-sm text-warn">{suggestion.message}</p>
			{/if}
		{/snippet}
	</TextField>

	{#if resets}
		<input type="hidden" name="acknowledge_reset" value="1" />
		<Notice tone="warn" title="La progression repartira de zéro">
			Tu modifies {face.a.the} ou {face.b.the} :
			{deck.bothDirections
				? 'les deux sens redeviendront neufs et dus immédiatement.'
				: 'la carte redeviendra neuve et due immédiatement.'}
			L'historique des réponses est conservé.
		</Notice>
	{/if}

	{#if duplicate}
		<Notice
			tone="warn"
			title="Une carte a déjà {face[deck.duplicateSide === 'sideA' ? 'a' : 'b'].same}"
		>
			<a
				href={duplicate.href}
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

	<div
		class="sticky bottom-0 -mx-4 mt-2 flex gap-2 border-t border-line bg-canvas/90 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-xl md:static md:mx-0 md:justify-end md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none"
	>
		<Button href={cancelHref} size="lg" variant="ghost" class="max-md:hidden">Annuler</Button>
		<Button
			type="submit"
			size="lg"
			variant="primary"
			block
			loading={saving}
			class="md:w-auto"
			name={duplicate ? 'confirm' : undefined}
			value={duplicate ? confirmValue : undefined}
		>
			{#if duplicate}Enregistrer quand même{:else if mode === 'create'}Enregistrer la carte{:else}Enregistrer
				les modifications{/if}
		</Button>
	</div>
</form>
