<script lang="ts">
	import CopyField from '#lib/components/CopyField.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import Notice from '#lib/ui/Notice.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const steps = [
		{
			title: 'Ajoute le connecteur sur claude.ai',
			body: 'Sur claude.ai (web ou application de bureau), ouvre Customize, puis Connectors, et ajoute un connecteur personnalisé. Colle l’URL ci-dessus. L’ajout ne se fait pas depuis l’application mobile.'
		},
		{
			title: 'Connecte-toi à Poj',
			body: 'Claude t’envoie vers Poj : connecte-toi avec ton compte, puis accepte le consentement pour donner accès à tes cartes.'
		},
		{
			title: 'Utilise-le sur mobile et en vocal',
			body: 'Une fois ajouté, le connecteur est disponible dans l’application mobile de Claude, y compris en mode vocal.'
		}
	];
</script>

<svelte:head><title>Connecter Claude · Poj</title></svelte:head>

<div class="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pb-8 md:px-8">
	<PageHeader title="Connecter Claude" />

	<p class="text-ink-2">
		Ajoute Poj comme connecteur dans Claude pour créer et consulter tes cartes en conversation.
	</p>

	<section class="flex flex-col gap-2 rounded-2xl border border-line bg-raised p-5">
		<CopyField label="URL du connecteur" value={data.connectorUrl} />
	</section>

	<ol class="flex flex-col gap-4">
		{#each steps as step, i (step.title)}
			<li class="flex gap-3">
				<span
					class="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent-text tabular-nums"
					>{i + 1}</span
				>
				<div class="flex flex-col gap-1">
					<h2 class="font-semibold">{step.title}</h2>
					<p class="text-sm text-ink-2">{step.body}</p>
				</div>
			</li>
		{/each}
	</ol>

	<Notice tone="warn" title="Plan Free">
		Le plan Free de Claude est limité à un seul connecteur personnalisé.
	</Notice>
</div>
