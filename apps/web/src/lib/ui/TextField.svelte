<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		label: string;
		name: string;
		value?: string;
		multiline?: boolean;
		rows?: number;
		hint?: string;
		error?: string;
		required?: boolean;
		optional?: boolean;
		placeholder?: string;
		type?: 'text' | 'email' | 'password' | 'search';
		autocomplete?: HTMLInputElement['autocomplete'];
		/** Langue du contenu saisi : pilote le correcteur orthographique. */
		lang?: string;
		minlength?: number;
		/** Action alignée sur le libellé (ex. « Traduire avec DeepL »). */
		action?: Snippet;
		/** Contenu sous le champ (ex. suggestion DeepL). */
		below?: Snippet;
		oninput?: (event: Event) => void;
	};

	let {
		label,
		name,
		value = $bindable(''),
		multiline = false,
		rows = 2,
		hint,
		error,
		required = false,
		optional = false,
		placeholder,
		type = 'text',
		autocomplete,
		lang,
		minlength,
		action,
		below,
		oninput
	}: Props = $props();

	const id = $props.id();
	const describedBy = $derived(
		[hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined
	);

	const control = $derived(
		[
			'block w-full rounded-lg border bg-inset px-3 text-base text-ink placeholder:text-ink-3',
			'transition-[border-color,box-shadow] duration-150 ease-out',
			'focus:border-accent focus:ring-3 focus:ring-accent/20 focus:outline-none',
			error ? 'border-danger' : 'border-line-strong hover:border-ink-3'
		].join(' ')
	);
</script>

<div class="flex flex-col gap-1.5">
	<div class="flex min-h-8 items-center justify-between gap-3">
		<label for={id} class="pb-0.5 text-sm font-medium text-ink">
			{label}
			{#if optional}<span class="font-normal text-ink-3"> · facultatif</span>{/if}
		</label>
		{@render action?.()}
	</div>

	{#if multiline}
		<textarea
			{id}
			{name}
			{rows}
			{required}
			{placeholder}
			{lang}
			bind:value
			{oninput}
			aria-invalid={error ? 'true' : undefined}
			aria-describedby={describedBy}
			class="{control} field-sizing-content resize-none py-2.5"
			style="min-height: calc({rows}lh + 1.25rem + 2px)"></textarea>
	{:else}
		<input
			{id}
			{name}
			{type}
			{required}
			{placeholder}
			{autocomplete}
			{lang}
			{minlength}
			bind:value
			{oninput}
			aria-invalid={error ? 'true' : undefined}
			aria-describedby={describedBy}
			class="{control} h-11"
		/>
	{/if}

	{#if error}
		<p id="{id}-error" class="text-sm text-danger">{error}</p>
	{:else if hint}
		<p id="{id}-hint" class="text-sm text-ink-3">{hint}</p>
	{/if}

	{@render below?.()}
</div>
