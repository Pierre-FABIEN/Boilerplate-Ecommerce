<script lang="ts">
	import * as Chart from '$lib/components/shadcn/ui/chart/index.js';
	import { BarChart } from 'layerchart';

	type Point = {
		x: string;
		y: number;
	};

	let {
		data = [],
		title = 'Produits vendus'
	}: {
		data?: Point[];
		title?: string;
	} = $props();

	const points = $derived(
		(Array.isArray(data) ? data : []).map((item) => ({
			product: item.x,
			quantity: Number(item.y) || 0
		}))
	);

	const chartConfig = {
		quantity: {
			label: 'Quantité',
			color: 'var(--chart-3)'
		}
	} satisfies Chart.ChartConfig;
</script>

<div class="flex h-full w-full flex-col">
	{#if title}
		<p class="mb-2 text-center text-sm font-medium">{title}</p>
	{/if}
	{#if points.length === 0}
		<p class="text-muted-foreground m-auto text-sm">Aucune donnée</p>
	{:else}
		<Chart.Container config={chartConfig} class="aspect-auto h-full min-h-[180px] w-full">
			<BarChart
				data={points}
				x="product"
				axis="x"
				bandPadding={0.25}
				series={[
					{
						key: 'quantity',
						label: chartConfig.quantity.label,
						color: chartConfig.quantity.color
					}
				]}
			>
				{#snippet tooltip()}
					<Chart.Tooltip />
				{/snippet}
			</BarChart>
		</Chart.Container>
	{/if}
</div>
