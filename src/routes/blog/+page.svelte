<script lang="ts">
	import * as Card from '#shadcn/card';
	import { Button } from '#shadcn/button';
	import { Input } from '#shadcn/input';
	import { Badge } from '#shadcn/badge';
	import { goto } from '$app/navigation';
	import { page as appPage } from '$app/state';
	import Search from 'lucide-svelte/icons/search';
	import X from 'lucide-svelte/icons/x';
	import SEO from '#lib/components/SEO.svelte';

	let { data } = $props();

	let activeCategoryId = $derived(data.activeCategoryId);
	let activeTagId = $derived(data.activeTagId);
	let posts = $derived(data.posts);
	let categories = $derived(data.categories);
	let tags = $derived(data.tags);
	let page = $derived(data.page);
	let totalPages = $derived(Math.max(1, Math.ceil(data.total / data.perPage)));
	let searchInput = $derived(data.search);

	let hasActiveFilters = $derived(!!activeCategoryId || !!activeTagId || !!data.search);

	/** Fusionne des paramètres dans l'URL courante. Toute modification de filtre revient à la page 1, sauf pagination elle-même. */
	function filterHref(patch: Record<string, string | number | null | undefined>): string {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- local, jeté après toString(), jamais assigné à un state
		const params = new URLSearchParams(appPage.url.search);
		for (const [key, value] of Object.entries(patch)) {
			params.delete(key);
			if (value === null || value === undefined || value === '') continue;
			params.set(key, String(value));
		}
		if (!('page' in patch)) params.delete('page');
		const query = params.toString();
		return query ? `/blog?${query}` : '/blog';
	}

	function pageHref(target: number): string {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- local, jeté après toString(), jamais assigné à un state
		const params = new URLSearchParams(appPage.url.search);
		if (target > 1) params.set('page', String(target));
		else params.delete('page');
		const query = params.toString();
		return query ? `/blog?${query}` : '/blog';
	}

	function submitSearch(event: SubmitEvent) {
		event.preventDefault();
		goto(filterHref({ q: searchInput.trim() || null }), { reset: false });
	}
</script>

<SEO pageKey="blog" />

<div class="relative box-border min-h-screen w-full px-8 pt-24 pb-8">
	<h1 class="mb-6 text-center text-[1.75rem] font-light tracking-tight">Blog</h1>

	<form onsubmit={submitSearch} class="mx-auto mb-6 flex max-w-[420px] items-center gap-2">
		<div class="relative flex-1">
			<Search class="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
			<Input
				bind:value={searchInput}
				placeholder="Rechercher un article…"
				aria-label="Rechercher un article"
				class="pl-9"
			/>
		</div>
		<Button type="submit" variant="outline" size="sm">Rechercher</Button>
	</form>

	<nav
		class="mb-3 flex flex-wrap items-center justify-center gap-3"
		aria-label="Filtrer par catégorie"
	>
		<Button
			href={filterHref({ categorie: null })}
			variant={!activeCategoryId ? 'default' : 'outline'}
			size="sm"
			class="uppercase tracking-wide"
		>
			Tous
		</Button>
		{#each categories as category (category.id)}
			<Button
				href={filterHref({ categorie: category.id })}
				variant={activeCategoryId === category.id ? 'default' : 'outline'}
				size="sm"
				class="uppercase tracking-wide"
			>
				{category.name}
			</Button>
		{/each}
	</nav>

	{#if tags.length > 0}
		<nav class="mb-8 flex flex-wrap items-center justify-center gap-2" aria-label="Filtrer par tag">
			{#each tags as tag (tag.id)}
				<Badge
					href={filterHref({ tag: activeTagId === tag.id ? null : tag.id })}
					variant={activeTagId === tag.id ? 'default' : 'outline'}
				>
					#{tag.name}
				</Badge>
			{/each}
		</nav>
	{/if}

	{#if hasActiveFilters}
		<div class="mb-8 flex items-center justify-center">
			<Button variant="ghost" size="sm" href="/blog" class="text-muted-foreground">
				<X class="h-4 w-4" /> Effacer les filtres
			</Button>
		</div>
	{/if}

	{#if posts.length === 0}
		<p class="p-8 text-center text-muted-foreground">
			{data.search
				? `Aucun article ne correspond à « ${data.search} ».`
				: 'Aucun article dans cette sélection.'}
		</p>
	{:else}
		<div class="mx-auto grid max-w-[1000px] grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3">
			{#each posts as post (post.id)}
				<a href="/blog/{post.slug}" class="block">
					<Card.Root
						class="flex min-h-[180px] flex-col gap-0 py-0 transition-colors hover:border-foreground"
					>
						<Card.Content class="flex flex-1 flex-col p-4">
							<Card.Title class="mb-2 text-[0.95rem] font-medium">
								<h2>{post.title}</h2>
							</Card.Title>
							<p class="mb-3 text-sm text-muted-foreground">
								{post.author.name}
								{#if post.category}
									· {post.category.name}
								{/if}
							</p>
							{#if post.tags.length > 0}
								<div class="mb-3 flex flex-wrap gap-1">
									{#each post.tags as { tag } (tag.id)}
										<Badge variant="secondary" class="text-xs">#{tag.name}</Badge>
									{/each}
								</div>
							{/if}
							<p class="mt-auto text-sm text-muted-foreground">
								{new Date(post.createdAt).toLocaleDateString('fr-FR')}
							</p>
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
