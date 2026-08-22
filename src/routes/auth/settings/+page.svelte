<script lang="ts">
	import * as Form from '$shadcn/form';
	import * as Card from '$shadcn/card';
	import { Input } from '$shadcn/input';
	import { Button } from '$shadcn/button';
	import { superForm } from 'sveltekit-superforms';
	import { zodClient } from 'sveltekit-superforms/adapters';
	import { toast } from 'svelte-sonner';
	import { emailSchema, passwordSchema } from '$lib/schema/auth/settingsSchemas';
	import { Switch } from '$shadcn/switch/index.js';
	import { Label } from '$shadcn/label/index.js';
	import { isMfaEnabledSchema } from '$lib/schema/users/MfaEnabledSchema.js';

	import { UserCircle, BookMarked, ReceiptText, Mail, KeyRound, ShieldCheck } from 'lucide-svelte';

	let { data } = $props();

	// Initialiser les formulaires Superform
	const emailForm = superForm(data.emailForm, {
		validators: zodClient(emailSchema),
		id: 'emailForm'
	});

	const passwordForm = superForm(data.passwordForm, {
		validators: zodClient(passwordSchema),
		id: 'passwordForm'
	});

	const isMfaEnabledForm = superForm(data.isMfaEnabledForm, {
		validators: zodClient(isMfaEnabledSchema),
		id: 'isMfaEnabledForm'
	});

	const { form: emailData, enhance: emailEnhance, message: emailMessage } = emailForm;
	const { form: passwordData, enhance: passwordEnhance, message: passwordMessage } = passwordForm;
	const {
		form: isMfaEnabledData,
		enhance: isMfaEnabledEnhance,
		message: isMfaEnabledMessage
	} = isMfaEnabledForm;

	// Notifications pour les messages d'erreur
	const SUCCESS_MESSAGES = ['Password modified successfully'];

	$effect(() => {
		if ($emailMessage) {
			toast.error($emailMessage);
		}
		if ($passwordMessage) {
			if (SUCCESS_MESSAGES.includes($passwordMessage)) {
				toast.success($passwordMessage);
			} else {
				toast.error($passwordMessage);
			}
		}
		if ($isMfaEnabledMessage && $isMfaEnabledMessage.text === 'Authentication modifiée') {
			$isMfaEnabledData.isMfaEnabled = $isMfaEnabledMessage.newStatus;
			toast.success($isMfaEnabledMessage.text);
		}
	});
</script>

