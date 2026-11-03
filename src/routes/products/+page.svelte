<script lang="ts">
	import * as Card from '#shadcn/card';
	import { Button } from '#shadcn/button';
	import { Input } from '#shadcn/input';
	import { Label } from '#shadcn/label';
	import { Checkbox } from '#shadcn/checkbox';
	import * as Accordion from '#shadcn/accordion';
	import * as Select from '#shadcn/select';
	import { Slider } from '#shadcn/slider';
	import { Badge } from '#shadcn/badge';
	import { optimizedImageUrl } from '#lib/utils/cloudinaryUrl';
	import { goto } from '$app/navigation';
	import { page as appPage } from '$app/state';
	import Search from 'lucide-svelte/icons/search';
	import X from 'lucide-svelte/icons/x';
	import SlidersHorizontal from 'lucide-svelte/icons/sliders-horizontal';
	import FlashSaleCountdown from '#lib/components/products/FlashSaleCountdown.svelte';
	import { toTTC } from '#lib/utils/price';
	import SEO from '#lib/components/SEO.svelte';

	let { data } = $props();

	let products = $derived(data.products);
	let facets = $derived(data.facets);
	let page = $derived(data.page);
	let search = $derived(data.search);
	let totalPages = $derived(Math.max(1, Math.ceil(data.total / data.perPage)));

	const SORT_LABELS: Record<string, string> = {
		pertinence: 'Pertinence',
		'prix-asc': 'Prix croissant',
		'prix-desc': 'Prix décroissant',
		nouveaute: 'Nouveautés'
	};

	// Bornes de la vue en cours (prix filtré si posé, sinon bornes des facettes) —
	// le slider a toujours un intervalle valide à afficher, même sans filtre actif.
	let sliderMin = $derived(facets.priceBounds.min);
	let sliderMax = $derived(Math.max(facets.priceBounds.max, facets.priceBounds.min + 1));
	let priceRange = $derived<[number, number]>([
		data.minPrice ?? sliderMin,
		data.maxPrice ?? sliderMax
	]);

	/**
	 * Fusionne des paramètres dans l'URL courante et recharge `load()` — seul
	 * mécanisme de mise à jour des filtres. `null`/`undefined`/`[]` retire le
	 * paramètre. Toute modification de filtre revient à la page 1, sauf si
	 * `page` est explicitement fourni (pagination elle-même).
	 */
	function updateFilters(
		patch: Record<string, string | number | boolean | string[] | null | undefined>
	) {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- local, jeté après toString(), jamais assigné à un state
		const params = new URLSearchParams(appPage.url.search);
		for (const [key, value] of Object.entries(patch)) {
			params.delete(key);
			if (value === null || value === undefined || value === '' || value === false) continue;
			if (Array.isArray(value)) {
				for (const v of value) params.append(key, v);
			} else {
				params.set(key, String(value));
			}
		}
		if (!('page' in patch)) params.delete('page');
		const query = params.toString();
		goto(query ? `/products?${query}` : '/products', { reset: false });
	}

	function toggleTaxonomyValue(slug: string, value: string) {
		const current = data.taxonomyFilters[slug] ?? [];
		const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
		updateFilters({ [slug]: next });
	}

	function commitPriceRange() {
		const [min, max] = priceRange;
		updateFilters({
			prixMin: min > sliderMin ? min : null,
			prixMax: max < sliderMax ? max : null
		});
	}

	function pageHref(target: number): string {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- local, jeté après toString(), jamais assigné à un state
		const params = new URLSearchParams(appPage.url.search);
		if (target > 1) params.set('page', String(target));
		else params.delete('page');
		const query = params.toString();
		return query ? `/products?${query}` : '/products';
	}

	let clearSearchHref = $derived.by(() => {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- local, jeté après toString(), jamais assigné à un state
		const params = new URLSearchParams(appPage.url.search);
		params.delete('q');
		params.delete('page');
		const query = params.toString();
		return query ? `/products?${query}` : '/products';
	});

	let activeFilterCount = $derived(
		Object.values(data.taxonomyFilters).reduce((sum, values) => sum + values.length, 0) +
			(data.minPrice !== undefined ? 1 : 0) +
			(data.maxPrice !== undefined ? 1 : 0) +
			(data.inStockOnly ? 1 : 0)
	);

	function discountPercent(price: number, compareAt: number): number {
		return Math.round((1 - price / compareAt) * 100);
	}
</script>

