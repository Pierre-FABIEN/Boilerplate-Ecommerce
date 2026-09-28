<script lang="ts">
	import { Badge } from '$shadcn/badge';
	import * as Card from '$shadcn/card';
	import SEO from '$lib/components/SEO.svelte';
	import StructuredData from '$lib/components/StructuredData.svelte';
	import { seoConfig } from '$lib/seo.config';

	let { data } = $props();
	let post = $derived(data.post);
	let tags = $derived(post.tags.map((link) => link.tag).filter((tag) => tag.name));
	let relatedPosts = $derived(data.relatedPosts);

	// Pas de champ `excerpt` en base (contenu HTML saisi via TinyMCE) : une
	// description est dérivée du texte brut, tronquée à la longueur usuelle
	// d'un extrait affiché par Google (~155-160 caractères).
	let plainExcerpt = $derived(
		post.content
			.replace(/<[^>]+>/g, ' ')
			.replace(/\s+/g, ' ')
			.trim()
			.slice(0, 160)
	);

	let breadcrumbData = $derived({
		itemListElement: [
			{ '@type': 'ListItem', position: 1, name: 'Accueil', item: seoConfig.site.url },
			{ '@type': 'ListItem', position: 2, name: 'Blog', item: `${seoConfig.site.url}/blog` },
			{
				'@type': 'ListItem',
				position: 3,
				name: post.title,
				item: `${seoConfig.site.url}/blog/${post.slug}`
			}
		]
	});
</script>

<SEO
	type="article"
	title={post.title}
	description={plainExcerpt}
	publishedTime={new Date(post.createdAt).toISOString()}
	modifiedTime={new Date(post.updatedAt).toISOString()}
	author={post.author.name}
	section={post.category?.name}
	tags={tags.map((tag) => tag.name)}
/>
<StructuredData type="BreadcrumbList" data={breadcrumbData} />

<article class="mx-auto max-w-[760px] px-6 pt-24 pb-12">
	<p class="mb-6">
		<a href="/blog" class="text-foreground">← Blog</a>
	</p>
	<h1 class="mb-2 font-normal">{post.title}</h1>
	<p class="mb-3 text-muted-foreground">
		{post.author.name}
		{#if post.category}
			· <a href="/blog?categorie={post.category.id}" class="hover:underline">{post.category.name}</a
			>
		{/if}
		· {new Date(post.createdAt).toLocaleDateString('fr-FR')}
		· {data.readingMinutes} min de lecture
	</p>
	{#if tags.length}
		<div class="mb-6 flex flex-wrap gap-2">
			{#each tags as tag (tag.id)}
				<a href="/blog?tag={tag.id}">
					<Badge variant="secondary">#{tag.name}</Badge>
				</a>
			{/each}
		</div>
	{/if}
	<div class="leading-relaxed">
		<!-- Contenu saisi par un administrateur (TinyMCE), déjà assaini à
		     l'écriture (`sanitizeBlogHtml`, DOMPurify — voir
		     `$lib/prisma/blogPost/blogPost.ts`) : jamais de HTML brut non
		     filtré en base, ce `{@html}` ne fait que rendre le résultat déjà
		     nettoyé. -->
		{@html post.content}
	</div>

	{#if relatedPosts.length > 0}
		<section class="mt-16 border-t pt-8">
			<h2 class="mb-4 text-lg font-normal">À lire aussi</h2>
			<div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
				{#each relatedPosts as related (related.id)}
					<a href="/blog/{related.slug}" class="block">
						<Card.Root class="gap-0 py-0 transition-colors hover:border-foreground">
							<Card.Content class="p-4">
								<Card.Title class="text-[0.9rem] font-medium">
									<h3>{related.title}</h3>
								</Card.Title>
								<p class="mt-2 text-xs text-muted-foreground">
									{new Date(related.createdAt).toLocaleDateString('fr-FR')}
								</p>
							</Card.Content>
						</Card.Root>
					</a>
				{/each}
			</div>
		</section>
	{/if}
</article>
