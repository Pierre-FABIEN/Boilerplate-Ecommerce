<script lang="ts">
	import { untrack } from 'svelte';
	import * as Form from '$shadcn/form';
	import { Input } from '$shadcn/input';
	import { Button } from '$shadcn/button';
	import { superForm } from 'sveltekit-superforms';
	import { zodClient } from 'sveltekit-superforms/adapters';
	import { RETRY_FRIENDLY_FORM } from '$lib/forms/superformOptions';
	import { loginSchema } from '$lib/schema/auth/loginSchema';
	import { toast } from 'svelte-sonner';

	let { data } = $props();

	//console.log(data);

	// Initialiser le formulaire Superform avec Zod
	const loginForm = superForm(
		untrack(() => data?.loginForm ?? {}),
		{
			validators: zodClient(loginSchema),
			id: 'loginForm',
			...RETRY_FRIENDLY_FORM
		}
	);

	const { form: loginData, enhance: loginEnhance, message: loginMessage } = loginForm;

	$effect(() => {
		if ($loginMessage) {
			toast.error($loginMessage);
		}
	});
</script>

<div class="w-screen h-screen ccc">
	<div class="loginContainer w-[300px] mx-auto p-6 border shadow-lg rounded-lg backdrop-blur-3xl">
		<h1 class="text-2xl font-semibold mb-6 text-center">Connexion</h1>

		<form method="POST" action="?/login" use:loginEnhance class="space-y-6">
			<div>
				<Form.Field name="email" form={loginForm}>
					<Form.Control>
						<Form.Label>Email</Form.Label>
						<Input
							type="email"
							name="email"
							bind:value={$loginData.email}
							placeholder="Entrez votre email"
							required
						/>
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>
			</div>

			<div>
				<Form.Field name="password" form={loginForm}>
					<Form.Control>
						<Form.Label>Mot de passe</Form.Label>
						<Input
							type="password"
							name="password"
							bind:value={$loginData.password}
							placeholder="Entrez votre mot de passe"
							required
						/>
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>
			</div>
			<div class="mt-6">
				<Button type="submit" class="w-full">Continuer</Button>
			</div>

			<a href="/auth/login/google">
				<Button class="w-full mt-10">Sign in with Google</Button>
			</a>
		</form>

		<div class="mt-4 flex justify-between text-sm">
			<a href="/auth/signup" class="text-orange-700 hover:underline">Créer un compte</a>
			<a href="/auth/forgot-password" class="text-orange-700 hover:underline"
				>Mot de passe oublié ?</a
			>
		</div>
	</div>
</div>
