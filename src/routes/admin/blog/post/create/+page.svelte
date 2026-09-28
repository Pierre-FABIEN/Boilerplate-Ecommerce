<script lang="ts">
	import { untrack } from 'svelte';
	import * as Form from '$shadcn/form';
	import { Input } from '$shadcn/input';
	import { Button } from '$shadcn/button';
	import { Checkbox } from '$shadcn/checkbox/index.js';
	import { Label } from '$shadcn/label/index.js';
	import TaxonomyValuePicker from '$components/TaxonomyValuePicker.svelte';

	import { superForm } from 'sveltekit-superforms';
	import { zodClient } from 'sveltekit-superforms/adapters';
	import { RETRY_FRIENDLY_FORM } from '$lib/forms/superformOptions';
	import { goto } from '$app/navigation';
	import Editor from '@tinymce/tinymce-svelte';
	import { toast } from 'svelte-sonner';
	import { createBlogPostSchema } from '$lib/schema/BlogPost/BlogPostSchema.js';
	import { PUBLIC_TINYMCE_API_KEY } from '$env/static/public';

	// Receive props from the server
	let { data } = $props();

	// Le picker attend {type, values:{code,parentId}} : le blog n'a ni couleur
	// ni hiérarchie, ces champs sont donc toujours neutres.
	const taxonomies = untrack(() =>
		(data.taxonomies || []).map((taxonomy) => ({
			...taxonomy,
			type: 'TEXT',
			values: taxonomy.values.map((v) => ({ ...v, code: null, parentId: null }))
		}))
	);

	// Initialisation du formulaire via SuperForm
	const createPost = superForm(
		untrack(() => data.IcreateBlogPostSchema),
		{
			validators: zodClient(createBlogPostSchema),
			...RETRY_FRIENDLY_FORM
		}
	);

	const {
		form: createPostData,
		enhance: createPostEnhance,
		message: createPostMessage
	} = createPost;

	// L'auteur de l'article est l'administrateur connecté.
	// AUTH-PLUGIN : `data.user` vient de `+layout.server.ts` ; sans
	// authentification, choisir l'auteur dans une liste (`BlogAuthor`).
	$createPostData.authorId = untrack(() => data.user.id);
	if (!$createPostData.taxonomyValueIds) {
		$createPostData.taxonomyValueIds = [];
	}

	// Affichage d'un toast et redirection en cas de succès
	$effect(() => {
		if ($createPostMessage === 'Post created successfully') {
			toast.success($createPostMessage);
			setTimeout(() => goto('/admin/blog/'), 0);
		}
	});

	// Configuration de l'éditeur
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

<div class="ccc">
	<div class="m-5 p-5 border w-[80vw]">
		<form method="POST" action="?/createPost" use:createPostEnhance class="space-y-4">
			<!-- Champ Titre -->
			<div class="w-[100%]">
				<Form.Field name="title" form={createPost}>
					<Form.Control>
						<Form.Label>Title</Form.Label>
						<Input name="title" type="text" bind:value={$createPostData.title} />
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>
			</div>

			<!-- Checkbox pour Published -->
			<div class="rcs w-[100%]">
				<div class="flex items-center space-x-2">
					<Form.Field name="published" form={createPost} class="rcc">
						<Form.Control>
							<div class="rcc">
								<Checkbox
									name="published"
									aria-labelledby="published"
									bind:checked={$createPostData.published as boolean | undefined}
								/>
								<Label
									id="published"
									for="terms"
									class="text-sm ml-2 font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
								>
									Publié
								</Label>
							</div>
						</Form.Control>
						<Form.FieldErrors />
					</Form.Field>
				</div>

				<TaxonomyValuePicker
					{taxonomies}
					bind:selectedIds={
						() => $createPostData.taxonomyValueIds ?? [],
						(v) => ($createPostData.taxonomyValueIds = v)
					}
				/>

				<!-- Champ Content avec éditeur -->
				<div class="w-[100%]">
					<Form.Field name="content" form={createPost}>
						<Form.Control>
							<Form.Label>Content</Form.Label>
							<Editor
								conf={editorConfig}
								scriptSrc="/tinymce/tinymce.min.js"
								apiKey={PUBLIC_TINYMCE_API_KEY}
								bind:value={$createPostData.content}
							/>
						</Form.Control>
						<Form.FieldErrors />
					</Form.Field>
				</div>

				<!-- Inputs cachés pour transmettre les IDs et autres champs -->
				<input
					type="text"
					name="taxonomyValueIds"
					bind:value={$createPostData.taxonomyValueIds}
					class="hidden"
				/>
				<input type="hidden" name="authorId" bind:value={$createPostData.authorId} />
				<input type="hidden" name="content" bind:value={$createPostData.content} />
				<Button type="submit">Save changes</Button>
			</div>
		</form>
	</div>
</div>
