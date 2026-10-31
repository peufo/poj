<script lang="ts">
	import type { RemoteForm } from '$app/server';
	import Button from '#lib/ui/Button.svelte';
	import Sheet from '#lib/ui/Sheet.svelte';
	import FormIssues from './form/FormIssues.svelte';
	import SubmitButton from './form/SubmitButton.svelte';

	// Suppression en deux temps : le bouton ouvre une feuille de confirmation, dont le bouton
	// envoie le remote form de suppression de la page (`deleteCard`, `deleteDeck`).

	type Props = {
		/** Remote form de suppression, sans champ. */
		form: RemoteForm<void, unknown>;
		/** Libellé du bouton qui lance la suppression (« Supprimer la carte »). */
		label: string;
		/** Question de la confirmation (« Supprimer cette carte ? »). */
		title: string;
		/** Ce que la suppression entraîne. */
		message: string;
	};

	let { form, label, title, message }: Props = $props();

	let open = $state(false);
</script>

<div class="flex flex-col gap-4 border-t border-line pt-6">
	<Button variant="danger" icon="trash" class="self-start" onclick={() => (open = true)}>
		{label}
	</Button>
</div>

<Sheet bind:open {title} description={message}>
	<FormIssues issues={form.fields.allIssues()} />
	{#snippet actions()}
		<Button size="lg" onclick={() => (open = false)}>Annuler</Button>
		<form {...form} class="contents">
			<SubmitButton remote={form} size="lg" variant="danger" icon="trash">Supprimer</SubmitButton>
		</form>
	{/snippet}
</Sheet>
