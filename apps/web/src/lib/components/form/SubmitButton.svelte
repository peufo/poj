<script lang="ts">
	import type { ComponentProps } from 'svelte';
	import Button from '#lib/ui/Button.svelte';

	// Bouton d'envoi d'un remote form : chargement (et désactivé) tant que l'envoi est en
	// cours. `active` : pour un formulaire à plusieurs boutons, vrai si l'envoi en cours est
	// le sien.
	type Props = Omit<ComponentProps<typeof Button>, 'loading'> & {
		/** Le remote form envoyé (son nombre d'envois en cours). */
		remote: { readonly pending: number };
		active?: boolean;
	};

	let { remote, active = true, children, ...rest }: Props = $props();
</script>

<Button {...rest} type="submit" loading={remote.pending > 0 && active}>
	{@render children?.()}
</Button>
