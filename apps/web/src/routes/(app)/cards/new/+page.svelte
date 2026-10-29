<script lang="ts">
	import type { SubmitFunction } from '$app/forms';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import CardForm, { type Duplicate, type Suggestion } from '#lib/components/CardForm.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

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

	const duplicateKey = $derived((data.deck.duplicateSide === 'sideA' ? sideA : sideB).trim());

	const errors = $derived(form && 'errors' in form ? (form.errors ?? {}) : {});

	// L'avertissement vaut pour la face vérifiée : la modifier relance la vérification.
	const duplicate: Duplicate | null = $derived.by(() => {
		const found = form && 'duplicate' in form ? form.duplicate : null;
		if (!found || found.forValue !== duplicateKey) return null;
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
	<PageHeader title="Nouvelle carte" back={{ href: '/cards', label: 'Cartes' }} />

	<CardForm
		mode="create"
		deck={data.deck}
		bind:sideA
		bind:sideB
		bind:context
		{suggestion}
		{duplicate}
		{saving}
		{errors}
		action="?/create"
		translateAction="?/translate"
		confirmValue={duplicateKey}
		enhance={submit}
		cancelHref="/cards"
	/>
</div>
