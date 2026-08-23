<script lang="ts">
	import Table from '$components/Table.svelte';
	import { formatDate } from '$lib/utils/formatDate';
	import { formatMoney } from '$lib/utils/formatMoney';
	import FileText from 'lucide-svelte/icons/file-text';
	import Receipt from 'lucide-svelte/icons/receipt';

	let { data } = $props();

	const userColumns = [
		{ key: 'invoiceNumber', label: 'N°' },
		{
			key: 'amount',
			label: 'Montant',
			formatter: (value: unknown) => formatMoney(typeof value === 'number' ? value : Number(value))
		},
		{ key: 'customer_details_name', label: 'Nom commande' },
		{ key: 'customer_details_email', label: 'Email commande' },
		{ key: 'app_user_email', label: 'Email compte' },
		{ key: 'app_user_name', label: 'Nom compte' },
		{ key: 'createdAt', label: 'Date de création', formatter: formatDate }
	];

	const transactionActions = [
		{
			type: 'link' as const,
			name: 'facture',
			url: (item: { id: string }) => `/admin/sales/facture/${item.id}`,
			icon: Receipt,
			condition: (item: { hasFacture?: boolean }) => Boolean(item.hasFacture)
		},
		{
			type: 'link' as const,
			name: 'bordereau',
			url: (item: { id: string }) => `/admin/sales/bordereau/${item.id}`,
			icon: FileText,
			condition: (item: { hasBordereau?: boolean }) => Boolean(item.hasBordereau)
		}
	];
</script>

<div class="ccc w-[100%]">
	<Table
		name="Ventes"
		columns={userColumns}
		data={data.transactions ?? []}
		actions={transactionActions}
	/>
</div>
