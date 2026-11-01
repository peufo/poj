<script lang="ts">
	import FormIssues from '#lib/components/form/FormIssues.svelte';
	import SubmitButton from '#lib/components/form/SubmitButton.svelte';
	import { consent } from './consent.remote';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	/** Bouton choisi, pour n'afficher le chargement que sur lui. */
	let choice = $state<'true' | 'false'>();
</script>

<main class="mx-auto mt-16 max-w-sm px-4">
	<h1 class="mb-6 text-2xl font-semibold">{data.client.name} demande l’accès à vos cartes</h1>
	<p class="mb-2">Si vous autorisez, cette application pourra :</p>
	<ul class="mb-6 list-disc pl-6">
		{#each data.scopes as scope (scope)}
			<li>{scope}</li>
		{/each}
	</ul>
	<p class="text-gray-600 mb-6 text-sm">
		Vous serez ensuite redirigé vers <strong>{data.redirectHost}</strong>.
	</p>
	<form {...consent} class="flex flex-col gap-4">
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
</main>
