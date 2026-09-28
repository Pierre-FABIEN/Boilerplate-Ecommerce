<script lang="ts">
	import { untrack } from 'svelte';
	import Table from '$components/Table.svelte';
	import { zodClient } from 'sveltekit-superforms/adapters';
	import { superForm } from 'sveltekit-superforms';
	import { RETRY_FRIENDLY_FORM } from '$lib/forms/superformOptions';
	import { toast } from 'svelte-sonner';
	import Pencil from 'lucide-svelte/icons/pencil';
	import Trash from 'lucide-svelte/icons/trash';
	import { deleteVariantSchema } from '$lib/schema/products/variantSchema.js';

	let { data } = $props();

	const deleteVariant = superForm(
		untrack(() => data.IdeleteVariantSchema),
		{
			validators: zodClient(deleteVariantSchema),
			id: 'deleteVariant',
			...RETRY_FRIENDLY_FORM
		}
	);
	const { enhance: deleteVariantEnhance, message: deleteVariantMessage } = deleteVariant;

	const variantsData = $derived.by(() =>
		(data.variants ?? []).map((v) => ({
			...v,
			priceLabel:
				v.price != null
					? `${v.price.toFixed(2)}€`
					: `${data.product.price.toFixed(2)}€ (prix produit)`,
			skuLabel: v.sku || '—'
		}))
	);

	const variantColumns = [
		{ key: 'label', label: 'Étiquette' },
		{ key: 'skuLabel', label: 'SKU' },
		{ key: 'priceLabel', label: 'Prix' },
		{ key: 'stock', label: 'Stock' }
	];

	const variantActions = [
		{
			type: 'link' as const,
			name: 'edit',
			url: (item: { id: string }) => `/admin/products/${data.product.id}/variants/${item.id}`,
			icon: Pencil
		},
		{
			type: 'form' as const,
			name: 'delete',
			url: '?/deleteVariant',
			enhanceAction: deleteVariantEnhance,
			icon: Trash
		}
	];

	$effect(() => {
		if ($deleteVariantMessage) toast.success($deleteVariantMessage);
	});
</script>

<svelte:head>
	<title>Variantes — {data.product.name}</title>
</svelte:head>

<h1 class="m-5 text-2xl font-bold">Variantes — {data.product.name}</h1>
<p class="mx-5 mb-5 text-sm text-muted-foreground">
	Un produit sans variante se vend au prix/stock affichés sur sa fiche, comme avant. Dès qu'une
	variante existe ici, la fiche produit demande au client de choisir la sienne.
</p>

<div class="ccc w-[100%]">
	<Table
		name="Variantes"
		columns={variantColumns}
		data={variantsData}
		actions={variantActions}
		addLink={`/admin/products/${data.product.id}/variants/create`}
	/>
</div>
