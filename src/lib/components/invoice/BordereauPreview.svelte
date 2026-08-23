<script lang="ts">
	import * as Card from '$shadcn/card';
	import { Button } from '$shadcn/button';
	import type { BordereauView } from '$lib/invoice/types';
	import ArrowLeft from 'lucide-svelte/icons/arrow-left';
	import Download from 'lucide-svelte/icons/download';

	let {
		bordereau,
		pdfHref,
		backHref,
		backLabel
	}: {
		bordereau: BordereauView;
		pdfHref: string;
		backHref: string;
		backLabel: string;
	} = $props();

	const issuedLabel = $derived(new Date(bordereau.issuedAt).toLocaleString('fr-FR'));
</script>

<div class="mx-auto w-full max-w-3xl space-y-6 p-6">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<Button variant="outline" href={backHref}>
			<ArrowLeft class="mr-2 size-4" />
			{backLabel}
		</Button>
		<Button href={pdfHref}>
			<Download class="mr-2 size-4" />
			Télécharger le PDF
		</Button>
	</div>

	<h1 class="text-2xl font-bold">Bordereau {bordereau.id}</h1>
	<p class="text-muted-foreground">Créé le {issuedLabel} · {bordereau.amountLabel}</p>

	<Card.Root>
		<Card.Header>
			<Card.Title>Adresse de livraison</Card.Title>
		</Card.Header>
		<Card.Content class="space-y-1 text-sm">
			<p class="font-medium">{bordereau.customerName}</p>
			{#each bordereau.addressLines as line (line)}
				<p>{line}</p>
			{/each}
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>Colis</Card.Title>
		</Card.Header>
		<Card.Content>
			<ul class="space-y-2 text-sm">
				{#if bordereau.productLines.length === 0}
					<li class="text-muted-foreground">Aucun article enregistré</li>
				{:else}
					{#each bordereau.productLines as line (line.name)}
						<li>{line.name} × {line.quantity}</li>
					{/each}
				{/if}
			</ul>
		</Card.Content>
	</Card.Root>
</div>
