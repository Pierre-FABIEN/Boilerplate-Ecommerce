<script lang="ts">
	import { untrack } from 'svelte';
	import { page } from '$app/state';
	import * as Form from '$shadcn/form';
	import { Input } from '$shadcn/input';
	import { Button } from '$shadcn/button';
	import { superForm } from 'sveltekit-superforms';
	import { zodClient } from 'sveltekit-superforms/adapters';
	import { RETRY_FRIENDLY_FORM } from '$lib/forms/superformOptions';
	import { updateBlogTaxonomyValueSchema } from '$lib/schema/BlogPost/blogTaxonomyValueSchema';
	import { toast } from 'svelte-sonner';

	let { data } = $props();
	let valueId = $derived(page.params.valueId);

	const updateBlogTaxonomyValue = superForm(
		untrack(() => data.IupdateBlogTaxonomyValueSchema),
		{
			validators: zodClient(updateBlogTaxonomyValueSchema),
			id: 'updateBlogTaxonomyValue',
			...RETRY_FRIENDLY_FORM
		}
	);

	const {
		form: updateBlogTaxonomyValueData,
		enhance: updateBlogTaxonomyValueEnhance,
		message: updateBlogTaxonomyValueMessage
	} = updateBlogTaxonomyValue;

	$effect(() => {
		if ($updateBlogTaxonomyValueMessage === 'Taxonomy value updated successfully') {
			toast.success('Valeur mise à jour');
		}
	});
</script>

<div class="ccc">
	<div class="m-5 p-5 border w-[420px]">
		<form
			method="POST"
			action="?/updateBlogTaxonomyValue"
			use:updateBlogTaxonomyValueEnhance
			class="space-y-4"
		>
			<div class="ccs mt-5">
				<div class="w-[100%]">
					<Form.Field name="value" form={updateBlogTaxonomyValue}>
						<Form.Control>
							<Form.Label>Valeur</Form.Label>
							<Input name="value" type="text" bind:value={$updateBlogTaxonomyValueData.value} />
						</Form.Control>
						<Form.FieldErrors />
					</Form.Field>
				</div>
				<div class="w-[100%]">
					<Form.Field name="label" form={updateBlogTaxonomyValue}>
						<Form.Control>
							<Form.Label>Libellé affiché (facultatif)</Form.Label>
							<Input name="label" type="text" bind:value={$updateBlogTaxonomyValueData.label} />
						</Form.Control>
						<Form.FieldErrors />
					</Form.Field>
				</div>
			</div>
			<input type="hidden" name="id" value={valueId} />
			<input type="hidden" name="taxonomyId" bind:value={$updateBlogTaxonomyValueData.taxonomyId} />
			<Button type="submit">Save changes</Button>
		</form>
	</div>
</div>
