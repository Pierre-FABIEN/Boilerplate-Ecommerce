<script lang="ts">
	import * as Card from '$shadcn/card';
	import { Button } from '$shadcn/button';

	let { data } = $props();

	let activeCategoryId = $derived(data.activeCategoryId);
	let posts = $derived(data.posts);
	let categories = $derived(data.categories);
</script>

<div class="relative box-border min-h-screen w-full px-8 pt-24 pb-8">
	<h1 class="mb-6 text-center text-[1.75rem] font-light tracking-tight">Blog</h1>

	<nav class="mb-8 flex flex-wrap items-center justify-center gap-3" aria-label="Filtrer par catégorie">
		<Button
			href="/blog"
			variant={!activeCategoryId ? 'default' : 'outline'}
			size="sm"
			class="uppercase tracking-wide"
		>
			Tous
		</Button>
		{#each categories as category (category.id)}
			<Button
				href="/blog?categorie={category.id}"
				variant={activeCategoryId === category.id ? 'default' : 'outline'}
				size="sm"
				class="uppercase tracking-wide"
			>
				{category.name}
			</Button>
		{/each}
	</nav>

	{#if posts.length === 0}
		<p class="p-8 text-center text-muted-foreground">Aucun article dans cette catégorie.</p>
	{:else}
		<div class="mx-auto grid max-w-[1000px] grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3">
			{#each posts as post (post.id)}
				<a href="/blog/{post.slug}" class="block">
					<Card.Root class="min-h-[180px] gap-0 py-0 transition-colors hover:border-foreground">
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
							<p class="text-sm text-muted-foreground">
								{new Date(post.createdAt).toLocaleDateString('fr-FR')}
							</p>
						</Card.Content>
					</Card.Root>
				</a>
			{/each}
		</div>
	{/if}
</div>
