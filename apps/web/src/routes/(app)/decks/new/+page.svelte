<script lang="ts">
	import type { SubmitFunction } from '$app/forms';
	import AccountMenu from '#lib/components/AccountMenu.svelte';
	import DeckForm from '#lib/components/DeckForm.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let saving = $state(false);
	const submit: SubmitFunction = () => {
		saving = true;
		return async ({ update }) => {
			await update({ reset: false });
			saving = false;
		};
	};
</script>

<svelte:head><title>Nouveau deck · Poj</title></svelte:head>

<div class="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 md:px-8">
	{#if data.firstDeck}
		<PageHeader title="Ton premier deck">
			{#snippet actions()}
				<!-- Au téléphone, sans barre latérale ni onglets ici : le compte reste joignable. -->
				<AccountMenu email={data.user.email} isAdmin={data.user.isAdmin} class="md:hidden" />
			{/snippet}
			<p class="max-w-[55ch] pt-1 text-ink-2">
				Bienvenue sur Poj. Tes cartes vivent dans des decks : une langue que tu apprends, ou un
				sujet à retenir. Crée le premier pour commencer.
			</p>
		</PageHeader>
	{:else}
		<PageHeader title="Nouveau deck" back={{ href: '/cards', label: 'Cartes' }} />
	{/if}

	<DeckForm
		mode="create"
		values={form?.values ?? data.values}
		errors={form?.errors}
		{saving}
		enhance={submit}
		cancelHref={data.firstDeck ? undefined : '/cards'}
	/>
</div>
