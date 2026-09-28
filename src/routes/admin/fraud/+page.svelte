<script lang="ts">
	import Table from '$components/Table.svelte';
	import { formatDate } from '$lib/utils/formatDate';

	let { data } = $props();

	const columns = [
		{ key: 'createdAt', label: 'Date', formatter: (value: unknown) => formatDate(String(value)) },
		{ key: 'email', label: 'Compte', sortable: false },
		{ key: 'riskLevel', label: 'Risque', sortable: false },
		{ key: 'factorsLabel', label: 'Facteurs déclenchés', sortable: false },
		{ key: 'orderId', label: 'Commande', sortable: false }
	];
</script>

<div class="ccc w-[100%]">
	<Table
		name="Commandes bloquées (détection de fraude)"
		{columns}
		data={data.blocks ?? []}
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
