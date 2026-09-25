<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<h1 class="mb-6 text-2xl font-semibold">Mes notes</h1>

<form method="post" action="?/create" use:enhance class="mb-8 flex flex-col gap-3">
	<input
		name="title"
		placeholder="Titre"
		value={form?.title ?? ''}
		class="rounded-md border border-gray-300 px-3 py-2"
	/>
	<textarea
		name="content"
		placeholder="Contenu"
		rows="3"
		class="rounded-md border border-gray-300 px-3 py-2">{form?.content ?? ''}</textarea
	>
	<button class="self-start rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700">
		Ajouter
	</button>
	{#if form?.message}<p class="text-red-600">{form.message}</p>{/if}
</form>

{#if data.notes.length === 0}
	<p class="text-gray-500">Aucune note pour l’instant.</p>
{:else}
	<ul class="flex flex-col gap-4">
		{#each data.notes as note (note.id)}
			<li class="rounded-md border border-gray-200 p-4">
				<h2 class="font-medium">{note.title}</h2>
				{#if note.content}<p class="mt-1 whitespace-pre-wrap text-gray-700">{note.content}</p>{/if}
				<time class="mt-2 block text-xs text-gray-400" datetime={note.updatedAt.toISOString()}>
					{note.updatedAt.toLocaleString('fr-FR')}
				</time>
			</li>
		{/each}
	</ul>
{/if}
