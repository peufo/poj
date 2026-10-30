<script lang="ts">
	import type { SubmitFunction } from '$app/forms';
	import DeckForm from '#lib/components/DeckForm.svelte';
	import DeleteConfirm from '#lib/components/DeleteConfirm.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const back = $derived({ href: `/cards?deck=${data.deck.id}`, label: data.deck.name });
	const cardCount = $derived(data.nav.decks.find((d) => d.id === data.deck.id)?.cardCount ?? 0);
	const deleteMessage = $derived(
		`« ${data.deck.name} » sera supprimé. ` +
			(cardCount === 0
				? 'Il ne contient aucune carte.'
				: cardCount === 1
					? 'Sa carte disparaîtra avec lui et ne reviendra plus en révision.'
					: `Ses ${cardCount} cartes disparaîtront avec lui et ne reviendront plus en révision.`)
	);

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

<div class="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 pb-12 md:px-8">
	<PageHeader title="Modifier le deck" {back} />

	<DeckForm
		mode="edit"
		values={form?.values ?? data.values}
		errors={form?.errors}
		{saving}
		action="?/save"
		enhance={submit}
		cancelHref={back.href}
	/>

	<DeleteConfirm label="Supprimer le deck" title="Supprimer ce deck ?" message={deleteMessage} />
</div>
