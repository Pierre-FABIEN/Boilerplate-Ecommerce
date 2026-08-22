<script lang="ts">
	import * as Form from '$shadcn/form';
	import { Input } from '$shadcn/input';
	import { Button } from '$shadcn/button';
	import { toast } from 'svelte-sonner';
	import { superForm } from 'sveltekit-superforms';
	import { zodClient } from 'sveltekit-superforms/adapters';
	import { recoveryCodeSchema } from '$lib/schema/auth/recoveryCodeSchema';

	let { data } = $props();

	// Initialiser le formulaire Superform avec Zod
	const recoveryCodeForm = superForm(data?.verifyCodeForm ?? {}, {
		validators: zodClient(recoveryCodeSchema),
		id: 'recoveryCodeForm'
	});

	const {
		form: recoveryCodeData,
		enhance: recoveryCodeEnhance,
		message: recoveryCodeMessage
	} = recoveryCodeForm;

	// Notifications pour les messages d'erreur
	$effect(() => {
		if ($recoveryCodeMessage) {
			toast.error($recoveryCodeMessage);
		}
	});
</script>

<div class="w-screen h-screen ccc">
	<div class="w-[300px] mx-auto p-6 border shadow-lg rounded-lg backdrop-blur-3xl">
		<h1 class="text-2xl font-semibold mb-4 text-center">Récupérer votre compte</h1>
		<p class="text-center text-gray-600 mb-6">
			Entrez votre code de récupération pour accéder à votre compte.
		</p>

		<form method="POST" action="?/recovery_code" use:recoveryCodeEnhance class="space-y-6">
			<div>
				<Form.Field name="code" form={recoveryCodeForm}>
					<Form.Control>
						<Form.Label>Code de récupération</Form.Label>
						<Input
							type="text"
							name="code"
							bind:value={$recoveryCodeData.code}
							placeholder="Entrez votre code de récupération"
							required
						/>
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>
			</div>

			<div class="mt-6">
				<Button type="submit" class="w-full">Vérifier</Button>
			</div>

			<p class="text-center mt-4 text-sm text-red-500">{$recoveryCodeMessage ?? ''}</p>
		</form>
	</div>
</div>
