<script lang="ts">
	import { page } from '$app/stores';
	import SEO from '$lib/components/SEO.svelte';

	// Le statut était codé en dur à « 404 » : une panne serveur s'affichait donc
	// comme une page introuvable, envoyant l'utilisateur chercher une faute
	// d'URL au lieu de réessayer ou de nous contacter.
	const status = $derived($page.status);
	const isNotFound = $derived(status === 404);
	const message = $derived(
		isNotFound
			? "Cette page n'existe pas ou a été déplacée."
			: 'Une erreur est survenue de notre côté. Réessayez dans un instant ; si le problème persiste, contactez-nous.'
	);
</script>

<!-- SEO pour la page d'erreur -->
<SEO pageKey="error" />

<div class="flex items-center justify-center min-h-screen">
	<div class="text-center max-w-md px-4">
		<h1 class="text-6xl font-bold">{status}</h1>
		<p class="mt-2 text-lg text-gray-600 dark:text-gray-300">{message}</p>
		<div class="mt-6 flex flex-wrap items-center justify-center gap-3">
			<a
				href="/"
				class="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring focus:ring-blue-300 dark:focus:ring-blue-800"
			>
				Retour à l'accueil
			</a>
			{#if !isNotFound}
				<a
					href="/contact"
					class="inline-flex items-center px-4 py-2 text-sm font-medium border rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
				>
					Contacter le support
				</a>
			{/if}
		</div>
	</div>
</div>