<SEO pageKey="products" />

{#snippet filterSections(idPrefix: string)}
	<Accordion.Root
		type="multiple"
		value={['prix', 'dispo', ...facets.taxonomies.map((t) => t.slug)]}
	>
		<Accordion.Item value="prix">
			<Accordion.Trigger>Prix</Accordion.Trigger>
			<Accordion.Content>
				<div class="space-y-4 px-1">
					<Slider
						type="multiple"
						value={priceRange}
						onValueChange={(v) => (priceRange = v as [number, number])}
						onValueCommit={commitPriceRange}
						min={sliderMin}
						max={sliderMax}
						step={1}
						thumbLabels={['Prix minimum', 'Prix maximum']}
					/>
					<div class="flex items-center justify-between text-sm text-muted-foreground">
						<span>{priceRange[0]} €</span>
						<span>{priceRange[1]} €</span>
					</div>
				</div>
			</Accordion.Content>
		</Accordion.Item>

		{#each facets.taxonomies as taxonomy (taxonomy.slug)}
			<Accordion.Item value={taxonomy.slug}>
				<Accordion.Trigger>{taxonomy.name}</Accordion.Trigger>
				<Accordion.Content>
					<ul class="space-y-2">
						{#each taxonomy.values as value (value.value)}
							<li class="flex items-center gap-2">
								<Checkbox
									id="{idPrefix}{taxonomy.slug}-{value.value}"
									checked={(data.taxonomyFilters[taxonomy.slug] ?? []).includes(value.value)}
									onCheckedChange={() => toggleTaxonomyValue(taxonomy.slug, value.value)}
								/>
								<Label
									for="{idPrefix}{taxonomy.slug}-{value.value}"
									class="flex flex-1 items-center gap-2 text-sm font-normal"
								>
									{#if taxonomy.type === 'COLOR' && value.code}
										<span
											class="inline-block size-3 rounded-full border"
											style={`background-color:${value.code}`}
										></span>
									{/if}
									{value.label}
								</Label>
								<span class="text-xs text-muted-foreground">{value.count}</span>
							</li>
						{/each}
					</ul>
				</Accordion.Content>
			</Accordion.Item>
		{/each}

		<Accordion.Item value="dispo">
			<Accordion.Trigger>Disponibilité</Accordion.Trigger>
			<Accordion.Content>
				<div class="flex items-center gap-2">
					<Checkbox
						id="{idPrefix}dispo-only"
						checked={data.inStockOnly}
						onCheckedChange={(checked) => updateFilters({ dispo: checked ? '1' : null })}
					/>
					<Label for="{idPrefix}dispo-only" class="text-sm font-normal">En stock uniquement</Label>
				</div>
			</Accordion.Content>
		</Accordion.Item>
	</Accordion.Root>

	{#if activeFilterCount > 0}
		<Button
			variant="ghost"
			size="sm"
			class="mt-2 w-full justify-start text-muted-foreground"
			onclick={() =>
				updateFilters({
					...Object.fromEntries(facets.taxonomies.map((t) => [t.slug, []])),
					prixMin: null,
					prixMax: null,
					dispo: null
				})}
		>
			<X class="mr-2 size-4" />
			Réinitialiser les filtres ({activeFilterCount})
		</Button>
	{/if}
{/snippet}

<div class="relative box-border min-h-screen w-full px-4 pt-24 pb-8 sm:px-8">
	<h1 class="mb-6 text-center text-[1.75rem] font-light tracking-tight">Offres</h1>

	<form method="GET" action="/products" class="mx-auto mb-8 flex max-w-sm items-center gap-2">
		<div class="relative flex-1">
			<Search
				class="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
			/>
			<Input
				type="search"
				name="q"
				value={search}
				placeholder="Rechercher un produit"
				aria-label="Rechercher un produit"
				class="pl-8"
			/>
		</div>
		<Button type="submit" variant="outline" size="sm">Rechercher</Button>
		{#if search}
			<Button href={clearSearchHref} variant="ghost" size="icon" aria-label="Effacer la recherche">
				<X class="size-4" />
			</Button>
		{/if}
	</form>

	<div class="mx-auto flex max-w-[1280px] gap-8">
		<!-- Sidebar filtres (écrans lg et plus) -->
		<aside class="hidden w-64 shrink-0 lg:block">
			{@render filterSections('desktop-')}
		</aside>

		<div class="min-w-0 flex-1">
			<div class="mb-6 flex flex-wrap items-center justify-between gap-3">
				<p class="text-sm text-muted-foreground">
					{data.total} produit{data.total > 1 ? 's' : ''}
				</p>

				<div class="flex items-center gap-2">
					<!-- Filtres (drawer, écrans sous lg) -->
					<details class="relative lg:hidden">
						<summary
							class="flex cursor-pointer list-none items-center gap-2 rounded-md border px-3 py-2 text-sm [&::-webkit-details-marker]:hidden"
						>
							<SlidersHorizontal class="size-4" />
							Filtres
							{#if activeFilterCount > 0}
								<Badge variant="secondary">{activeFilterCount}</Badge>
							{/if}
						</summary>
						<div
							class="absolute left-0 z-20 mt-2 max-h-[70vh] w-72 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-lg border bg-popover p-4 shadow-lg"
						>
							{@render filterSections('mobile-')}
						</div>
					</details>

					<Select.Root
						type="single"
						value={data.sort}
						onValueChange={(v) => updateFilters({ tri: v === 'pertinence' ? null : v })}
					>
						<Select.Trigger class="w-[170px]">
							<span>{SORT_LABELS[data.sort]}</span>
						</Select.Trigger>
						<Select.Content>
							{#each Object.entries(SORT_LABELS) as [value, label] (value)}
								<Select.Item {value}>{label}</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
				</div>
			</div>

			{#if products.length === 0}
				<p class="p-8 text-center text-muted-foreground">
					{#if search}
						Aucune offre ne correspond à « {search} ».
					{:else}
						Aucune offre ne correspond à ces filtres.
					{/if}
				</p>
			{:else}
				<div class="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
					{#each products as product (product.id)}
						<a href="/products/{product.slug}" class="block">
							<Card.Root
								class="min-h-[280px] gap-0 overflow-hidden py-0 transition-colors hover:border-foreground"
							>
								<div class="relative h-40 w-full shrink-0 overflow-hidden">
									{#if product.images[0]}
										<img
											src={optimizedImageUrl(product.images[0], 400)}
											alt={product.name}
											loading="lazy"
											class="h-full w-full object-cover"
										/>
									{:else}
										<div class="h-full w-full bg-muted" aria-hidden="true"></div>
									{/if}
									{#if product.compareAtPrice && product.compareAtPrice > product.price}
										<Badge variant="destructive" class="absolute top-2 left-2">
											-{discountPercent(product.price, product.compareAtPrice)}%
										</Badge>
									{/if}
									{#if product.flashSaleEndsAt && data.flashSaleEnabled}
										<div class="absolute bottom-2 left-2">
											<FlashSaleCountdown endsAt={product.flashSaleEndsAt} variant="compact" />
										</div>
									{/if}
									{#if product.stock === 0}
										<Badge variant="outline" class="absolute top-2 right-2 bg-background">
											Épuisé
										</Badge>
									{/if}
								</div>
								<Card.Content class="flex flex-1 flex-col p-4">
									{#if product.material}
										<p class="mb-1 text-xs tracking-wide text-muted-foreground uppercase">
											{product.material.name}
										</p>
									{/if}
									<Card.Title class="mb-2 text-[0.95rem] font-medium">
										<h2>{product.name}</h2>
									</Card.Title>
									<p class="mb-3 line-clamp-2 flex-1 text-sm text-muted-foreground">
										{product.description}
									</p>
									<div class="flex items-baseline gap-2">
										<p class="text-base">{toTTC(product.price, data.vatRate).toFixed(2)} €</p>
										{#if product.compareAtPrice && product.compareAtPrice > product.price}
											<p class="text-sm text-muted-foreground line-through">
												{toTTC(product.compareAtPrice, data.vatRate).toFixed(2)} €
											</p>
										{/if}
									</div>
								</Card.Content>
							</Card.Root>
						</a>
					{/each}
				</div>

				{#if totalPages > 1}
					<nav class="mt-8 flex items-center justify-center gap-2" aria-label="Pagination">
						{#if page > 1}
							<Button href={pageHref(page - 1)} variant="outline" size="sm">Précédent</Button>
						{/if}
						<span class="text-sm text-muted-foreground">Page {page} / {totalPages}</span>
						{#if page < totalPages}
							<Button href={pageHref(page + 1)} variant="outline" size="sm">Suivant</Button>
						{/if}
					</nav>
				{/if}
			{/if}
		</div>
	</div>
</div>
