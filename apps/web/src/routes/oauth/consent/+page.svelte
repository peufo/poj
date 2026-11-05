<script lang="ts">
	import FormIssues from '#lib/components/form/FormIssues.svelte';
	import SubmitButton from '#lib/components/form/SubmitButton.svelte';
	import AuthShell from '#lib/components/AuthShell.svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import Notice from '#lib/ui/Notice.svelte';
	import { consent } from './consent.remote';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	/** Bouton choisi, pour n'afficher le chargement que sur lui. */
	let choice = $state<'true' | 'false'>();
</script>

<svelte:head><title>Autorisation · Poj</title></svelte:head>

<AuthShell>
	<div class="flex flex-col gap-1.5">
		<h1 class="text-2xl font-bold tracking-tight">
			{data.client.name} demande l’accès à tes cartes
		</h1>
		<p class="text-ink-2">Si tu autorises, cette application pourra :</p>
	</div>

	<ul class="flex flex-col gap-2.5 rounded-xl bg-surface px-3.5 py-3">
		{#each data.scopes as scope (scope)}
			<li class="flex gap-3">
				<Icon name="check" size={18} class="mt-px text-accent-text" />
				<span>{scope}</span>
			</li>
		{/each}
	</ul>

	<Notice>
		Tu seras ensuite redirigé vers <span class="font-medium text-ink">{data.redirectHost}</span>.
	</Notice>

	<form {...consent} class="flex flex-col gap-5">
		<input {...consent.fields.oauth_query.as('hidden', data.query)} />
		<FormIssues issues={consent.fields.allIssues()} />
		<SubmitButton
			remote={consent}
			active={choice === 'true'}
			{...consent.fields.accept.as('submit', 'true')}
			variant="primary"
			size="lg"
			block
			onclick={() => (choice = 'true')}
		>
			Autoriser
		</SubmitButton>
		<SubmitButton
			remote={consent}
			active={choice === 'false'}
			{...consent.fields.accept.as('submit', 'false')}
			size="lg"
			block
			onclick={() => (choice = 'false')}
		>
			Refuser
		</SubmitButton>
	</form>
</AuthShell>
