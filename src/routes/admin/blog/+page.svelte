<script lang="ts">
	import { untrack } from 'svelte';
	import Table from '$components/Table.svelte';
	import type { TableAction, TableColumn } from '$components/Table.svelte';
	import { zodClient } from 'sveltekit-superforms/adapters';
	import { superForm } from 'sveltekit-superforms';
	import { RETRY_FRIENDLY_FORM } from '$lib/forms/superformOptions';
	import { toast } from 'svelte-sonner';
	import Pencil from 'lucide-svelte/icons/pencil';
	import Trash from 'lucide-svelte/icons/trash';
	import { deleteBlogPostSchema } from '$lib/schema/BlogPost/BlogPostSchema.js';
	import { deleteBlogTaxonomySchema } from '$lib/schema/BlogPost/blogTaxonomySchema.js';

	// Props
	let { data } = $props();

	// Form handling with superForm
	const deleteBlogPost = superForm(
		untrack(() => data?.IdeleteBlogPostSchema ?? {}),
		{
			validators: zodClient(deleteBlogPostSchema),
			id: 'deleteBlogPost',
			...RETRY_FRIENDLY_FORM
		}
	);

	const deleteBlogTaxonomy = superForm(
		untrack(() => data?.IdeleteBlogTaxonomySchema ?? {}),
		{
			validators: zodClient(deleteBlogTaxonomySchema),
			id: 'deleteBlogTaxonomy',
			...RETRY_FRIENDLY_FORM
		}
	);

	const { enhance: deleteBlogPostEnhance, message: deleteBlogPostMessage } = deleteBlogPost;

	const { enhance: deleteBlogTaxonomyEnhance, message: deleteBlogTaxonomyMessage } =
		deleteBlogTaxonomy;

	type PostTaxonomyValue = {
		taxonomyValue: { value: string; label: string | null; taxonomy: { name: string } };
	};

	/** Regroupe les valeurs assignées par taxonomie : "Catégorie: Actu · Tag: sport, mode". */
	function formatTaxonomies(taxonomyValues: PostTaxonomyValue[] = []) {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- Map local, jamais assigné à un state, jeté à la fin de la fonction
		const groups = new Map<string, string[]>();
		for (const { taxonomyValue } of taxonomyValues) {
			const label = taxonomyValue.label || taxonomyValue.value;
			const group = groups.get(taxonomyValue.taxonomy.name) ?? [];
			group.push(label);
			groups.set(taxonomyValue.taxonomy.name, group);
		}
		return Array.from(groups.entries())
			.map(([name, values]) => `${name}: ${values.join(', ')}`)
			.join(' · ');
	}

	/**
	 * formattedBlogPosts: an array of blog posts
	 * with an additional `taxonomies` field for display
	 */
	const formattedBlogPosts = $derived.by(() => {
		return (data.BlogPost ?? []).map((post) => ({
			...post,
			taxonomies: formatTaxonomies(post.taxonomyValues)
		}));
	});

	// Define table columns
	const PostsColumns = $state<TableColumn[]>([
		{ key: 'title', label: 'Title' },
		{ key: 'taxonomies', label: 'Taxonomies' },
		{ key: 'published', label: 'Published' }
	]);

	const taxonomiesData = $derived(
		(data?.taxonomies ?? []).map((taxonomy) => ({
			...taxonomy,
			valuesCount: taxonomy._count?.values ?? 0
		}))
	);

	const TaxonomiesColumns = $state<TableColumn[]>([
		{ key: 'name', label: 'Nom' },
		{ key: 'slug', label: 'Slug' },
		{ key: 'valuesCount', label: 'Valeurs' }
	]);

	// Define actions with icons
	const PostsActions = $state<TableAction[]>([
		{
			type: 'link',
			name: 'edit',
			url: (item) => `/admin/blog/post/${item.id}`,
			icon: Pencil
		},
		{
			type: 'form',
			name: 'delete',
			url: '?/deleteBlogPost',
			enhanceAction: deleteBlogPostEnhance,
			icon: Trash
		}
	]);

	const TaxonomiesActions = $state<TableAction[]>([
		{
			type: 'link',
			name: 'edit',
			url: (item) => `/admin/blog/taxonomies/${item.id}`,
			icon: Pencil
		},
		{
			type: 'form',
			name: 'delete',
			url: '?/deleteBlogTaxonomy',
			enhanceAction: deleteBlogTaxonomyEnhance,
			icon: Trash
		}
	]);

	// Show toast on delete message
	$effect(() => {
		if ($deleteBlogPostMessage) {
			toast.success($deleteBlogPostMessage);
		}
		if ($deleteBlogTaxonomyMessage) {
			toast.success($deleteBlogTaxonomyMessage);
		}
	});
</script>

<h1 class="m-5 text-4xl">Gestion du blog</h1>

<!-- UI Table -->
<div class="ccc w-[100%]">
	<Table
		name="Articles"
		columns={PostsColumns}
		data={formattedBlogPosts}
		actions={PostsActions}
		addLink="/admin/blog/post/create"
		server={{
			page: data.page,
			perPage: data.perPage,
			total: data.total,
			search: data.search,
			sort: data.sort,
			dir: data.dir
		}}
	/>
</div>

<div class="ccc w-[100%]">
	<Table
		name="Taxonomies"
		columns={TaxonomiesColumns}
		data={taxonomiesData}
		actions={TaxonomiesActions}
		addLink="/admin/blog/taxonomies/create"
	/>
</div>
