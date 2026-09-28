<script lang="ts">
	import { untrack } from 'svelte';
	import * as Form from '$shadcn/form';
	import { Input } from '$shadcn/input';
	import { Button } from '$shadcn/button';
	import { toast } from 'svelte-sonner';
	import { superForm } from 'sveltekit-superforms';
	import { zodClient } from 'sveltekit-superforms/adapters';
	import { RETRY_FRIENDLY_FORM } from '$lib/forms/superformOptions';
	import { forgotPasswordSchema } from '$lib/schema/auth/forgotPasswordSchema';

	let { data } = $props();

	// Initialiser le formulaire Superform avec Zod
	const forgotForm = superForm(
		untrack(() => data.forgotForm),
		{
			validators: zodClient(forgotPasswordSchema),
			id: 'forgotForm',
			...RETRY_FRIENDLY_FORM
		}
	);

	const { form: forgotData, enhance: forgotEnhance, message: forgotMessage } = forgotForm;

	// Notification d'erreur si un message est reçu
	$effect(() => {
		if ($forgotMessage) {
			toast.error($forgotMessage);
		}
	});
</script>

<div class="w-screen h-screen ccc">
	<div class="w-[300px] mx-auto p-6 border shadow-lg rounded-lg backdrop-blur-3xl">
		<h1 class="text-2xl font-semibold mb-6 text-center">Mot de passe oublié</h1>

		<form method="POST" action="?/forgotPassword" use:forgotEnhance class="space-y-6">
			<div>
				<Form.Field name="email" form={forgotForm}>
					<Form.Control>
						<Form.Label>Email</Form.Label>
						<Input
							type="email"
							name="email"
							bind:value={$forgotData.email}
							placeholder="Entrez votre adresse email"
							required
						/>
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>
			</div>

			<div class="mt-6">
				<Button type="submit" class="w-full">Envoyer</Button>
			</div>

			<p class="text-center mt-4 text-sm text-red-500">{$forgotMessage ?? ''}</p>
		</form>

		<div class="mt-4 flex justify-center text-sm">
			<a href="/auth/login" class="text-orange-700 hover:underline">Se connecter</a>
		</div>
	</div>
</div>