<div class="container w-[100vw] h-full mx-auto px-4 py-8">
	<h1 class="titleHome mb-8 text-3xl font-bold tracking-tight">Paramètres du compte</h1>

	<div class="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4 pb-[100px]">
		<!-- Informations Personnelles -->
		<Card.Root>
			<Card.Header>
				<Card.Title class="flex items-center gap-2">
					<UserCircle class="w-6 h-6 text-primary" />
					<span>Informations Personnelles</span>
				</Card.Title>
				<Card.Description>Vos informations de base.</Card.Description>
			</Card.Header>
			<Card.Content class="space-y-3">
				{#if data.user.name}
					<div class="font-medium">
						<strong>Nom :</strong>
						{data.user.name}
					</div>
				{/if}
				<div class="font-medium">
					<strong>Email :</strong>
					{data.user.email}
				</div>
			</Card.Content>
		</Card.Root>

		{#if data.user.role === 'CLIENT'}
			<!-- Gestion des adresses -->
			<Card.Root class="flex flex-col">
				<Card.Header>
					<Card.Title class="flex items-center gap-2">
						<BookMarked class="w-6 h-6 text-primary" />
						<span>Gestion des adresses</span>
					</Card.Title>
					<Card.Description>Gérez vos adresses de livraison et de facturation.</Card.Description>
				</Card.Header>
				<Card.Content class="flex-grow" />
				<Card.Footer>
					<Button href="/auth/settings/address" class="w-full">Mes adresses</Button>
				</Card.Footer>
			</Card.Root>

			<!-- Facturation -->
			<Card.Root class="flex flex-col">
				<Card.Header>
					<Card.Title class="flex items-center gap-2">
						<ReceiptText class="w-6 h-6 text-primary" />
						<span>Facturation</span>
					</Card.Title>
					<Card.Description>Consultez l'historique de vos factures.</Card.Description>
				</Card.Header>
				<Card.Content class="flex-grow" />
				<Card.Footer>
					<Button href="/auth/settings/factures" class="w-full">Mes Factures</Button>
				</Card.Footer>
			</Card.Root>
		{/if}

		{#if !data.user.googleId}
			<!-- Mise à jour de l'email -->
			<Card.Root>
				<form method="POST" action="?/email" use:emailEnhance>
					<Card.Header>
						<Card.Title class="flex items-center gap-2">
							<Mail class="w-6 h-6 text-primary" />
							<span>Mettre à jour l'email</span>
						</Card.Title>
					</Card.Header>
					<Card.Content>
						<Form.Field name="email" form={emailForm}>
							<Form.Control>
								<Form.Label>Nouvel email</Form.Label>
								<Input
									type="email"
									name="email"
									bind:value={$emailData.email}
									placeholder="nouveau@email.com"
									required
								/>
							</Form.Control>
							<Form.FieldErrors />
						</Form.Field>
					</Card.Content>
					<Card.Footer>
						<Button type="submit" class="w-full">Mettre à jour l'email</Button>
					</Card.Footer>
				</form>
			</Card.Root>

			<!-- Mise à jour du mot de passe -->
			<Card.Root>
				<form method="POST" action="?/password" use:passwordEnhance>
					<Card.Header>
						<Card.Title class="flex items-center gap-2">
							<KeyRound class="w-6 h-6 text-primary" />
							<span>Changer le mot de passe</span>
						</Card.Title>
					</Card.Header>
					<Card.Content class="space-y-4">
						<Form.Field name="password" form={passwordForm}>
							<Form.Control>
								<Form.Label>Mot de passe actuel</Form.Label>
								<Input
									type="password"
									name="password"
									bind:value={$passwordData.password}
									autocomplete="current-password"
									required
								/>
							</Form.Control>
							<Form.FieldErrors />
						</Form.Field>

						<Form.Field name="new_password" form={passwordForm}>
							<Form.Control>
								<Form.Label>Nouveau mot de passe</Form.Label>
								<Input
									type="password"
									name="new_password"
									bind:value={$passwordData.new_password}
									autocomplete="new-password"
									required
								/>
							</Form.Control>
							<Form.FieldErrors />
						</Form.Field>
					</Card.Content>
					<Card.Footer>
						<Button type="submit" class="w-full">Changer le mot de passe</Button>
					</Card.Footer>
				</form>
			</Card.Root>

			<!-- Authentification à deux facteurs -->
			<!-- <Card.Root>
				<Card.Header>
					<Card.Title class="flex items-center gap-2">
						<ShieldCheck class="w-6 h-6 text-primary" />
						<span>Authentification à deux facteurs</span>
					</Card.Title>
					<Card.Description>Renforcez la sécurité de votre compte.</Card.Description>
				</Card.Header>
				<Card.Content>
					<div class="flex items-center justify-between rounded-lg border p-3">
						<Label for="mfa-switch" class="flex-grow cursor-pointer pr-4">Activer/Désactiver</Label>
						<form method="POST" action="?/isMfaEnabled" use:isMfaEnabledEnhance>
							<Form.Field name="isMfaEnabled" form={isMfaEnabledForm}>
								<Form.Control>
									<Switch
										name="isMfaEnabled"
										id="mfa-switch"
										bind:checked={$isMfaEnabledData.isMfaEnabled}
										type="submit"
									/>
								</Form.Control>
							</Form.Field>
						</form>
					</div>
				</Card.Content>
				{#if data.user.registered2FA && data.user.isMfaEnabled}
					<Card.Footer>
						<a href="/auth/2fa/setup" class="text-sm text-primary hover:underline">
							Reconfigurer le 2FA et voir les codes de secours
						</a>
					</Card.Footer>
				{/if}
			</Card.Root> -->
		{/if}
	</div>
</div>

<style lang="scss">
	.titleHome {
		text-align: center;
		font-family: 'Open Sans Variable', sans-serif;
		font-style: italic;
		text-align: left;
		font-size: 50px;
		margin-bottom: 12px;
		margin-top: 20px;
		-webkit-text-stroke: 1px black;
		color: transparent;
		text-transform: uppercase;
		font-weight: 900;
	}
</style>
