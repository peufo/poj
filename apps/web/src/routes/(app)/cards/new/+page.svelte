<script lang="ts">
	import type { SubmitFunction } from '$app/forms';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import CardForm, { type Duplicate, type Suggestion } from '#lib/components/CardForm.svelte';
	import type { PageProps } from './$types';

	let { form }: PageProps = $props();

	// Les champs partent de la dernière soumission (utile sans JavaScript), puis vivent ici.
	// svelte-ignore state_referenced_locally
	let french = $state(form?.values?.french ?? '');
	// svelte-ignore state_referenced_locally
	let english = $state(form?.values?.english ?? '');
	// svelte-ignore state_referenced_locally
	let context = $state(form?.values?.context ?? '');
	// svelte-ignore state_referenced_locally
	let suggestion: Suggestion = $state(
		form && 'suggestion' in form && form.suggestion ? form.suggestion : { status: 'idle' }
	);
	let saving = $state(false);

	const errors = $derived(form && 'errors' in form ? (form.errors ?? {}) : {});

	// L'avertissement vaut pour l'anglais vérifié : le modifier relance la vérification.
	const duplicate: Duplicate | null = $derived.by(() => {
		const found = form && 'duplicate' in form ? form.duplicate : null;
		if (!found || found.forEnglish !== english.trim()) return null;
		return {
			href: `/cards/${found.id}`,
			french: found.french,
			english: found.english,
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
		bind:french
		bind:english
		bind:context
		{suggestion}
		{duplicate}
		{saving}
		{errors}
		action="?/create"
		translateAction="?/translate"
		confirmValue={english.trim()}
		enhance={submit}
		cancelHref="/cards"
	/>
</div>
