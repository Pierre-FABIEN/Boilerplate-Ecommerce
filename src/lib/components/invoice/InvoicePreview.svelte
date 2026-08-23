<script lang="ts">
	import * as Card from '$shadcn/card';
	import { Button } from '$shadcn/button';
	import { formatMoney } from '$lib/utils/formatMoney';
	import type { InvoiceView } from '$lib/invoice/types';
	import ArrowLeft from 'lucide-svelte/icons/arrow-left';
	import Download from 'lucide-svelte/icons/download';

	let {
		invoice,
		pdfHref,
		backHref,
		backLabel
	}: {
		invoice: InvoiceView;
		pdfHref: string;
		backHref: string;
		backLabel: string;
	} = $props();

	const issuedLabel = $derived(new Date(invoice.issuedAt).toLocaleString('fr-FR'));
	const currency = $derived(invoice.currency);
</script>

<div class="mx-auto w-full max-w-4xl space-y-6 p-6">
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

	<h1 class="text-2xl font-bold">Facture {invoice.id}</h1>
	<p class="text-muted-foreground">Émise le {issuedLabel}</p>

	<div class="grid gap-4 md:grid-cols-2">
		<Card.Root>
			<Card.Header>
				<Card.Title>Émetteur</Card.Title>
			</Card.Header>
			<Card.Content class="space-y-1 text-sm">
				<p class="font-medium">{invoice.company.name}</p>
				<p>{invoice.company.address}</p>
				<p>{invoice.company.city}</p>
				<p>Tél. {invoice.company.phone}</p>
				<p>{invoice.company.email}</p>
				<p>TVA {invoice.company.vat}</p>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Facturé à</Card.Title>
			</Card.Header>
			<Card.Content class="space-y-1 text-sm">
				<p class="font-medium">{invoice.customerName}</p>
				{#each invoice.addressLines as line (line)}
					<p>{line}</p>
				{/each}
				<p>Tél. {invoice.customerPhone}</p>
				<p>{invoice.customerEmail}</p>
			</Card.Content>
		</Card.Root>
	</div>

	<Card.Root>
		<Card.Header>
			<Card.Title>Détail</Card.Title>
		</Card.Header>
		<Card.Content class="overflow-x-auto">
			<table class="w-full text-sm">
				<thead>
					<tr class="border-b text-left">
						<th class="py-2 pr-3">Produit</th>
						<th class="py-2 pr-3">Prix unitaire</th>
						<th class="py-2 pr-3">Quantité</th>
						<th class="py-2 text-right">Total</th>
					</tr>
				</thead>
				<tbody>
					{#if invoice.lines.length === 0}
						<tr>
							<td class="py-3 text-muted-foreground" colspan="4">Aucun article enregistré</td>
						</tr>
					{:else}
						{#each invoice.lines as line (line.name + line.quantity)}
							<tr class="border-b">
								<td class="py-2 pr-3">{line.name}</td>
								<td class="py-2 pr-3">{formatMoney(line.unitPrice, currency)}</td>
								<td class="py-2 pr-3">{line.quantity}</td>
								<td class="py-2 text-right">{formatMoney(line.lineTotal, currency)}</td>
							</tr>
						{/each}
					{/if}
				</tbody>
			</table>

			<dl class="mt-6 ml-auto w-full max-w-xs space-y-2 text-sm">
				<div class="flex justify-between">
					<dt>Sous-total HT</dt>
					<dd>{formatMoney(invoice.subtotalHt, currency)}</dd>
				</div>
				<div class="flex justify-between">
					<dt>TVA ({invoice.taxRate} %)</dt>
					<dd>{formatMoney(invoice.taxAmount, currency)}</dd>
				</div>
				<div class="flex justify-between">
					<dt>Livraison</dt>
					<dd>{formatMoney(invoice.shippingCost, currency)}</dd>
				</div>
				<div class="flex justify-between font-semibold">
					<dt>Total</dt>
					<dd>{formatMoney(invoice.totalTtc, currency)}</dd>
				</div>
			</dl>
		</Card.Content>
	</Card.Root>
</div>
