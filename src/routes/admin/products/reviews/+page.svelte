<script lang="ts">
	import { untrack } from 'svelte';
	import Table from '$components/Table.svelte';
	import type { TableItem } from '$components/Table.svelte';
	import { formatDate } from '$lib/utils/formatDate';
	import { superForm } from 'sveltekit-superforms';
	import { zodClient } from 'sveltekit-superforms/adapters';
	import { RETRY_FRIENDLY_FORM } from '$lib/forms/superformOptions';
	import { toast } from 'svelte-sonner';
	import { deleteReviewSchema } from '$lib/schema/products/reviewSchema';
	import Trash from 'lucide-svelte/icons/trash';
	import ExternalLink from 'lucide-svelte/icons/external-link';

	let { data } = $props();

	const deleteReview = superForm(
		untrack(() => data.deleteForm),
		{
			validators: zodClient(deleteReviewSchema),
			id: 'deleteReview',
			...RETRY_FRIENDLY_FORM
		}
	);
	const { enhance: deleteReviewEnhance, message: deleteReviewMessage } = deleteReview;

	const reviewColumns = [
		{ key: 'productName', label: 'Produit' },
		{ key: 'authorName', label: 'Auteur' },
		{ key: 'rating', label: 'Note', formatter: (value: unknown) => `${value} / 5` },
		{
			key: 'comment',
			label: 'Commentaire',
			formatter: (value: unknown) =>
				typeof value === 'string' && value.length > 60 ? `${value.slice(0, 60)}…` : (value ?? '—')
		},
		{ key: 'createdAt', label: 'Date', formatter: (value: unknown) => formatDate(String(value)) }
	];

	const reviewActions = [
		{
			type: 'link' as const,
			name: 'voir le produit',
			url: (item: TableItem) => `/products/${item.productSlug}`,
			icon: ExternalLink
		},
		{
			type: 'form' as const,
			name: 'supprimer',
			url: '?/deleteReview',
			enhanceAction: deleteReviewEnhance,
			icon: Trash
		}
	];

	$effect(() => {
		if ($deleteReviewMessage) toast.success($deleteReviewMessage);
	});
</script>

<svelte:head>
	<title>Avis produit — Admin</title>
</svelte:head>

<div class="ccc w-[100%]">
	<Table
		name="Avis produit"
		columns={reviewColumns}
		data={data.reviews ?? []}
		actions={reviewActions}
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
