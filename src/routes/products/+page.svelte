<script lang="ts">
	import * as Card from '$shadcn/card';
	import { Button } from '$shadcn/button';

	let { data } = $props();

	let activeCategoryId = $derived(data.activeCategoryId);
	let products = $derived(data.products);
	let categories = $derived(data.categories);
</script>

<div class="relative box-border min-h-screen w-full px-8 pt-24 pb-8">
	<h1 class="mb-6 text-center text-[1.75rem] font-light tracking-tight">Offres</h1>

	<nav class="mb-8 flex flex-wrap items-center justify-center gap-3" aria-label="Filtrer par catégorie">
		<Button
			href="/products"
			variant={!activeCategoryId ? 'default' : 'outline'}
			size="sm"
			class="uppercase tracking-wide"
		>
			Tous
		</Button>
		{#each categories as category (category.id)}
			<Button
				href="/products?categorie={category.id}"
				variant={activeCategoryId === category.id ? 'default' : 'outline'}
				size="sm"
				class="uppercase tracking-wide"
			>
				{category.name}
			</Button>
		{/each}
	</nav>

	{#if products.length === 0}
		<p class="p-8 text-center text-muted-foreground">Aucune offre dans cette catégorie.</p>
	{:else}
		<div class="mx-auto grid max-w-[1000px] grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3">
			{#each products as product (product.id)}
				<a href="/products/{product.slug}" class="block">
					<Card.Root
						class="min-h-[280px] gap-0 overflow-hidden py-0 transition-colors hover:border-foreground"
					>
						<div class="h-40 w-full shrink-0 overflow-hidden">
							{#if product.images[0]}
								<img
									src={product.images[0]}
									alt={product.name}
									loading="lazy"
									class="h-full w-full object-cover"
								/>
							{:else}
								<div class="h-full w-full bg-muted" aria-hidden="true"></div>
							{/if}
						</div>
						<Card.Content class="flex flex-1 flex-col p-4">
							<Card.Title class="mb-2 text-[0.95rem] font-medium">
								<h2>{product.name}</h2>
							</Card.Title>
							<p class="mb-3 line-clamp-2 flex-1 text-sm text-muted-foreground">
								{product.description}
							</p>
							<p class="text-base">{product.price.toFixed(2)} €</p>
						</Card.Content>
					</Card.Root>
				</a>
			{/each}
		</div>
	{/if}
</div>
