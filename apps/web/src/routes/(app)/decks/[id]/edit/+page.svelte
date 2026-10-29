<script lang="ts">
	import type { SubmitFunction } from '$app/forms';
	import DeckForm from '#lib/components/DeckForm.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const back = $derived({ href: `/cards?deck=${data.deck.id}`, label: data.deck.name });

	let saving = $state(false);
	const submit: SubmitFunction = () => {
		saving = true;
		return async ({ update }) => {
			await update({ reset: false });
			saving = false;
		};
	};
</script>

<svelte:head><title>Modifier le deck · Poj</title></svelte:head>

<div class="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 md:px-8">
	<PageHeader title="Modifier le deck" {back} />

	<DeckForm
		mode="edit"
		values={form?.values ?? data.values}
		errors={form?.errors}
		{saving}
		enhance={submit}
		cancelHref={back.href}
	/>
</div>
