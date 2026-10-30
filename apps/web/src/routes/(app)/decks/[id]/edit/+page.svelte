<script lang="ts">
	import { enhance, type SubmitFunction } from '$app/forms';
	import DeckForm from '#lib/components/DeckForm.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import Button from '#lib/ui/Button.svelte';
	import Notice from '#lib/ui/Notice.svelte';
	import Sheet from '#lib/ui/Sheet.svelte';
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

	let confirmDelete = $state(false);
	let deleting = $state(false);
	const submitDelete: SubmitFunction = () => {
		deleting = true;
		return async ({ update }) => {
			await update();
			deleting = false;
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

	<!-- Sans JavaScript, le premier envoi demande confirmation en ligne. -->
	<form method="post" action="?/delete" class="flex flex-col gap-4 border-t border-line pt-6">
		{#if form?.confirmDelete}
			<Notice tone="danger" title="Supprimer ce deck ?">
				{deleteMessage}
				{#snippet actions()}
					<Button type="submit" variant="danger" icon="trash" name="confirm" value="1"
						>Supprimer</Button
					>
					<Button href="/decks/{data.deck.id}/edit" variant="ghost">Annuler</Button>
				{/snippet}
			</Notice>
		{:else}
			<Button
				type="submit"
				variant="danger"
				icon="trash"
				class="self-start"
				onclick={(event) => {
					event.preventDefault();
					confirmDelete = true;
				}}
			>
				Supprimer le deck
			</Button>
		{/if}
	</form>
</div>

<Sheet bind:open={confirmDelete} title="Supprimer ce deck ?" description={deleteMessage}>
	{#snippet actions()}
		<Button size="lg" onclick={() => (confirmDelete = false)}>Annuler</Button>
		<form method="post" action="?/delete" use:enhance={submitDelete} class="contents">
			<input type="hidden" name="confirm" value="1" />
			<Button type="submit" size="lg" variant="danger" icon="trash" loading={deleting}>
				Supprimer
			</Button>
		</form>
	{/snippet}
</Sheet>
