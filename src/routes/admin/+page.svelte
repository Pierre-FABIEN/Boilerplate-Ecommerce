<script lang="ts">
	import Chart from '$lib/components/Chart.svelte';
	import ChartMonthly from '$lib/components/ChartMonthly.svelte';
	import ChartBar from '$lib/components/ChartBar.svelte';
	import LastInscriptions from '$lib/components/LastInscriptions.svelte';
	import SEO from '$lib/components/SEO.svelte';

	let { data } = $props();

	const transactions = $derived(Array.isArray(data.transactions) ? data.transactions : []);

	const transactionPoints = $derived(
		[...transactions]
			.sort(
				(a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
			)
			.map((tx) => ({
				label: tx.createdAt
					? new Date(tx.createdAt).toLocaleDateString('fr-FR')
					: '—',
				value: tx.amount ?? 0
			}))
	);

	const monthlyData = $derived.by(() => {
		if (transactions.length === 0) return [];

		const latestTx = [...transactions].sort(
			(a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
		)[transactions.length - 1];
		const firstTxDate = new Date(latestTx.createdAt);
		const year = firstTxDate.getFullYear();
		const month = firstTxDate.getMonth();
		const daysInMonth = new Date(year, month + 1, 0).getDate();
		const dailySums = new Array(daysInMonth).fill(0);

		for (const tx of transactions) {
			const d = new Date(tx.createdAt);
			if (d.getFullYear() !== year || d.getMonth() !== month) continue;
			dailySums[d.getDate() - 1] += tx.amount ?? 0;
		}

		for (let i = 1; i < daysInMonth; i++) {
			dailySums[i] += dailySums[i - 1];
		}

		return dailySums.map((sum, idx) => ({
			x: idx + 1,
			y: sum
		}));
	});

	const productSalesData = $derived.by(() => {
		const productSales: Record<string, number> = {};

		for (const tx of transactions) {
			if (!Array.isArray(tx.products)) continue;
			for (const product of tx.products) {
				const productName = product?.name as string;
				if (!productName) continue;
				const productQuantity = product?.quantity || 0;
				productSales[productName] = (productSales[productName] ?? 0) + productQuantity;
			}
		}

		return Object.entries(productSales).map(([key, value]) => ({
			x: key,
			y: value
		}));
	});
</script>

<SEO pageKey="admin" />

<div class="csc m-5">
	<h1 class="mb-4 text-2xl font-bold">Accueil</h1>

	<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
		<div class="aspect-video rounded border p-5">
			<Chart
				data={transactionPoints}
				title="Transactions"
				valueLabel="Montant"
			/>
		</div>

		<div class="aspect-video rounded border p-5">
			<ChartMonthly data={monthlyData} title="Cumul mensuel des commandes" />
		</div>

		<LastInscriptions users={data.latestUsersFetch} />

		<div class="aspect-video rounded border p-5">
			<ChartBar data={productSalesData} title="Produits vendus" />
		</div>
	</div>
</div>
