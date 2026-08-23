<script lang="ts">
	let { data } = $props();
	let post = $derived(data.post);
	let tagNames = $derived(post.tags.map((link) => link.tag.name).filter(Boolean));
</script>

<article class="mx-auto max-w-[760px] px-6 pt-24 pb-12">
	<p class="mb-6">
		<a href="/blog" class="text-foreground">← Blog</a>
	</p>
	<h1 class="mb-2 font-normal">{post.title}</h1>
	<p class="mb-3 text-muted-foreground">
		{post.author.name}
		{#if post.category}
			· {post.category.name}
		{/if}
		· {new Date(post.createdAt).toLocaleDateString('fr-FR')}
	</p>
	{#if tagNames.length}
		<p class="mb-6 text-sm text-muted-foreground">{tagNames.join(', ')}</p>
	{/if}
	<div class="leading-relaxed">
		<!-- Contenu saisi par un administrateur (TinyMCE). -->
		{@html post.content}
	</div>
</article>
