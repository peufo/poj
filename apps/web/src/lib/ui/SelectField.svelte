<script lang="ts">
	import { issueOf, type FormField } from './field.js';
	import Icon from './Icon.svelte';

	// Liste déroulante native, à l'image de `TextField` : libellé, aide ou erreur.
	type Props = {
		label: string;
		/** Champ d'un remote form : donne le nom et l'erreur du champ. */
		field?: FormField;
		/** Sans `field` : nom du champ. */
		name?: string;
		value?: string;
		options: { value: string; label: string }[];
		/** Première option, vide : rien n'est choisi d'avance. */
		placeholder?: string;
		hint?: string;
		error?: string;
		disabled?: boolean;
		onchange?: (value: string) => void;
	};

	let {
		label,
		field,
		name,
		value = $bindable(''),
		options,
		placeholder,
		hint,
		error: errorProp,
		disabled = false,
		onchange
	}: Props = $props();

	const id = $props.id();
	const fieldName = $derived(field?.as('text').name ?? name);
	const error = $derived(errorProp ?? issueOf(field));
	const describedBy = $derived(
		[hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined
	);
</script>

<div class="flex flex-col gap-1.5">
	<label for={id} class="flex min-h-8 items-center pb-0.5 text-sm font-medium text-ink">
		{label}
	</label>

	<div class="relative">
		<select
			{id}
			name={fieldName}
			{disabled}
			bind:value
			onchange={() => onchange?.(value)}
			aria-invalid={error ? 'true' : undefined}
			aria-describedby={describedBy}
			class={[
				'block h-11 w-full appearance-none rounded-lg border bg-inset pr-10 pl-3 text-base text-ink',
				'transition-[border-color,box-shadow] duration-150 ease-out disabled:text-ink-3',
				'focus:border-accent focus:ring-3 focus:ring-accent/20 focus:outline-none',
				error ? 'border-danger' : 'border-line-strong hover:border-ink-3'
			]}
		>
			{#if placeholder !== undefined}<option value="" disabled>{placeholder}</option>{/if}
			{#each options as option (option.value)}
				<option value={option.value}>{option.label}</option>
			{/each}
		</select>
		<Icon
			name="chevron-right"
			size={18}
			class="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 rotate-90 text-ink-3"
		/>
	</div>

	{#if error}
		<p id="{id}-error" class="text-sm text-danger">{error}</p>
	{:else if hint}
		<p id="{id}-hint" class="text-sm text-ink-3">{hint}</p>
	{/if}
</div>
