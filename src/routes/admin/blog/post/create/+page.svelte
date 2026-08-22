<script lang="ts">
	import * as Form from '$shadcn/form';
	import * as Popover from '$shadcn/popover';
	import * as Command from '$shadcn/command';
	import { Input } from '$shadcn/input';
	import { Button } from '$shadcn/button';
	import { Checkbox } from '$shadcn/checkbox/index.js';
	import { Label } from '$shadcn/label/index.js';

	import { superForm } from 'sveltekit-superforms';
	import { zodClient } from 'sveltekit-superforms/adapters';
	import { goto } from '$app/navigation';
	import Editor from '@tinymce/tinymce-svelte';
	import { toast } from 'svelte-sonner';
	import { createBlogPostSchema } from '$lib/schema/BlogPost/BlogPostSchema.js';
	import { PUBLIC_TINYMCE_API_KEY } from '$env/static/public';

	// Receive props from the server
	let { data } = $props();

	// Variables pour catégories et tags
	let categories = $state(data.AllCategoriesPost || []);
	let tags = $state(data.AllTagsPost || []);
	// Pour les catégories, seule la sélection du nom est stockée
	let selectedCategory = $state([]);
	// Les popovers pour les catégories et tags
	let openCategory = $state(false);
	let openTag = $state(false);

	// Initialisation du formulaire via SuperForm
	const createPost = superForm(data.IcreateBlogPostSchema, {
		validators: zodClient(createBlogPostSchema)
	});

	const {
		form: createPostData,
		enhance: createPostEnhance,
		message: createPostMessage
	} = createPost;

	// L'auteur de l'article est l'administrateur connecté.
	// AUTH-PLUGIN : `data.user` vient de `+layout.server.ts` ; sans
	// authentification, choisir l'auteur dans une liste (`BlogAuthor`).
	$createPostData.authorId = data.user.id;
	if (!$createPostData.tagIds) {
		$createPostData.tagIds = [];
	}

	// Affichage d'un toast et redirection en cas de succès
	$effect(() => {
		if ($createPostMessage === 'Post created successfully') {
			toast.success($createPostMessage);
			setTimeout(() => goto('/admin/blog/'), 0);
		}
	});

	/*
	 * Sélection d'une catégorie
	 * Seule une catégorie peut être sélectionnée, on affecte son nom et son ID.
	 */
	function handleSelectCategory(category) {
		selectedCategory = category.name;
		$createPostData.categoryId = category.id;
		openCategory = false;
	}

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

				<!-- Popover pour la sélection de la catégorie -->
				<div class="mx-2">
					<Popover.Root bind:open={openCategory}>
						<Popover.Trigger>
							<Button>
								Catégories : {selectedCategory}
							</Button>
						</Popover.Trigger>
						<Popover.Content>
							<Command.Root>
								{#each categories as category}
									<Command.Item onSelect={() => handleSelectCategory(category)}>
										{category.name}
									</Command.Item>
								{/each}
							</Command.Root>
						</Popover.Content>
					</Popover.Root>
				</div>

				<!-- Sélection de Tags avec un Checkbox.Group -->
				<!-- Tags multi-sélection : inputs natifs -->
				<Popover.Root bind:open={openTag}>
					<Popover.Trigger>
						<Button>
							Tags : {($createPostData?.tagIds || []).length} sélectionnés
						</Button>
					</Popover.Trigger>
					<Popover.Content class="p-4 space-y-2">
						{#each tags as tag}
							<div class="flex items-center space-x-2">
								<!-- Input natif, name="tagIds" -->
								<input
									type="checkbox"
									name="tagIds"
									value={tag.id}
									id={'tag-' + tag.id}
									checked={$createPostData.tagIds.includes(tag.id)}
									onchange={(e) => {
										if (e.target.checked) {
											$createPostData.tagIds = [...$createPostData.tagIds, tag.id];
										} else {
											$createPostData.tagIds = $createPostData.tagIds.filter((id) => id !== tag.id);
										}
									}}
								/>
								<Label for={'tag-' + tag.id}>{tag.name}</Label>
							</div>
						{/each}
					</Popover.Content>
				</Popover.Root>

				<!-- Champ Content avec éditeur -->
				<div class="w-[100%]">
					<Form.Field name="content" form={createPost}>
						<Form.Control>
							<Form.Label>Content</Form.Label>
							<Editor
								{editorConfig}
								scriptSrc="/tinymce/tinymce.min.js"
								apiKey={PUBLIC_TINYMCE_API_KEY}
								bind:value={$createPostData.content}
							/>
						</Form.Control>
						<Form.FieldErrors />
					</Form.Field>
				</div>

				<!-- Inputs cachés pour transmettre les IDs et autres champs -->
				<input type="text" name="tagIds" bind:value={$createPostData.tagIds} class="hidden" />
				<input
					type="text"
					name="categoryId"
					bind:value={$createPostData.categoryId}
					class="hidden"
				/>
				<input type="hidden" name="authorId" bind:value={$createPostData.authorId} />
				<input type="hidden" name="content" bind:value={$createPostData.content} />
				<Button type="submit">Save changes</Button>
			</div>
		</form>
	</div>
</div>
