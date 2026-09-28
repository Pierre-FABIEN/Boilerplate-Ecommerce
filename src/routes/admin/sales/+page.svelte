<script lang="ts">
	import Table from '$components/Table.svelte';
	import type { TableItem } from '$components/Table.svelte';
	import { formatDate } from '$lib/utils/formatDate';
	import { formatMoney } from '$lib/utils/formatMoney';
	import FileText from 'lucide-svelte/icons/file-text';
	import Receipt from 'lucide-svelte/icons/receipt';

	let { data } = $props();

	const userColumns = [
		{ key: 'invoiceNumber', label: 'N°', sortable: false },
		{
			key: 'amount',
			label: 'Montant',
			formatter: (value: unknown) => formatMoney(typeof value === 'number' ? value : Number(value))
		},
		{ key: 'customer_details_name', label: 'Nom commande', sortable: false },
		{ key: 'customer_details_email', label: 'Email commande', sortable: false },
		{ key: 'app_user_email', label: 'Email compte', sortable: false },
		{ key: 'app_user_name', label: 'Nom compte', sortable: false },
		{
			key: 'createdAt',
			label: 'Date de création',
			formatter: (value: unknown) => formatDate(String(value))
		},
		{
			key: 'disputeLabel',
			label: 'Litige',
			formatter: (value: unknown) => (typeof value === 'string' ? value : '—'),
			sortable: false
		},
		{ key: 'riskLevel', label: 'Risque', sortable: false }
	];

	const transactionActions = [
		{
			type: 'link' as const,
			name: 'facture',
			url: (item: { id: string }) => `/admin/sales/facture/${item.id}`,
			icon: Receipt,
			condition: (item: TableItem) => Boolean(item.hasFacture)
		},
		{
			type: 'link' as const,
			name: 'bordereau',
			url: (item: { id: string }) => `/admin/sales/bordereau/${item.id}`,
			icon: FileText,
			condition: (item: TableItem) => Boolean(item.hasBordereau)
		}
	];
</script>

<div class="ccc w-[100%]">
	<Table
		name="Ventes"
		columns={userColumns}
		data={data.transactions ?? []}
		actions={transactionActions}
		server={{
			page: data.page,
			perPage: data.perPage,
			total: data.total,
			search: data.search,
			sort: data.sort,
			dir: data.dir
		}}
	/>
</div>
