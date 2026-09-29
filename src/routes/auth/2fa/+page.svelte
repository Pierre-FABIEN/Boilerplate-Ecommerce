<script lang="ts">
	import { untrack } from 'svelte';
	import * as Form from '$shadcn/form';
	import { Input } from '$shadcn/input';
	import { Button } from '$shadcn/button';
	import { superForm } from 'sveltekit-superforms';
	import { zodClient } from 'sveltekit-superforms/adapters';
	import { totpCodeSchema } from '$lib/schema/auth/totpCodeSchema';
	import { toast } from 'svelte-sonner';

	let { data } = $props();

	// Initialiser le formulaire Superform avec Zod
	const totpForm = superForm(
		untrack(() => data?.totpForm ?? {}),
		{
			validators: zodClient(totpCodeSchema),
			id: 'totpForm'
		}
	);

	const { form: totpData, enhance: totpEnhance, message: totpMessage } = totpForm;

	$effect(() => {
		if ($totpMessage) {
			toast.error($totpMessage);
		}

		//console.log($totpData);
	});
</script>

<div class="w-screen h-screen ccc">
	<div class="w-[300px] mx-auto p-6 border shadow-lg rounded-lg backdrop-blur-3xl">
		<h1 class="text-2xl font-semibold mb-6 text-center">Authentification à deux facteurs</h1>
		<p class="text-center mb-4 text-gray-600">
			Saisissez le code affiché par votre application d'authentification.
		</p>

		<!-- Formulaire TOTP -->
		<form method="POST" action="?/totp" use:totpEnhance class="space-y-6">
			<div>
				<Form.Field name="code" form={totpForm}>
					<Form.Control>
						<Form.Label>Code d'authentification</Form.Label>
						<Input
							type="text"
							name="code"
							bind:value={$totpData.code}
							placeholder="Entrez votre code"
							autocomplete="one-time-code"
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

		<!-- Lien pour utiliser le code de récupération -->
		<div class="mt-4 text-center">
			<a href="/auth/2fa/reset" class="text-orange-700 hover:underline">
				Utiliser un code de récupération
			</a>
		</div>
	</div>
</div>
