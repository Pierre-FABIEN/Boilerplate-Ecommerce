<script lang="ts">
	import { untrack } from 'svelte';
	import { page } from '$app/state';
	import * as Form from '$shadcn/form';
	import { Input } from '$shadcn/input';
	import { Button } from '$shadcn/button';
	import Checkbox from '$shadcn/checkbox/checkbox.svelte';
	import { Label } from '$shadcn/label';
	import Table from '$components/Table.svelte';
	import type { TableAction, TableColumn, TableItem } from '$components/Table.svelte';
	import { superForm } from 'sveltekit-superforms';
	import { zodClient } from 'sveltekit-superforms/adapters';
	import { RETRY_FRIENDLY_FORM } from '$lib/forms/superformOptions';
	import { updateBlogTaxonomySchema } from '$lib/schema/BlogPost/blogTaxonomySchema';
	import { deleteBlogTaxonomyValueSchema } from '$lib/schema/BlogPost/blogTaxonomyValueSchema';
	import { toast } from 'svelte-sonner';
	import Pencil from 'lucide-svelte/icons/pencil';
	import Trash from 'lucide-svelte/icons/trash';

	let { data } = $props();
	let id = $derived(page.params.id);

	const updateBlogTaxonomy = superForm(
		untrack(() => data.IupdateBlogTaxonomySchema),
		{
			validators: zodClient(updateBlogTaxonomySchema),
			id: 'updateBlogTaxonomy',
			...RETRY_FRIENDLY_FORM
		}
	);

	const {
		form: updateBlogTaxonomyData,
		enhance: updateBlogTaxonomyEnhance,
		message: updateBlogTaxonomyMessage
	} = updateBlogTaxonomy;

	$effect(() => {
		if ($updateBlogTaxonomyMessage === 'Taxonomy updated successfully') {
			toast.success('Taxonomie mise à jour');
		}
	});

	const deleteBlogTaxonomyValue = superForm(
		untrack(() => data.IdeleteBlogTaxonomyValueSchema),
		{
			validators: zodClient(deleteBlogTaxonomyValueSchema),
			id: 'deleteBlogTaxonomyValue',
			...RETRY_FRIENDLY_FORM
		}
	);

	const { enhance: deleteBlogTaxonomyValueEnhance, message: deleteBlogTaxonomyValueMessage } =
		deleteBlogTaxonomyValue;

	$effect(() => {
		if ($deleteBlogTaxonomyValueMessage) {
			toast.success($deleteBlogTaxonomyValueMessage);
		}
	});

	let valuesData = $derived(
		(data.taxonomy.values ?? []).map((v: { id: string; value: string; label: string | null }) => ({
			...v,
			label: v.label || v.value
		}))
	);

	const valueColumns: TableColumn[] = [
		{ key: 'value', label: 'Valeur' },
		{ key: 'label', label: 'Libellé' }
	];

	const valueActions: TableAction[] = [
		{
			type: 'link',
			name: 'edit',
			url: (item: TableItem) => `/admin/blog/taxonomies/${id}/values/${item.id}`,
			icon: Pencil
		},
		{
			type: 'form',
			name: 'delete',
			url: '?/deleteBlogTaxonomyValue',
			enhanceAction: deleteBlogTaxonomyValueEnhance,
			icon: Trash
		}
	];
</script>

<div class="ccc">
	<div class="m-5 p-5 border w-[420px]">
		<form
			method="POST"
			action="?/updateBlogTaxonomy"
			use:updateBlogTaxonomyEnhance
			class="space-y-4"
		>
			<div class="ccs mt-5">
				<div class="w-[100%]">
					<Form.Field name="name" form={updateBlogTaxonomy}>
						<Form.Control>
							<Form.Label>Nom</Form.Label>
							<Input name="name" type="text" bind:value={$updateBlogTaxonomyData.name} />
						</Form.Control>
						<Form.FieldErrors />
					</Form.Field>
				</div>
				<div class="w-[100%]">
					<Form.Field name="slug" form={updateBlogTaxonomy}>
						<Form.Control>
							<Form.Label>Slug</Form.Label>
							<Input name="slug" type="text" bind:value={$updateBlogTaxonomyData.slug} />
						</Form.Control>
						<Form.FieldErrors />
					</Form.Field>
				</div>
				<div class="w-[100%] flex items-center space-x-2">
					<Checkbox id="multiple" bind:checked={$updateBlogTaxonomyData.multiple} name="multiple" />
					<Label for="multiple">Sélection multiple sur un article</Label>
				</div>
			</div>
			<input type="hidden" name="id" value={id} />
			<Button type="submit">Save changes</Button>
		</form>
	</div>
</div>

<div class="ccc w-[100%]">
	<Table
		name="Valeurs"
		columns={valueColumns}
		data={valuesData}
		actions={valueActions}
		addLink={`/admin/blog/taxonomies/${id}/values/create`}
	/>
</div>
