<script lang="ts">
	import { untrack } from 'svelte';
	import * as Form from '$shadcn/form';
	import Input from '$shadcn/input/input.svelte';
	import Button from '$shadcn/button/button.svelte';
	import { superForm } from 'sveltekit-superforms';
	import { zodClient } from 'sveltekit-superforms/adapters';
	import { totpSchema } from '$lib/schema/auth/totpSchema';
	import { toast } from 'svelte-sonner';

	let { data } = $props();

	const twoFactorForm = superForm(
		untrack(() => data.totpForm),
		{
			validators: zodClient(totpSchema),
			id: 'twoFactorForm'
		}
	);

	const { form: twoFactorData, enhance: formEnhance, message: formMessage } = twoFactorForm;

	$effect(() => {
		if ($formMessage === 'TOTP setup completed successfully') {
			toast.success($formMessage);
		} else if ($formMessage) {
			toast.error($formMessage);
		}
	});
</script>

<div class="w-screen h-screen ccc">
	<div class="w-[300px] mx-auto p-6 border shadow-lg rounded-lg backdrop-blur-3xl">
		<h1 class="text-2xl font-semibold mb-4">Configurer l'authentification à deux facteurs</h1>

		<div class="flex flex-col items-center">
			<!-- QR Code : SVG généré par `uqr` (`renderSVG`, voir +page.server.ts) —
			     toujours un pavage de rectangles représentant les pixels du QR
			     code, jamais un texte injecté tel quel. Aucune entrée ici n'est
			     assez proche d'attaquant-contrôlée (secret TOTP généré côté
			     serveur) pour en faire un vecteur XSS. -->
			<div class="w-64 h-64 mb-4">
				{@html data.qrcode}
			</div>

			<!-- Formulaire TOTP -->
			<form
				method="POST"
				use:formEnhance
				action="?/setuptotp"
				class="space-y-4 w-full max-w-sm mx-auto"
			>
				<input type="hidden" name="encodedTOTPKey" value={data.encodedTOTPKey} required />

				<!-- Champ de code TOTP -->
				<Form.Field name="code" form={twoFactorForm}>
					<Form.Control>
						<Form.Label>Code de vérification</Form.Label>
						<Input
							id="form-totp-code"
							name="code"
							type="text"
							placeholder="Entrez le code"
							bind:value={$twoFactorData.code}
							required
							class="mt-1 block w-full"
						/>
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>

				<!-- Bouton de soumission -->
				<div class="mt-6">
					<Button type="submit" class="w-full" variant="outline">Valider</Button>
				</div>
			</form>
		</div>
	</div>
</div>
