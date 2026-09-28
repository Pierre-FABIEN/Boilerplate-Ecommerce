<script lang="ts">
	import { untrack } from 'svelte';
	// ----- Imports -----
	import * as Form from '$shadcn/form';
	import { Input } from '$shadcn/input';
	import { Checkbox } from '$shadcn/checkbox';
	import { Label } from '$shadcn/label';
	import Editor from '@tinymce/tinymce-svelte';
	import { toast } from 'svelte-sonner';
	import { goto } from '$app/navigation';
	import { Button } from '$shadcn/button';
	import TaxonomyValuePicker from '$components/TaxonomyValuePicker.svelte';

	import { superForm } from 'sveltekit-superforms';
	import { zodClient } from 'sveltekit-superforms/adapters';
	import { RETRY_FRIENDLY_FORM } from '$lib/forms/superformOptions';
	import { updateBlogPostSchema } from '$lib/schema/BlogPost/BlogPostSchema.js';
	import { PUBLIC_TINYMCE_API_KEY } from '$env/static/public';

	// ----- Props from the server -----
	let { data } = $props();

	// ----- Prepare superForm for update -----
	const updateForm = superForm(
		untrack(() => data.IupdateBlogPostSchema),
		{
			validators: zodClient(updateBlogPostSchema),
			...RETRY_FRIENDLY_FORM
		}
	);

	const {
		form: updateData, // The reactive form data
		enhance: updateEnhance,
		message: updateMessage
	} = updateForm;

	// On success, show toast and redirect
	$effect(() => {
		if ($updateMessage === 'Post updated successfully') {
			toast.success($updateMessage);
			setTimeout(() => goto('/admin/blog'), 0);
		}
	});

	// Le picker attend {type, values:{code,parentId}} : le blog n'a ni couleur
	// ni hiérarchie, ces champs sont donc toujours neutres.
	const taxonomies = untrack(() =>
		(data.taxonomies || []).map((taxonomy) => ({
			...taxonomy,
			type: 'TEXT',
			values: taxonomy.values.map((v) => ({ ...v, code: null, parentId: null }))
		}))
	);

	// ----- TinyMCE config -----
	let editorConfig = {
		telemetry: false,
		branding: false,
		license_key: 'gpl',
		plugins: [
			'advlist autolink lists link image charmap anchor searchreplace visualblocks code fullscreen insertdatetime media table preview help wordcount'
		],
		toolbar:
			'undo redo | blocks | bold italic forecolor | alignleft aligncenter alignright alignjustify | bullist numlist outdent indent | removeformat | help'
	};
</script>

<form method="POST" action="?/updatePost" use:updateEnhance class="space-y-4">
	<!-- Title -->
	<Form.Field name="title" form={updateForm}>
		<Form.Control>
			<Form.Label>Title</Form.Label>
			<Input name="title" type="text" bind:value={$updateData.title} />
		</Form.Control>
		<Form.FieldErrors />
	</Form.Field>

	<!-- Published -->
	<Form.Field name="published" form={updateForm}>
		<Form.Control>
			<div class="flex items-center">
				<Checkbox name="published" bind:checked={$updateData.published as boolean} />
				<Label class="ml-2">Published</Label>
			</div>
		</Form.Control>
		<Form.FieldErrors />
	</Form.Field>

	<TaxonomyValuePicker
		{taxonomies}
		bind:selectedIds={
			() => $updateData.taxonomyValueIds ?? [], (v) => ($updateData.taxonomyValueIds = v)
		}
	/>

	<!-- Content -->
	<Form.Field name="content" form={updateForm}>
		<Form.Control>
			<Form.Label>Content</Form.Label>
			<Editor
				conf={editorConfig}
				scriptSrc="/tinymce/tinymce.min.js"
				apiKey={PUBLIC_TINYMCE_API_KEY}
				bind:value={$updateData.content}
			/>
		</Form.Control>
		<Form.FieldErrors />
	</Form.Field>

	<!-- Hidden fields for the form submission -->
	<input type="hidden" name="id" value={$updateData.id} />
	<input type="hidden" name="authorId" bind:value={$updateData.authorId} />
	<input type="hidden" name="content" bind:value={$updateData.content} />
	<input type="hidden" name="taxonomyValueIds" bind:value={$updateData.taxonomyValueIds} />

	<!-- Submit -->
	<Button type="submit">Save changes</Button>
</form>
