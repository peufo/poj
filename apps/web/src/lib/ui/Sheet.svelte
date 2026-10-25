<script lang="ts">
	import type { Snippet } from 'svelte';

	// Feuille modale native (<dialog>) : glisse du bas au téléphone, centrée sur grand écran.
	// Réservée aux confirmations et aux choix qui protègent une action (supprimer, corriger).
	type Props = {
		open: boolean;
		title: string;
		description?: string;
		children?: Snippet;
		actions?: Snippet;
		onclose?: () => void;
	};

	let { open = $bindable(false), title, description, children, actions, onclose }: Props = $props();

	let dialog: HTMLDialogElement | undefined = $state();
	const id = $props.id();

	$effect(() => {
		if (!dialog) return;
		if (open && !dialog.open) dialog.showModal();
		if (!open && dialog.open) dialog.close();
	});
</script>

<dialog
	bind:this={dialog}
	aria-labelledby="{id}-title"
	aria-describedby={description ? `${id}-desc` : undefined}
	onclose={() => {
		open = false;
		onclose?.();
	}}
	onclick={(event) => {
		if (event.target === dialog) open = false;
	}}
	class="sheet m-0 mt-auto w-full max-w-none bg-transparent p-0 text-ink backdrop:bg-scrim sm:m-auto sm:max-w-md"
>
	<div
		class="flex flex-col gap-5 rounded-t-2xl bg-raised px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-overlay sm:rounded-2xl sm:pb-5"
	>
		<div
			class="mx-auto -mt-2 h-1 w-9 rounded-full bg-line-strong sm:hidden"
			aria-hidden="true"
		></div>
		<div class="flex flex-col gap-1.5">
			<h2 id="{id}-title" class="text-lg font-semibold">{title}</h2>
			{#if description}<p id="{id}-desc" class="text-sm text-ink-2">{description}</p>{/if}
		</div>
		{@render children?.()}
		{#if actions}
			<div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{@render actions()}</div>
		{/if}
	</div>
</dialog>

<style>
	.sheet {
		transition:
			translate 220ms var(--ease-out),
			opacity 220ms var(--ease-out),
			overlay 220ms allow-discrete,
			display 220ms allow-discrete;
		translate: 0 0;
		opacity: 1;
	}

	.sheet:not([open]) {
		translate: 0 24px;
		opacity: 0;
	}

	@starting-style {
		.sheet[open] {
			translate: 0 24px;
			opacity: 0;
		}
	}

	.sheet::backdrop {
		transition:
			opacity 220ms var(--ease-out),
			overlay 220ms allow-discrete,
			display 220ms allow-discrete;
		opacity: 1;
	}

	.sheet:not([open])::backdrop {
		opacity: 0;
	}

	@starting-style {
		.sheet[open]::backdrop {
			opacity: 0;
		}
	}
</style>
