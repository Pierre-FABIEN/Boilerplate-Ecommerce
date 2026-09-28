<script lang="ts">
	import { untrack } from 'svelte';
	import * as Form from '$shadcn/form';
	import { Input } from '$shadcn/input';
	import { Button } from '$shadcn/button';
	import Checkbox from '$shadcn/checkbox/checkbox.svelte';
	import { Label } from '$shadcn/label';
	import { superForm } from 'sveltekit-superforms';
	import { zodClient } from 'sveltekit-superforms/adapters';
	import { RETRY_FRIENDLY_FORM } from '$lib/forms/superformOptions';
	import { createBlogTaxonomySchema } from '$lib/schema/BlogPost/blogTaxonomySchema';
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';

	let { data } = $props();

	const createBlogTaxonomy = superForm(
		untrack(() => data.IcreateBlogTaxonomySchema),
		{
			validators: zodClient(createBlogTaxonomySchema),
			id: 'createBlogTaxonomy',
			...RETRY_FRIENDLY_FORM
		}
	);

	const {
		form: createBlogTaxonomyData,
		enhance: createBlogTaxonomyEnhance,
		message: createBlogTaxonomyMessage
	} = createBlogTaxonomy;

	// Slug auto-dérivé du nom tant que l'utilisateur ne l'a pas modifié à la main.
	let slugTouched = $state(false);
	function slugify(value: string) {
		return value
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '')
			.toLowerCase()
			.trim()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/(^-|-$)/g, '');
	}
	function onNameInput() {
		if (!slugTouched) $createBlogTaxonomyData.slug = slugify($createBlogTaxonomyData.name ?? '');
	}

	$effect(() => {
		if ($createBlogTaxonomyMessage === 'Taxonomy created successfully') {
			toast.success('Taxonomie créée');
			setTimeout(() => goto('/admin/blog'), 0);
		}
	});
</script>

<div class="ccc">
	<div class="m-5 p-5 border w-[420px]">
		<form
			method="POST"
			action="?/createBlogTaxonomy"
			use:createBlogTaxonomyEnhance
			class="space-y-4"
		>
			<div class="ccs mt-5">
				<div class="w-[100%]">
					<Form.Field name="name" form={createBlogTaxonomy}>
						<Form.Control>
							<Form.Label>Nom</Form.Label>
							<Input
								name="name"
								type="text"
								bind:value={$createBlogTaxonomyData.name}
								oninput={onNameInput}
							/>
						</Form.Control>
						<Form.FieldErrors />
					</Form.Field>
				</div>
				<div class="w-[100%]">
					<Form.Field name="slug" form={createBlogTaxonomy}>
						<Form.Control>
							<Form.Label>Slug</Form.Label>
							<Input
								name="slug"
								type="text"
								bind:value={$createBlogTaxonomyData.slug}
								oninput={() => (slugTouched = true)}
							/>
						</Form.Control>
						<Form.FieldErrors />
					</Form.Field>
				</div>
				<div class="w-[100%] flex items-center space-x-2">
					<Checkbox id="multiple" bind:checked={$createBlogTaxonomyData.multiple} name="multiple" />
					<Label for="multiple">Sélection multiple sur un article</Label>
				</div>
			</div>
			<Button type="submit">Créer</Button>
		</form>
	</div>
</div>
