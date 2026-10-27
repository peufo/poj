<script lang="ts">
	import Button from '#lib/ui/Button.svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import Sheet from '#lib/ui/Sheet.svelte';

	// Compte et déconnexion au téléphone, où la barre latérale n'existe pas : un bouton
	// d'en-tête qui ouvre une feuille. Sans JavaScript, le bouton déconnecte directement.
	type Props = { email: string; class?: string };

	let { email, class: className = '' }: Props = $props();

	let open = $state(false);
</script>

<form method="post" action="/logout" class={className}>
	<button
		type="submit"
		aria-label="Compte"
		aria-haspopup="dialog"
		onclick={(event) => {
			event.preventDefault();
			open = true;
		}}
		class="-mr-2 flex size-10 items-center justify-center rounded-full text-ink-2 transition-colors duration-150 hover:bg-hover hover:text-ink"
	>
		<Icon name="user" size={22} />
	</button>
</form>

<Sheet bind:open title="Compte" description="Connecté avec {email}.">
	{#snippet actions()}
		<Button size="lg" onclick={() => (open = false)}>Annuler</Button>
		<form method="post" action="/logout" class="contents">
			<Button type="submit" size="lg" variant="primary" icon="logout">Se déconnecter</Button>
		</form>
	{/snippet}
</Sheet>
