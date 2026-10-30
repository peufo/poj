<script lang="ts">
	import type { SubmitFunction } from '$app/forms';
	import { page } from '$app/state';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import CardForm, { type Duplicate, type Suggestion } from '#lib/components/CardForm.svelte';
	import SelectField from '#lib/ui/SelectField.svelte';
	import { NO_DECK } from '#lib/format/decks.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	// Deck de la carte : celui de la page, ou celui qu'on choisit dans la liste (à partir de
	// deux decks). Sans choix, des faces neutres et pas de DeepL.
	// svelte-ignore state_referenced_locally
	let deckId = $state(form?.values?.deckId || data.selectedDeck || '');
	const deck = $derived(data.nav.decks.find((d) => d.id === deckId) ?? null);
	const deckOptions = $derived(data.nav.decks.map((d) => ({ value: d.id, label: d.name })));
	// Les actions gardent `?deck=` : retour au deck après l'enregistrement.
	const query = $derived(page.url.searchParams.has('deck') ? `deck=${deckId}&` : '');
	const back = $derived(data.back ?? { href: '/cards', label: 'Cartes' });

	// Les champs partent de la dernière soumission (utile sans JavaScript), puis vivent ici.
	// svelte-ignore state_referenced_locally
	let sideA = $state(form?.values?.sideA ?? '');
	// svelte-ignore state_referenced_locally
	let sideB = $state(form?.values?.sideB ?? '');
	// svelte-ignore state_referenced_locally
	let context = $state(form?.values?.context ?? '');
	// svelte-ignore state_referenced_locally
	let suggestion: Suggestion = $state(
		form && 'suggestion' in form && form.suggestion ? form.suggestion : { status: 'idle' }
	);
	let saving = $state(false);

	const duplicateKey = $derived(
		((deck ?? NO_DECK).duplicateSide === 'sideA' ? sideA : sideB).trim()
	);

	const errors = $derived(form && 'errors' in form ? (form.errors ?? {}) : {});

	// L'avertissement vaut pour la face vérifiée et son deck : changer l'une ou l'autre
	// relance la vérification.
	const duplicate: Duplicate | null = $derived.by(() => {
		const found = form && 'duplicate' in form ? form.duplicate : null;
		if (!found || found.forValue !== duplicateKey || form?.values?.deckId !== deckId) return null;
		return {
			href: `/cards/${found.id}`,
			sideA: found.sideA,
			sideB: found.sideB,
			context: found.context
		};
	});

	const submit: SubmitFunction = ({ action }) => {
		const translating = action.search.includes('/translate');
		if (translating) suggestion = { status: 'loading' };
		else saving = true;

		return async ({ result, update }) => {
			if (translating) {
				await update({ reset: false, refreshAll: false });
				suggestion =
					result.type === 'success' && result.data?.suggestion
						? (result.data.suggestion as Suggestion)
						: { status: 'idle' };
				return;
			}
			await update({ reset: false });
			saving = false;
		};
	};
</script>

<svelte:head><title>Nouvelle carte · Poj</title></svelte:head>

<div class="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 md:px-8">
	<PageHeader title="Nouvelle carte" {back} />

	<CardForm
		mode="create"
		deck={deck ?? NO_DECK}
		bind:sideA
		bind:sideB
		bind:context
		{suggestion}
		{duplicate}
		{saving}
		{errors}
		action="?{query}/create"
		translateAction="?{query}/translate"
		confirmValue={duplicateKey}
		enhance={submit}
		cancelHref={back.href}
	>
		{#snippet header()}
			{#if data.nav.decks.length > 1}
				<SelectField
					label="Deck"
					name="deckId"
					bind:value={deckId}
					options={deckOptions}
					placeholder="Choisis un deck"
					error={errors.deckId}
					onchange={() => (suggestion = { status: 'idle' })}
				/>
			{:else}
				<input type="hidden" name="deckId" value={deckId} />
			{/if}
		{/snippet}
	</CardForm>
</div>
