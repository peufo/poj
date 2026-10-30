<script lang="ts">
	import { enhance, type SubmitFunction } from '$app/forms';
	import { page } from '$app/state';
	import Button from '#lib/ui/Button.svelte';
	import Notice from '#lib/ui/Notice.svelte';
	import Sheet from '#lib/ui/Sheet.svelte';

	// Suppression en deux temps, avec l'action serveur `?/delete` de la page, qui passe par
	// `unconfirmedDelete` (`lib/server/web/delete-confirm.ts`). Avec JavaScript, le bouton
	// ouvre une feuille de confirmation ; sans, le premier envoi revient avec la confirmation
	// en ligne.

	type Props = {
		/** Libellé du bouton qui lance la suppression (« Supprimer la carte »). */
		label: string;
		/** Question de la confirmation (« Supprimer cette carte ? »). */
		title: string;
		/** Ce que la suppression entraîne. */
		message: string;
	};

	let { label, title, message }: Props = $props();

	/** Confirmation demandée par l'action, sans JavaScript. */
	const confirming = $derived(page.form?.confirmDelete === true);

	let open = $state(false);
	let deleting = $state(false);

	const submit: SubmitFunction = () => {
		deleting = true;
		return async ({ update }) => {
			await update();
			deleting = false;
		};
	};
</script>

<!-- Sans JavaScript, le premier envoi demande confirmation en ligne. -->
<form method="post" action="?/delete" class="flex flex-col gap-4 border-t border-line pt-6">
	{#if confirming}
		<Notice tone="danger" {title}>
			{message}
			{#snippet actions()}
				<Button type="submit" variant="danger" icon="trash" name="confirm" value="1"
					>Supprimer</Button
				>
				<!-- Recharge la page, sans le résultat de l'action. -->
				<Button href={page.url.pathname} variant="ghost">Annuler</Button>
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
				open = true;
			}}
		>
			{label}
		</Button>
	{/if}
</form>

<Sheet bind:open {title} description={message}>
	{#snippet actions()}
		<Button size="lg" onclick={() => (open = false)}>Annuler</Button>
		<form method="post" action="?/delete" use:enhance={submit} class="contents">
			<input type="hidden" name="confirm" value="1" />
			<Button type="submit" size="lg" variant="danger" icon="trash" loading={deleting}>
				Supprimer
			</Button>
		</form>
	{/snippet}
</Sheet>
