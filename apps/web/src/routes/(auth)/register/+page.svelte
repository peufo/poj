<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
</script>

<h1 class="mb-6 text-2xl font-semibold">Inscription</h1>
<form method="post" use:enhance class="flex flex-col gap-4">
	<label>
		Nom
		<input
			name="name"
			required
			autocomplete="name"
			value={form?.name ?? ''}
			class="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none"
		/>
	</label>
	<label>
		Email
		<input
			type="email"
			name="email"
			required
			autocomplete="email"
			value={form?.email ?? ''}
			class="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none"
		/>
	</label>
	<label>
		Mot de passe
		<input
			type="password"
			name="password"
			required
			minlength="8"
			autocomplete="new-password"
			class="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none"
		/>
	</label>
	<button class="w-full rounded-md bg-blue-600 px-4 py-2 text-white transition hover:bg-blue-700"
		>Créer mon compte</button
	>
</form>
<p class="mt-4 text-red-600">{form?.message ?? ''}</p>
<p class="mt-4 text-sm">
	Déjà inscrit ? <a class="text-blue-600 underline" href="/login">Se connecter</a>
</p>
