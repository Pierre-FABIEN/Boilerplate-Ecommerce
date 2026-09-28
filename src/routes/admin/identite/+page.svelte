<script lang="ts">
	import { untrack } from 'svelte';
	import { Button } from '$shadcn/button';
	import { Input } from '$shadcn/input';
	import { Label } from '$shadcn/label';
	import { Checkbox } from '$shadcn/checkbox/index.js';
	import * as Form from '$shadcn/form';
	import { toast } from 'svelte-sonner';
	import { superForm } from 'sveltekit-superforms';
	import { zodClient } from 'sveltekit-superforms/adapters';
	import { RETRY_FRIENDLY_FORM } from '$lib/forms/superformOptions';
	import { companyIdentitySchema } from '$lib/schema/settings/companyIdentitySchema';

	let { data } = $props();

	const companyForm = superForm(
		untrack(() => data.companyForm),
		{
			validators: zodClient(companyIdentitySchema),
			id: 'companyIdentity',
			...RETRY_FRIENDLY_FORM
		}
	);
	const { form: companyFormData, enhance: companyEnhance, message: companyMessage } = companyForm;

	$effect(() => {
		if ($companyMessage) toast.success($companyMessage);
	});

	// Aperçu local avant envoi — le fichier lui-même part avec le reste du
	// formulaire (`enctype="multipart/form-data"`), jamais uploadé à part.
	// `readAsDataURL` plutôt que `URL.createObjectURL` : une URL `blob:`
	// viole la CSP `img-src` (seuls `'self'`, `data:` et Cloudinary sont
	// autorisés, voir svelte.config.js) — encore en Report-Only, mais
	// autant ne pas ajouter de violation à confirmer avant de la rendre
	// bloquante.
	let logoPreview = $state<string | null>(null);
	let removeLogo = $state(false);

	function onLogoChange(event: Event) {
		const file = (event.currentTarget as HTMLInputElement).files?.[0];
		if (!file) {
			logoPreview = null;
			return;
		}
		removeLogo = false;
		const reader = new FileReader();
		reader.onload = () => {
			logoPreview = typeof reader.result === 'string' ? reader.result : null;
		};
		reader.readAsDataURL(file);
	}
</script>

<svelte:head>
	<title>Identité de l'entreprise — Admin</title>
</svelte:head>

<div class="px-6 space-y-6 max-w-2xl">
	<div>
		<h1 class="text-2xl font-semibold">Identité de l'entreprise</h1>
		<p class="text-sm text-muted-foreground">
			Alimente les mentions légales (<code>/mentions-legales</code>) et les factures/avoirs PDF. Un
			champ laissé vide reste « [À COMPLÉTER] » sur le site — voir
			<code>CONFORMITE_ECOMMERCE.md</code>.
		</p>
	</div>

	<form method="POST" enctype="multipart/form-data" use:companyEnhance class="space-y-6">
		<div class="space-y-2">
			<Label for="logo">Logo</Label>
			<p class="text-sm text-muted-foreground">
				Utilisé dans les données structurées du site (JSON-LD <code>Organization</code>) et sur
				l'en-tête des factures/avoirs PDF. Aucun logo par défaut tant qu'il n'est pas fourni ici.
			</p>
			{#if logoPreview}
				<img
					src={logoPreview}
					alt="Aperçu du logo"
					class="h-20 w-auto rounded border object-contain"
				/>
			{:else if data.logoUrl && !removeLogo}
				<img
					src={data.logoUrl}
					alt="Logo actuel de l'entreprise"
					class="h-20 w-auto rounded border object-contain"
				/>
			{/if}
			<Input
				id="logo"
				name="logo"
				type="file"
				accept="image/png, image/jpeg"
				onchange={onLogoChange}
			/>
			<p class="text-xs text-muted-foreground">
				PNG ou JPEG — utilisé tel quel sur les factures PDF, un SVG n'y serait pas lisible.
			</p>
			{#if data.logoUrl}
				<div class="flex items-center gap-2">
					<input type="hidden" name="removeLogo" value={removeLogo ? 'on' : 'off'} />
					<Checkbox id="removeLogo" bind:checked={removeLogo} />
					<Label for="removeLogo" class="font-normal text-sm">Supprimer le logo actuel</Label>
				</div>
			{/if}
		</div>

		<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
			<Form.Field name="name" form={companyForm}>
				<Form.Control>
					<Form.Label>Raison sociale</Form.Label>
					<Input name="name" bind:value={$companyFormData.name} />
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>
			<Form.Field name="legalForm" form={companyForm}>
				<Form.Control>
					<Form.Label>Forme juridique</Form.Label>
					<Input
						name="legalForm"
						placeholder="SASU, SARL..."
						bind:value={$companyFormData.legalForm}
					/>
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>
			<Form.Field name="shareCapital" form={companyForm}>
				<Form.Control>
					<Form.Label>Capital social</Form.Label>
					<Input
						name="shareCapital"
						placeholder="10 000 €"
						bind:value={$companyFormData.shareCapital}
					/>
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>
			<Form.Field name="publicationDirector" form={companyForm}>
				<Form.Control>
					<Form.Label>Directeur de la publication</Form.Label>
					<Input name="publicationDirector" bind:value={$companyFormData.publicationDirector} />
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>
			<Form.Field name="address" form={companyForm}>
				<Form.Control>
					<Form.Label>Adresse du siège</Form.Label>
					<Input
						name="address"
						placeholder="123 Rue des Affaires"
						bind:value={$companyFormData.address}
					/>
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>
			<Form.Field name="city" form={companyForm}>
				<Form.Control>
					<Form.Label>Code postal et ville</Form.Label>
					<Input name="city" placeholder="75000 Paris, France" bind:value={$companyFormData.city} />
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>
			<Form.Field name="siret" form={companyForm}>
				<Form.Control>
					<Form.Label>SIRET</Form.Label>
					<Input name="siret" bind:value={$companyFormData.siret} />
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>
			<Form.Field name="vatNumber" form={companyForm}>
				<Form.Control>
					<Form.Label>N° de TVA intracommunautaire</Form.Label>
					<Input name="vatNumber" bind:value={$companyFormData.vatNumber} />
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>
			<Form.Field name="phone" form={companyForm}>
				<Form.Control>
					<Form.Label>Téléphone</Form.Label>
					<Input name="phone" bind:value={$companyFormData.phone} />
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>
			<Form.Field name="email" form={companyForm}>
				<Form.Control>
					<Form.Label>E-mail de contact</Form.Label>
					<Input name="email" type="email" bind:value={$companyFormData.email} />
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>
		</div>
		<Button type="submit">Enregistrer</Button>
	</form>
</div>
