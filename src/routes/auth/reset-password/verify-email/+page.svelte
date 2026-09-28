<script lang="ts">
	import { untrack } from 'svelte';
	import * as Form from '$shadcn/form';
	import { Input } from '$shadcn/input';
	import { Button } from '$shadcn/button';
	import { toast } from 'svelte-sonner';
	import { superForm } from 'sveltekit-superforms';
	import { zodClient } from 'sveltekit-superforms/adapters';
	import { RETRY_FRIENDLY_FORM } from '$lib/forms/superformOptions';
	import { verifyCodeSchema } from '$lib/schema/auth/verifyCodeSchema';

	let { data } = $props();
	//console.log(data);

	// Initialiser le formulaire Superform avec Zod
	const verifyEmailForm = superForm(
		untrack(() => data?.verifyEmailForm ?? {}),
		{
			validators: zodClient(verifyCodeSchema),
			id: 'verifyEmailForm',
			...RETRY_FRIENDLY_FORM
		}
	);

	const {
		form: verifyEmailData,
		enhance: verifyEmailEnhance,
		message: verifyEmailMessage
	} = verifyEmailForm;

	// Notifications pour les messages d'erreur
	$effect(() => {
		if ($verifyEmailMessage) {
			toast.error($verifyEmailMessage);
		}
	});
</script>

<div class="w-screen h-screen ccc">
	<div class="w-[300px] mx-auto p-6 border shadow-lg rounded-lg backdrop-blur-3xl">
		<h1 class="text-2xl font-semibold mb-4 text-center">Vérifiez votre adresse e-mail</h1>
		<p class="text-center text-gray-600 mb-6">Un code à 8 chiffres a été envoyé à {data.email}.</p>

		<form method="POST" action="?/verify" use:verifyEmailEnhance class="space-y-6">
			<div>
				<Form.Field name="code" form={verifyEmailForm}>
					<Form.Control>
						<Form.Label>Code</Form.Label>
						<Input
							type="text"
							name="code"
							bind:value={$verifyEmailData.code}
							placeholder="Entrez votre code de vérification"
							required
						/>
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>
			</div>

			<div class="mt-6">
				<Button type="submit" class="w-full">Vérifier</Button>
			</div>

			<p class="text-center mt-4 text-sm text-red-500">{$verifyEmailMessage ?? ''}</p>
		</form>
	</div>
</div>
