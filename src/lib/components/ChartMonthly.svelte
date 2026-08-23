<script lang="ts">
	import * as Chart from '$lib/components/shadcn/ui/chart/index.js';
	import { AreaChart } from 'layerchart';

	type Point = {
		x: number | string;
		y: number;
	};

	let {
		data = [],
		title = 'Cumul mensuel'
	}: {
		data?: Point[];
		title?: string;
	} = $props();

	const points = $derived(
		(Array.isArray(data) ? data : []).map((item) => ({
			day: String(item.x),
			value: Number(item.y) || 0
		}))
	);

	const chartConfig = {
		value: {
			label: 'Cumul',
			color: 'var(--chart-2)'
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
			<AreaChart
				data={points}
				x="day"
				axis="x"
				series={[
					{
						key: 'value',
						label: chartConfig.value.label,
						color: chartConfig.value.color
					}
				]}
			>
				{#snippet tooltip()}
					<Chart.Tooltip />
				{/snippet}
			</AreaChart>
		</Chart.Container>
	{/if}
</div>
