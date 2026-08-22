<script lang="ts">
	import { enhance } from '$app/forms';
	import * as Form from '$shadcn/form';
	import Button from '$shadcn/button/button.svelte';
	import Input from '$shadcn/input/input.svelte';
	import { toast } from 'svelte-sonner';
	import { superForm } from 'sveltekit-superforms';
	import { zodClient } from 'sveltekit-superforms/adapters';
	import { verifyCodeSchema } from '$lib/schema/auth/verifyCodeSchema';

	let { data } = $props();

	const verifyCodeForm = superForm(data.verifyCode, {
		validators: zodClient(verifyCodeSchema),
		id: 'verifyCodeForm'
	});

	const { form: verifyData, enhance: verifyEnhance, message: verifyMessage } = verifyCodeForm;

	$effect(() => {
		if ($verifyMessage) {
			toast.error($verifyMessage);
		}
	});
</script>

<div class="w-screen h-screen ccc">
	<div class="w-[300px] mx-auto p-6 border shadow-lg rounded-lg backdrop-blur-3xl">
		<h1 class="text-2xl font-semibold mb-4">Vérifiez votre adresse email</h1>
		<p class="mb-4 text-gray-700">Nous avons envoyé un code de 8 chiffres à {data.email}.</p>

		<form method="post" use:verifyEnhance action="?/verifyCode" class="space-y-4">
			<div>
				<Form.Field name="code" form={verifyCodeForm}>
					<Form.Control>
						<Form.Label>Code de vérification</Form.Label>
						<Input
							id="form-verify-code"
							name="code"
							type="text"
							placeholder="Entrez le code"
							bind:value={$verifyData.code}
							required
						/>
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>
			</div>

			<div class="mt-6">
				<Button type="submit" class="w-full">Vérifier</Button>
			</div>
		</form>

		<form method="post" use:enhance action="?/resendCode" class="mt-4">
			<Button type="submit" class="w-full" variant="ghost">Renvoyer le code</Button>
		</form>
	</div>
</div>
