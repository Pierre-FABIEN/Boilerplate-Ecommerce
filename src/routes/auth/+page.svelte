<script lang="ts">
	import { enhance } from '$app/forms';
	import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '$shadcn/card';
	import { Button } from '$shadcn/button';
	import SEO from '$lib/components/SEO.svelte';

	let { data } = $props();
</script>

<!-- SEO pour la page d'authentification -->
<SEO pageKey="auth" />

<div class="mx-auto mt-12 max-w-md p-4">
	<Card class="shadow-lg rounded-lg">
		<CardHeader>
			<CardTitle class="text-center text-2xl font-semibold">
				👋 Bonjour, {data.user.username} !
			</CardTitle>
		</CardHeader>

		<CardContent class="text-center">
			<p class="text-gray-700 mb-4">Vous êtes connecté(e) avec succès.</p>
		</CardContent>
		<!-- ADMIN-PLUGIN ▼ lien vers le back-office, visible aux seuls administrateurs. -->
		{#if data.user.role === 'ADMIN'}
			<div class="w-full ccc">
				<Button class="m-5" href="/admin">Dashboard</Button>
			</div>
		{/if}
		<!-- ADMIN-PLUGIN ▲ -->

		<div class="w-full ccc">
			<Button class="m-5" href="/auth/settings">Paramètres</Button>
		</div>

		<form method="post" action="?/signout" use:enhance class="text-center">
			<Button type="submit" variant="destructive" class="w-full">Se déconnecter</Button>
		</form>
	</Card>
</div>
