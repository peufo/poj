<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<main class="mx-auto mt-16 max-w-sm px-4">
	<h1 class="mb-6 text-2xl font-semibold">{data.client.name} demande l’accès à vos cartes</h1>
	<p class="mb-2">Si vous autorisez, cette application pourra :</p>
	<ul class="mb-6 list-disc pl-6">
		{#each data.scopes as scope (scope)}
			<li>{scope}</li>
		{/each}
	</ul>
	<p class="mb-6 text-sm text-gray-600">
		Vous serez ensuite redirigé vers <strong>{data.redirectHost}</strong>.
	</p>
	<form method="post" use:enhance class="flex flex-col gap-4">
		<input type="hidden" name="oauth_query" value={data.query} />
		<button
			name="accept"
			value="true"
			class="w-full rounded-md bg-blue-600 px-4 py-2 text-white transition hover:bg-blue-700"
			>Autoriser</button
		>
		<button name="accept" value="false" class="w-full rounded-md border border-gray-300 px-4 py-2"
			>Refuser</button
		>
	</form>
	<p class="mt-4 text-red-600">{form?.message ?? ''}</p>
</main>
