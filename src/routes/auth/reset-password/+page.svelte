<script lang="ts">
	import { untrack } from 'svelte';
	import * as Form from '$shadcn/form';
	import { Input } from '$shadcn/input';
	import { Button } from '$shadcn/button';
	import { toast } from 'svelte-sonner';
	import { superForm } from 'sveltekit-superforms';
	import { zodClient } from 'sveltekit-superforms/adapters';
	import { RETRY_FRIENDLY_FORM } from '$lib/forms/superformOptions';
	import { resetPasswordSchema } from '$lib/schema/auth/resetPasswordSchema';

	let { data } = $props();

	// Initialiser le formulaire Superform avec le schéma Zod
	const resetPasswordForm = superForm(
		untrack(() => data?.resetPasswordForm ?? {}),
		{
			validators: zodClient(resetPasswordSchema),
			id: 'resetPasswordForm',
			...RETRY_FRIENDLY_FORM
		}
	);

	const {
		form: resetPasswordData,
		enhance: resetPasswordEnhance,
		message: resetPasswordMessage
	} = resetPasswordForm;

	// Notification pour les messages d'erreur ou de succès
	$effect(() => {
		if ($resetPasswordMessage) {
			toast.error($resetPasswordMessage);
		}
	});
</script>

<div class="w-screen h-screen ccc">
	<div class="w-[300px] mx-auto p-6 border shadow-lg rounded-lg backdrop-blur-3xl">
		<h1 class="text-2xl font-semibold mb-4 text-center">Réinitialiser votre mot de passe</h1>

		<p class="text-center text-gray-600 mb-6">Entrez votre nouveau mot de passe ci-dessous.</p>

		<!-- Formulaire de réinitialisation du mot de passe -->
		<form method="POST" action="?/resetPassword" use:resetPasswordEnhance class="space-y-6">
			<Form.Field name="password" form={resetPasswordForm}>
				<Form.Control>
					<Form.Label>Nouveau mot de passe</Form.Label>
					<Input
						type="password"
						name="password"
						bind:value={$resetPasswordData.password}
						placeholder="Entrez votre nouveau mot de passe"
						autocomplete="new-password"
						required
					/>
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>

			<div class="mt-6">
				<Button type="submit" class="w-full">Réinitialiser le mot de passe</Button>
			</div>
		</form>
	</div>
</div>
