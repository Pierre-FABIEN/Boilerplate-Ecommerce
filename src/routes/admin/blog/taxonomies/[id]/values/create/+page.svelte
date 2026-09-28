<script lang="ts">
	import { untrack } from 'svelte';
	import * as Form from '$shadcn/form';
	import { Input } from '$shadcn/input';
	import { Button } from '$shadcn/button';
	import { superForm } from 'sveltekit-superforms';
	import { zodClient } from 'sveltekit-superforms/adapters';
	import { RETRY_FRIENDLY_FORM } from '$lib/forms/superformOptions';
	import { createBlogTaxonomyValueSchema } from '$lib/schema/BlogPost/blogTaxonomyValueSchema';
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';

	let { data } = $props();

	const createBlogTaxonomyValue = superForm(
		untrack(() => data.IcreateBlogTaxonomyValueSchema),
		{
			validators: zodClient(createBlogTaxonomyValueSchema),
			id: 'createBlogTaxonomyValue',
			...RETRY_FRIENDLY_FORM
		}
	);

	const {
		form: createBlogTaxonomyValueData,
		enhance: createBlogTaxonomyValueEnhance,
		message: createBlogTaxonomyValueMessage
	} = createBlogTaxonomyValue;

	$effect(() => {
		if ($createBlogTaxonomyValueMessage === 'Taxonomy value created successfully') {
			toast.success('Valeur créée');
			setTimeout(() => goto(`/admin/blog/taxonomies/${data.taxonomy.id}`), 0);
		}
	});
</script>

<div class="ccc">
	<div class="m-5 p-5 border w-[420px]">
		<form
			method="POST"
			action="?/createBlogTaxonomyValue"
			use:createBlogTaxonomyValueEnhance
			class="space-y-4"
		>
			<div class="ccs mt-5">
				<div class="w-[100%]">
					<Form.Field name="value" form={createBlogTaxonomyValue}>
						<Form.Control>
							<Form.Label>Valeur</Form.Label>
							<Input name="value" type="text" bind:value={$createBlogTaxonomyValueData.value} />
						</Form.Control>
						<Form.FieldErrors />
					</Form.Field>
				</div>
				<div class="w-[100%]">
					<Form.Field name="label" form={createBlogTaxonomyValue}>
						<Form.Control>
							<Form.Label>Libellé affiché (facultatif)</Form.Label>
							<Input name="label" type="text" bind:value={$createBlogTaxonomyValueData.label} />
						</Form.Control>
						<Form.FieldErrors />
					</Form.Field>
				</div>
			</div>
			<input type="hidden" name="taxonomyId" value={data.taxonomy.id} />
			<Button type="submit">Créer</Button>
		</form>
	</div>
</div>
