<script lang="ts">
	import Table from '$components/Table.svelte';
	import { formatDate } from '$lib/utils/formatDate';
	import { formatMoney } from '$lib/utils/formatMoney';
	import Receipt from 'lucide-svelte/icons/receipt';

	let { data } = $props();

	const userColumns = [
		{
			key: 'amount',
			label: 'Montant',
			formatter: (value: unknown) => formatMoney(typeof value === 'number' ? value : Number(value))
		},
		{ key: 'customer_details_name', label: 'Destinataire' },
		{ key: 'status', label: 'Statut' },
		{ key: 'createdAt', label: 'Date', formatter: formatDate }
	];

	const transactionActions = [
		{
			type: 'link' as const,
			name: 'facture',
			url: (item: { id: string }) => `/auth/settings/factures/${item.id}`,
			icon: Receipt,
			condition: (item: { hasFacture?: boolean }) => Boolean(item.hasFacture)
		}
	];
</script>

<div class="ccc w-[100%]">
	<Table
		name="Factures"
		columns={userColumns}
		data={data.transactions ?? []}
		actions={transactionActions}
	/>
</div>
