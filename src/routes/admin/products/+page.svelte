<script lang="ts">
	import { untrack } from 'svelte';
	import Table from '$components/Table.svelte';
	import type { TableAction, TableColumn, BulkAction } from '$components/Table.svelte';
	import { deleteProductSchema } from '$lib/schema/products/productSchema.js';
	import { zodClient } from 'sveltekit-superforms/adapters';
	import { superForm } from 'sveltekit-superforms';
	import { RETRY_FRIENDLY_FORM } from '$lib/forms/superformOptions';
	import { toast } from 'svelte-sonner';
	import Pencil from 'lucide-svelte/icons/pencil';
	import Trash from 'lucide-svelte/icons/trash';
	import { deleteTaxonomySchema } from '$lib/schema/taxonomies/taxonomySchema.js';
	import { optimizedImageUrl } from '$lib/utils/cloudinaryUrl';
	import { deserialize } from '$app/forms';
	import { invalidateAll } from '$app/navigation';

	// Props
	let { data } = $props();

	// `$derived`, pas `$state` : `products` doit suivre `data.products` à
	// chaque rechargement de `load()` (pagination, recherche, tri serveur),
	// pas rester figé sur sa valeur au premier montage.
	let products = $derived(data?.products ?? []);

	let productsData = $derived.by(() =>
		products.map((product) => ({
			...product,
			// Catégories : extraire les noms
			categories:
				product.categories?.map((cat) => cat.category?.name || 'Unknown').join(', ') ||
				'No category',
			materialName: product.material?.name ?? '—',
			// Première image ou placeholder
			images: { src: optimizedImageUrl(product.images[0] ?? '', 80), alt: product.name },
			// Description tronquée
			description:
				product.description?.length > 20
					? `${product.description.slice(0, 20)}...`
					: product.description || 'No description available'
		}))
	);

	// Form handling with superForm
	const deleteProduct = superForm(
		untrack(() => data?.IdeleteProductSchema ?? {}),
		{
			validators: zodClient(deleteProductSchema),
			id: 'deleteProduct',
			...RETRY_FRIENDLY_FORM
		}
	);

	const { enhance: deleteProductEnhance, message: deleteProductMessage } = deleteProduct;

	// Define table columns
	const productColumns = $state<TableColumn[]>([
		{ key: 'stock', label: 'Stock' },
		{ key: 'name', label: 'Nom' },
		{ key: 'price', label: 'Prix' },
		{ key: 'categories', label: 'Catégories' },
		{ key: 'materialName', label: 'Matière' },
		{ key: 'images', label: 'Images' },
		{ key: 'description', label: 'Description' }
	]);

	// Define actions with icons
	const productActions = $state<TableAction[]>([
		{
			type: 'link',
			name: 'edit',
			url: (item) => `/admin/products/${item.id}`,
			icon: Pencil
		},
		{
			type: 'form',
			name: 'delete',
			url: '?/deleteProduct',
			enhanceAction: deleteProductEnhance,
			icon: Trash
		}
	]);

	// Show toast on delete message
	$effect(() => {
		if ($deleteProductMessage) {
			toast.success($deleteProductMessage);
		}
	});

	// Suppression groupée : requête directe vers l'action de forme (pas de
	// `<form>` à soumettre ici, l'appel vient du bouton de la barre d'actions
	// groupées de `Table.svelte`) puis on relit `load()` pour rafraîchir la page.
	async function bulkDeleteProducts(ids: string[]) {
		const formData = new FormData();
		for (const id of ids) formData.append('ids', id);

		const response = await fetch('?/bulkDeleteProducts', { method: 'POST', body: formData });
		const result = deserialize(await response.text());

		if (result.type === 'success' || result.type === 'failure') {
			const resultData = result.data as
				| { deleted?: number; skipped?: number; message?: string }
				| undefined;
			if (result.type === 'failure') {
				toast.error(resultData?.message ?? 'Échec de la suppression groupée');
			} else if (resultData?.skipped) {
				toast.warning(
					`${resultData.deleted ?? 0} produit(s) supprimé(s), ${resultData.skipped} ignoré(s) (déjà commandés).`
				);
			} else {
				toast.success(`${resultData?.deleted ?? ids.length} produit(s) supprimé(s).`);
			}
			await invalidateAll();
		} else if (result.type === 'error') {
			toast.error('Échec de la suppression groupée');
		}
	}

	const productBulkActions: BulkAction[] = [
		{
			label: 'Supprimer la sélection',
			icon: Trash,
			variant: 'destructive' as const,
			confirmDescription:
				'Les produits sélectionnés seront définitivement supprimés. Ceux déjà présents dans une commande passée seront ignorés.',
			onApply: bulkDeleteProducts
		}
	];

	// Form handling with superForm
	const deleteTaxonomy = superForm(
		untrack(() => data?.IdeleteTaxonomySchema ?? {}),
		{
			validators: zodClient(deleteTaxonomySchema),
			id: 'deleteTaxonomy',
			...RETRY_FRIENDLY_FORM
		}
	);

	const { enhance: deleteTaxonomyEnhance, message: deleteTaxonomyMessage } = deleteTaxonomy;

	let taxonomiesData = $derived(
		(data?.taxonomies ?? []).map((taxonomy) => ({
			...taxonomy,
			valuesCount: taxonomy._count?.values ?? 0
		}))
	);

	// Table columns
	const taxonomyColumns: TableColumn[] = [
		{ key: 'name', label: 'Nom' },
		{ key: 'slug', label: 'Slug' },
		{ key: 'type', label: 'Type' },
		{ key: 'valuesCount', label: 'Valeurs' }
	];

	// Table actions
	const taxonomyActions: TableAction[] = [
		{
			type: 'link',
			name: 'edit',
			url: (item) => `/admin/products/taxonomies/${item.id}`,
			icon: Pencil
		},
		{
			type: 'form',
			name: 'delete',
			url: '?/deleteTaxonomy',
			enhanceAction: deleteTaxonomyEnhance,
			icon: Trash
		}
	];

	// Show toast on delete message
	$effect(() => {
		if ($deleteTaxonomyMessage) {
			toast.success($deleteTaxonomyMessage);
		}
	});
</script>

<h1 class="m-5 text-4xl">Gestion produits</h1>

<!-- UI Table -->
<div class="ccc w-[100%]">
	<Table
		name="Produits"
		columns={productColumns}
		data={productsData ?? []}
		actions={productActions}
		addLink="/admin/products/create"
		selectable={true}
		bulkActions={productBulkActions}
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
		columns={taxonomyColumns}
		data={taxonomiesData}
		actions={taxonomyActions}
		addLink="/admin/products/taxonomies/create"
	/>
</div>
