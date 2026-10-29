<script lang="ts">
	import { fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import Button from '#lib/ui/Button.svelte';
	import Icon, { iconNames } from '#lib/ui/Icon.svelte';
	import Kbd from '#lib/ui/Kbd.svelte';
	import Notice from '#lib/ui/Notice.svelte';
	import SegmentedControl from '#lib/ui/SegmentedControl.svelte';
	import Sheet from '#lib/ui/Sheet.svelte';
	import TextField from '#lib/ui/TextField.svelte';
	import CardRow from '#lib/components/CardRow.svelte';
	import DueChip from '#lib/components/DueChip.svelte';
	import Horizon from '#lib/components/Horizon.svelte';
	import MasteryBar from '#lib/components/MasteryBar.svelte';
	import MasteryMeter from '#lib/components/MasteryMeter.svelte';
	import RatingBar from '#lib/components/RatingBar.svelte';
	import RatingPill from '#lib/components/RatingPill.svelte';
	import Wordmark from '#lib/components/Wordmark.svelte';
	import { ratingMeanings, ratings } from '#lib/format/labels.js';
	import { LAB_DECK, LAB_NOW as now, findCard, horizon, masteryCounts } from '#lib/lab/fixtures.js';

	const sample = findCard('tenir-le-coup')!;
	const sample2 = findCard('bouchon')!;
	const days = horizon(14);
	const hour = 3_600_000;
	const levels = [0, 1, 2, 3] as const;

	const screens = [
		{
			href: '/lab/cards',
			title: 'Cartes',
			story: 'WEB-3',
			text: "Le paquet : dû aujourd'hui, horizon, maîtrise, recherche."
		},
		{
			href: '/lab/cards/tenir-le-coup',
			title: 'Détail d’une carte',
			story: 'WEB-4, WEB-6',
			text: 'Les deux sens, leur échéance, l’historique, la suppression.'
		},
		{
			href: '/lab/cards/new',
			title: 'Nouvelle carte',
			story: 'WEB-2',
			text: 'Contexte, suggestion DeepL, doublon.'
		},
		{
			href: '/lab/cards/tenir-le-coup/edit',
			title: 'Modifier une carte',
			story: 'WEB-5',
			text: 'Avertissement de réinitialisation.'
		},
		{
			href: '/lab/review',
			title: 'Réviser',
			story: 'WEB-7, WEB-8',
			text: 'Question, indice, notes au pouce, correction, rien à réviser.'
		}
	];

	type Swatch = { token: string; role: string };
	const palette: { group: string; note: string; swatches: Swatch[] }[] = [
		{
			group: 'Surfaces',
			note: 'Du fond vers l’avant. Les panneaux se distinguent par la valeur, pas par une bordure.',
			swatches: [
				{ token: 'canvas', role: 'Fond de page' },
				{ token: 'surface', role: 'Panneaux, barre latérale, champs de recherche' },
				{ token: 'raised', role: 'Ce qui flotte : carte de révision, feuilles' },
				{ token: 'inset', role: 'Champs de saisie' },
				{ token: 'hover', role: 'Survol et élément courant' },
				{ token: 'line', role: 'Filets et séparateurs' },
				{ token: 'line-strong', role: 'Bordures de champs et de boutons' }
			]
		},
		{
			group: 'Encre',
			note: 'Trois niveaux, tous à 4,5:1 au moins sur canvas et surface.',
			swatches: [
				{ token: 'ink', role: 'Texte principal' },
				{ token: 'ink-2', role: 'Texte secondaire, traduction en liste' },
				{ token: 'ink-3', role: 'Métadonnées, libellés, placeholders' }
			]
		},
		{
			group: 'Accent',
			note: 'Un seul accent : l’action principale, la sélection et ce qui est dû. Jamais décoratif.',
			swatches: [
				{ token: 'accent', role: 'Bouton principal, barre du jour' },
				{ token: 'accent-text', role: 'Accent en texte (liens, réponse)' },
				{ token: 'accent-soft', role: 'Puce « à réviser », filtre actif' }
			]
		},
		{
			group: 'Notes',
			note: 'Réservées aux quatre notes FSRS, toujours accompagnées de leur nom.',
			swatches: [
				{ token: 'again', role: ratingMeanings.again },
				{ token: 'hard', role: ratingMeanings.hard },
				{ token: 'good', role: ratingMeanings.good },
				{ token: 'easy', role: ratingMeanings.easy }
			]
		},
		{
			group: 'États et maîtrise',
			note: 'Avertissement, danger, et une rampe neutre pour les niveaux de maîtrise : l’indigo reste à l’action.',
			swatches: [
				{ token: 'warn', role: 'Doublon, réinitialisation, DeepL indisponible' },
				{ token: 'danger', role: 'Suppression, erreurs de saisie' },
				{ token: 'level-1', role: 'Maîtrise : En cours' },
				{ token: 'level-3', role: 'Maîtrise : Solide' }
			]
		}
	];

	const typeScale = [
		{
			cls: 'text-4xl font-semibold tracking-tight',
			name: '4xl · 42/48',
			use: 'Face de révision, grand écran',
			sample: 'to hang in there'
		},
		{
			cls: 'text-3xl font-semibold tracking-tight',
			name: '3xl · 34/40',
			use: 'Face de révision',
			sample: 'tenir le coup'
		},
		{
			cls: 'text-2xl font-bold tracking-tight',
			name: '2xl · 28/34',
			use: 'Titre d’écran',
			sample: 'Cartes'
		},
		{
			cls: 'text-xl font-semibold tracking-tight',
			name: 'xl · 23/30',
			use: 'Échéance d’un sens',
			sample: 'Dans 6 jours'
		},
		{
			cls: 'text-lg font-semibold',
			name: 'lg · 19/26',
			use: 'Titre de section',
			sample: 'Progression'
		},
		{
			cls: 'text-base',
			name: 'base · 16/24',
			use: 'Texte, champs (16 px : pas de zoom sur iOS)',
			sample: 'Un collègue, la veille d’une mise en production difficile.'
		},
		{
			cls: 'text-sm text-ink-2',
			name: 'sm · 14/20',
			use: 'Libellés, métadonnées',
			sample: 'Créée le 16 sept. 2026 via Claude'
		},
		{
			cls: 'text-xs font-medium text-ink-2',
			name: 'xs · 12/16',
			use: 'Puces, compteurs',
			sample: 'EN · 6 j'
		}
	];

	let fieldValue = $state('tenir le coup');
	let segment = $state<'all' | 'due'>('all');
	let sheetOpen = $state(false);
	let revealDemo = $state(false);
	let demoKey = $state(0);
</script>

<svelte:head><title>Matériel · Poj lab</title></svelte:head>

{#snippet themePreview(theme: 'light' | 'dark')}
	<div
		data-theme={theme}
		class="flex flex-col gap-4 rounded-2xl bg-canvas p-4 ring-1 ring-line sm:p-5"
	>
		<p class="flex items-center justify-between text-sm">
			<span class="font-semibold">{theme === 'light' ? 'Clair' : 'Sombre'}</span>
			<Wordmark size={18} />
		</p>
		<div class="flex items-center justify-between gap-3 rounded-xl bg-surface p-3">
			<p class="font-semibold"><span class="text-accent-text">10</span> dues aujourd’hui</p>
			<Button size="sm" variant="primary" icon="review">Réviser</Button>
		</div>
		<ul>
			<CardRow
				href="#themes"
				sideA={sample.sideA}
				sideB={sample.sideB}
				deck={LAB_DECK}
				reviews={sample.reviews}
				{now}
			/>
			<CardRow
				href="#themes"
				sideA={sample2.sideA}
				sideB={sample2.sideB}
				deck={LAB_DECK}
				reviews={sample2.reviews}
				{now}
			/>
		</ul>
		<RatingBar intervals={sample.reviews[0].intervals} shortcuts={false} onrate={() => {}} />
	</div>
{/snippet}

{#snippet section(id: string, title: string, intro: string)}
	<div class="flex flex-col gap-1.5">
		<h2 {id} class="scroll-mt-20 text-xl font-semibold tracking-tight">{title}</h2>
		<p class="max-w-[65ch] text-ink-2">{intro}</p>
	</div>
{/snippet}

<main class="mx-auto flex w-full max-w-5xl flex-col gap-16 px-4 pt-8 pb-24 md:px-8 md:pt-12">
	<header class="flex flex-col gap-6">
		<div class="flex flex-col gap-2">
			<h1 class="text-3xl font-bold tracking-tight">Matériel</h1>
			<p class="max-w-[60ch] text-lg text-ink-2">
				Le design system de Poj : le standard des apps de flashcards, au niveau de finition de
				Linear et de Things. Clair et sombre sont conçus ensemble et suivent le système.
			</p>
		</div>
		<nav aria-label="Maquettes" class="flex flex-col">
			<p class="pb-1 text-sm font-medium text-ink-3">Maquettes (cartes d’exemple)</p>
			<ul>
				{#each screens as screen (screen.href)}
					<li class="group/row">
						<a
							href={screen.href}
							class="-mx-3 flex items-center gap-3 rounded-lg px-3 transition-colors duration-150 hover:bg-hover"
						>
							<span
								class="flex flex-1 flex-col gap-0.5 border-b border-line py-3 group-last/row:border-transparent sm:flex-row sm:items-baseline sm:gap-4"
							>
								<span class="font-medium sm:w-48">{screen.title}</span>
								<span class="flex-1 text-sm text-ink-2">{screen.text}</span>
								<span class="text-xs text-ink-3">{screen.story}</span>
							</span>
							<Icon name="chevron-right" size={18} class="text-ink-3" />
						</a>
					</li>
				{/each}
			</ul>
		</nav>
	</header>

	<section class="flex flex-col gap-6" aria-labelledby="themes">
		{@render section(
			'themes',
			'Deux thèmes, conçus ensemble',
			'Chaque couleur est déclarée par paire avec light-dark(). Le sombre n’est pas l’inverse du clair : ses surfaces montent en valeur vers l’avant, ses ombres deviennent un liseré de lumière, ses couleurs de note gagnent en clarté pour garder le contraste.'
		)}
		<div class="grid gap-4 md:grid-cols-2">
			{@render themePreview('light')}
			{@render themePreview('dark')}
		</div>
	</section>

	<section class="flex flex-col gap-8" aria-labelledby="colors">
		{@render section(
			'colors',
			'Couleurs',
			'Stratégie retenue : des neutres froids à peine teintés, un accent indigo, et des couleurs de sens qui ne servent qu’à leur rôle. La palette par défaut de Tailwind est désactivée.'
		)}
		{#each palette as group (group.group)}
			<div class="grid gap-4 md:grid-cols-[14rem_1fr]">
				<div class="flex flex-col gap-1">
					<h3 class="font-semibold">{group.group}</h3>
					<p class="text-sm text-ink-2">{group.note}</p>
				</div>
				<ul class="flex flex-col">
					{#each group.swatches as swatch (swatch.token)}
						<li class="flex items-center gap-4 border-b border-line py-2.5 last:border-0">
							<span class="flex shrink-0 gap-1" aria-hidden="true">
								{#each ['light', 'dark'] as t (t)}
									<span data-theme={t} class="rounded-lg bg-canvas p-1 ring-1 ring-line">
										<span
											class="block size-7 rounded-md ring-1 ring-inset ring-line"
											style="background: var(--color-{swatch.token})"
										></span>
									</span>
								{/each}
							</span>
							<span class="flex min-w-0 flex-1 flex-col sm:flex-row sm:items-baseline sm:gap-4">
								<code class="font-mono text-sm text-ink sm:w-36">{swatch.token}</code>
								<span class="text-sm text-ink-2">{swatch.role}</span>
							</span>
						</li>
					{/each}
				</ul>
			</div>
		{/each}
	</section>

	<section class="flex flex-col gap-6" aria-labelledby="type">
		{@render section(
			'type',
			'Typographie',
			'Une seule famille : la police du système, SF sur iPhone et Mac. Échelle fixe en rem, rapport proche de 1,2. Les chiffres des données sont tabulaires.'
		)}
		<ul class="flex flex-col">
			{#each typeScale as step (step.name)}
				<li
					class="grid gap-1 border-b border-line py-4 last:border-0 md:grid-cols-[14rem_1fr] md:items-baseline md:gap-4"
				>
					<span class="flex flex-col">
						<code class="font-mono text-sm text-ink">{step.name}</code>
						<span class="text-sm text-ink-3">{step.use}</span>
					</span>
					<span class="min-w-0 {step.cls}">{step.sample}</span>
				</li>
			{/each}
		</ul>
	</section>

	<section class="flex flex-col gap-6" aria-labelledby="shape">
		{@render section(
			'shape',
			'Formes, profondeur, mouvement',
			'Rayons de 6 à 20 px selon la taille de l’objet. Une ombre douce et décalée, seulement pour ce qui flotte. Le mouvement dit un changement d’état, en 150 à 220 ms, ease-out, et s’efface si le système demande moins d’animations.'
		)}
		<div class="grid gap-4 md:grid-cols-3">
			<div class="flex flex-col gap-3 rounded-2xl bg-surface p-4">
				<h3 class="text-sm font-semibold">Rayons</h3>
				<div class="flex items-end gap-3">
					{#each [['sm', 'rounded-sm', 'puces'], ['lg', 'rounded-lg', 'champs'], ['xl', 'rounded-xl', 'notes'], ['2xl', 'rounded-2xl', 'panneaux']] as [name, cls, use] (name)}
						<span class="flex flex-col items-center gap-1.5">
							<span class="size-12 border border-line-strong bg-raised {cls}"></span>
							<span class="text-xs text-ink-3">{use}</span>
						</span>
					{/each}
				</div>
			</div>
			<div class="flex flex-col gap-3 rounded-2xl bg-surface p-4">
				<h3 class="text-sm font-semibold">Profondeur</h3>
				<div class="flex gap-3">
					<span
						class="flex h-16 flex-1 items-end rounded-xl bg-raised p-2 text-xs text-ink-3 shadow-raised"
						>raised</span
					>
					<span
						class="flex h-16 flex-1 items-end rounded-xl bg-raised p-2 text-xs text-ink-3 shadow-overlay"
						>overlay</span
					>
				</div>
			</div>
			<div class="flex flex-col gap-3 rounded-2xl bg-surface p-4">
				<h3 class="text-sm font-semibold">Mouvement</h3>
				<div class="flex min-h-16 flex-col justify-center gap-1">
					<p class="font-semibold">tenir le coup</p>
					{#if revealDemo}
						{#key demoKey}
							<p
								in:fly={{ y: 6, duration: 200, easing: cubicOut }}
								class="font-semibold text-accent-text"
								lang="en"
							>
								to hang in there
							</p>
						{/key}
					{:else}
						<p class="text-ink-3">…</p>
					{/if}
				</div>
				<Button
					size="sm"
					onclick={() => {
						revealDemo = true;
						demoKey += 1;
					}}
				>
					{revealDemo ? 'Rejouer' : 'Afficher la réponse'}
				</Button>
			</div>
		</div>
	</section>

	<section class="flex flex-col gap-10" aria-labelledby="components">
		{@render section(
			'components',
			'Composants',
			'Primitives dans src/lib/ui, composants de Poj dans src/lib/components. Chaque composant interactif a ses états : survol, focus clavier, désactivé, chargement, erreur.'
		)}

		<div class="flex flex-col gap-4">
			<h3 class="font-semibold">Boutons</h3>
			<div class="flex flex-wrap items-center gap-3">
				<Button variant="primary" icon="review">Réviser</Button>
				<Button icon="pencil">Modifier</Button>
				<Button variant="ghost" icon="translate">Traduire avec DeepL</Button>
				<Button variant="danger" icon="trash">Supprimer</Button>
			</div>
			<div class="flex flex-wrap items-center gap-3">
				<Button variant="primary" size="lg">Afficher la réponse</Button>
				<Button variant="primary" loading>Enregistrement</Button>
				<Button variant="primary" disabled>Désactivé</Button>
				<Button size="sm" icon="plus">Petit</Button>
			</div>
		</div>

		<div class="grid gap-6 md:grid-cols-2">
			<div class="flex flex-col gap-4">
				<h3 class="font-semibold">Champs</h3>
				<TextField label="Français" name="demo-fr" bind:value={fieldValue} lang="fr" />
				<TextField
					label="Contexte d’origine"
					name="demo-ctx"
					multiline
					optional
					hint="Où, quand, avec qui ? Il servira d’indice."
				/>
				<TextField label="Anglais" name="demo-en" lang="en" error="L’anglais est obligatoire." />
			</div>
			<div class="flex flex-col gap-4">
				<h3 class="font-semibold">Notices</h3>
				<Notice title="Une carte a déjà cet anglais" tone="warn"
					>« to hang in there » · tenir le coup</Notice
				>
				<Notice title="La progression repartira de zéro" tone="warn"
					>Les deux sens redeviendront neufs et dus immédiatement.</Notice
				>
				<Notice tone="danger" title="Enregistrement impossible"
					>La connexion au serveur a échoué. Tes saisies sont conservées : réessaie.</Notice
				>
				<Notice>Une révision anticipée fait peu progresser une carte, mais ne fausse rien.</Notice>
			</div>
		</div>

		<div class="grid gap-6 md:grid-cols-2">
			<div class="flex flex-col gap-4">
				<h3 class="font-semibold">Échéances</h3>
				<div class="flex flex-wrap gap-2">
					<DueChip deck={LAB_DECK} direction="a_to_b" due={now} {now} isNew />
					<DueChip deck={LAB_DECK} direction="a_to_b" due={new Date(now.getTime() - hour)} {now} />
					<DueChip
						deck={LAB_DECK}
						direction="b_to_a"
						due={new Date(now.getTime() + 3 * hour)}
						{now}
					/>
					<DueChip
						deck={LAB_DECK}
						direction="b_to_a"
						due={new Date(now.getTime() + 24 * hour)}
						{now}
					/>
					<DueChip
						deck={LAB_DECK}
						direction="a_to_b"
						due={new Date(now.getTime() + 12 * 24 * hour)}
						{now}
					/>
					<DueChip
						deck={LAB_DECK}
						direction="b_to_a"
						due={new Date(now.getTime() + 70 * 24 * hour)}
						{now}
					/>
				</div>
				<p class="text-sm text-ink-2">
					La flèche et la langue disent ce qu’il faut produire : « → EN », c’est voir le français et
					répondre en anglais.
				</p>
			</div>
			<div class="flex flex-col gap-4">
				<h3 class="font-semibold">
					Maîtrise <span class="font-normal text-ink-3">(libellés à valider)</span>
				</h3>
				<div class="flex flex-wrap gap-x-6 gap-y-2">
					{#each levels as level (level)}
						<MasteryMeter {level} />
					{/each}
				</div>
				<MasteryBar counts={masteryCounts} />
				<p class="text-sm text-ink-2">
					Nouvelle : jamais notée. En cours : stabilité sous 7 jours. Acquise : de 7 à 30 jours.
					Solide : au-delà.
				</p>
			</div>
		</div>

		<div class="grid gap-6 md:grid-cols-2">
			<div class="flex flex-col gap-4">
				<h3 class="font-semibold">Notes</h3>
				<RatingBar intervals={sample.reviews[0].intervals} onrate={() => {}} />
				<RatingBar intervals={sample.reviews[0].intervals} hintUsed onrate={() => {}} />
				<p class="text-sm text-ink-2">
					Après l’indice, Good et Easy se désactivent : Hard au mieux.
				</p>
				<div class="flex gap-2">
					{#each ratings as r (r)}<RatingPill rating={r} />{/each}
				</div>
			</div>
			<div class="flex flex-col gap-4">
				<h3 class="font-semibold">Horizon</h3>
				<div class="rounded-2xl bg-surface p-4"><Horizon {days} /></div>
				<p class="text-sm text-ink-2">
					Une série, une teinte. Aujourd’hui (retard compris) en accent plein. Toucher un jour
					filtre la liste ; le survol annonce le détail au-dessus.
				</p>
			</div>
		</div>

		<div class="grid gap-6 md:grid-cols-2">
			<div class="flex flex-col gap-4">
				<h3 class="font-semibold">Contrôles</h3>
				<div class="flex flex-wrap items-center gap-3">
					<SegmentedControl
						label="Filtre"
						bind:value={segment}
						options={[
							{ value: 'all', label: 'Toutes' },
							{ value: 'due', label: 'Dues' }
						]}
					/>
					<span class="inline-flex items-center gap-1.5 text-sm text-ink-2"
						>Raccourcis <Kbd>Espace</Kbd><Kbd>1</Kbd><Kbd>H</Kbd><Kbd>Z</Kbd></span
					>
				</div>
				<div>
					<Button icon="trash" variant="danger" onclick={() => (sheetOpen = true)}
						>Ouvrir une feuille de confirmation</Button
					>
				</div>
			</div>
			<div class="flex flex-col gap-4">
				<h3 class="font-semibold">Icônes</h3>
				<ul class="grid grid-cols-6 gap-2 sm:grid-cols-9">
					{#each iconNames as name (name)}
						<li
							class="flex aspect-square items-center justify-center rounded-lg bg-surface text-ink-2"
							title={name}
						>
							<Icon {name} size={20} label={name} />
						</li>
					{/each}
				</ul>
			</div>
		</div>
	</section>

	<section class="flex flex-col gap-6" aria-labelledby="architecture">
		{@render section(
			'architecture',
			'Architecture',
			'SvelteKit et Svelte 5, Tailwind 4 pour la mise en page, les tokens en CSS natif. Aucune bibliothèque de composants : des primitives maison, des éléments natifs (<dialog>, boutons, formulaires) et des actions de formulaire qui fonctionnent sans JavaScript.'
		)}
		<dl class="grid gap-x-6 md:grid-cols-[16rem_1fr]">
			{#each [['src/lib/styles/tokens.css', 'Source unique des valeurs : couleurs en paires light-dark(), échelle de texte, rayons, ombres, mouvement. Exposées à Tailwind via @theme.'], ['src/lib/styles/base.css', 'Thème (color-scheme, data-theme), sélection, curseur, focus, défilement, mouvement réduit.'], ['src/lib/ui/', 'Primitives sans logique métier : Button, TextField, Notice, Sheet, SegmentedControl, Kbd, Icon.'], ['src/lib/components/', 'Composants de Poj : AppShell, PageHeader, CardRow, DueChip, Horizon, MasteryBar, RatingBar, CardForm. Ils reçoivent des données, jamais le client Prisma.'], ['src/lib/format/', 'Fonctions pures et testables : échéances relatives, maîtrise, libellés des notes et des sens.'], ['src/lib/lab/', 'Données d’exemple et outils du lab. Rien en production.'], ['src/routes/lab/', 'Ce matériel et les maquettes, servis en développement uniquement (404 en production).']] as [path, text] (path)}
				<dt class="border-t border-line pt-3 font-mono text-sm text-ink">{path}</dt>
				<dd class="pb-3 text-sm text-ink-2 md:border-t md:border-line md:pt-3">{text}</dd>
			{/each}
		</dl>
	</section>
</main>

<Sheet
	bind:open={sheetOpen}
	title="Supprimer cette carte ?"
	description="« tenir le coup » ne reviendra plus en révision. Son historique est conservé."
>
	{#snippet actions()}
		<Button size="lg" onclick={() => (sheetOpen = false)}>Annuler</Button>
		<Button size="lg" variant="danger" icon="trash" onclick={() => (sheetOpen = false)}
			>Supprimer</Button
		>
	{/snippet}
</Sheet>
