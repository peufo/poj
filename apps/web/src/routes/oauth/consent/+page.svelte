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
	<p class="text-gray-600 mb-6 text-sm">
		Vous serez ensuite redirigé vers <strong>{data.redirectHost}</strong>.
	</p>
	<form method="post" use:enhance class="flex flex-col gap-4">
		<input type="hidden" name="oauth_query" value={data.query} />
		<button
			name="accept"
			value="true"
			class="bg-blue-600 text-white hover:bg-blue-700 w-full rounded-md px-4 py-2 transition"
			>Autoriser</button
		>
		<button name="accept" value="false" class="border-gray-300 w-full rounded-md border px-4 py-2"
			>Refuser</button
		>
	</form>
	<p class="text-red-600 mt-4">{form?.message ?? ''}</p>
</main>
