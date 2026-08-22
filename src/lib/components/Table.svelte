<script lang="ts">
	import { Button } from '$shadcn/button';
	import * as Table from '$shadcn/table';
	import TableRow from '$shadcn/table/table-row.svelte';
	import TableCell from '$shadcn/table/table-cell.svelte';
	import { Input } from '$shadcn/input';
	import * as Popover from '$shadcn/popover/index.js';
	import * as RadioGroup from '$shadcn/radio-group/index.js';
	import * as DropdownMenu from '$shadcn/dropdown-menu/index.js';
	import * as AlertDialog from '$shadcn/alert-dialog/index.js';
	import { Label } from '$shadcn/label';
	import * as Tooltip from '$shadcn/tooltip/index.js';

	import ChevronDown from 'lucide-svelte/icons/chevron-down';
	import { Plus } from 'lucide-svelte';

	let { data, columns, name, actions = null, addLink = null } = $props();

	let dialogOpenId = $state<string | null>(null);
	let searchQuery = $state('');
	let currentPage = $state(1);
	let itemsPerPage = $state(5);

	const optionPage = $state([
		{ label: '5', value: 5 },
		{ label: '10', value: 10 },
		{ label: '15', value: 15 },
		{ label: '20', value: 20 }
	]);

	let itemsPerPageString = $state(5);
	let sortColumn = $state('');
	let sortDirection = $state('asc');
	let filteredItems = $state<any[]>([]);
	let paginatedItems = $state<any[]>([]);
	let columnsVisibility = $state(
		columns.reduce((acc, col) => {
			acc[col.key] = true;
			return acc;
		}, {})
	);

	const sortItems = (column: string) => {
		if (sortColumn === column) {
			sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
		} else {
			sortColumn = column;
			sortDirection = 'asc';
		}

		data = data.sort((a: any, b: any) => {
			let aValue = a[column];
			let bValue = b[column];

			if (typeof aValue === 'string') {
				aValue = aValue.toLowerCase();
				bValue = bValue.toLowerCase();
			}

			return (aValue < bValue ? -1 : 1) * (sortDirection === 'asc' ? 1 : -1);
		});

		updateFilteredAndPaginatedItems();
	};

	const updateFilteredAndPaginatedItems = () => {
		filteredItems = data.filter((item: any) =>
			Object.values(item).some((value) =>
				String(value).toLowerCase().includes(searchQuery.toLowerCase())
			)
		);

		const start = (currentPage - 1) * itemsPerPage;
		const end = start + itemsPerPage;
		paginatedItems = filteredItems.slice(start, end);
	};

	// Initialisation
	updateFilteredAndPaginatedItems();

	const changePage = (page: number) => {
		currentPage = page;
		updateFilteredAndPaginatedItems();
	};

	const changeItemsPerPage = (items: number) => {
		itemsPerPage = items;
		currentPage = 1;
		updateFilteredAndPaginatedItems();
	};

	const deleteItem = (id: string) => {
		setTimeout(() => {
			data = data.filter((item: any) => item.id !== id);
			updateFilteredAndPaginatedItems();
			dialogOpenId = null;
		}, 10);
	};

	$effect(() => {
		const newItems = parseInt(itemsPerPageString, 10);
		if (newItems !== itemsPerPage) {
			changeItemsPerPage(newItems);
		}
	});
</script>

<div class="rcs w-[90%]">
	<div class="w-full mt-10">
		<div class="border rounded p-2">
			<h2 class="text-2xl font-bold mb-5">{name}</h2>

			<div class="rcb mb-5 w-full">
				<div class="flex items-center space-x-4">
					<Input
						type="text"
						placeholder="Cherchez dans le tableau"
						class="max-w-xs"
						bind:value={searchQuery}
						oninput={updateFilteredAndPaginatedItems}
					/>

					<Popover.Root>
						<Popover.Trigger class="border rounded px-2 py-1">
							{itemsPerPage}
						</Popover.Trigger>
						<Popover.Content class="p-4 border rounded w-48 bg-white shadow-lg">
							<div class="mb-2 font-medium">nombre d'items :</div>
							<RadioGroup.Root bind:value={itemsPerPageString} class="space-y-2">
								{#each optionPage as option}
									<div class="flex items-center space-x-2">
										<RadioGroup.Item value={String(option.value)} id={'option' + option.value} />
										<Label for={'option' + option.value}>{option.label}</Label>
									</div>
								{/each}
							</RadioGroup.Root>
						</Popover.Content>
					</Popover.Root>

					<DropdownMenu.Root>
						<DropdownMenu.Trigger>
							<Button variant="outline" class="ml-auto">
								Colonnes <ChevronDown class="ml-2 size-4" />
							</Button>
						</DropdownMenu.Trigger>
						<DropdownMenu.Content align="end">
							{#each columns as column (column.key)}
								<DropdownMenu.CheckboxItem
									class="capitalize"
									checked={columnsVisibility[column.key]}
									onCheckedChange={(value) => {
										columnsVisibility = {
											...columnsVisibility,
											[column.key]: value
										};
									}}
								>
									{column.label}
								</DropdownMenu.CheckboxItem>
							{/each}
						</DropdownMenu.Content>
					</DropdownMenu.Root>

					{#if addLink}
						<Button class="ml-auto">
							<a href={addLink}>
								<Plus class="size-4" />
							</a>
						</Button>
					{/if}
				</div>
			</div>

			<div class="border rounded">
				<Table.Root>
					<Table.Header>
						<Table.Row>
							{#each columns.filter((col) => columnsVisibility[col.key]) as column}
								<Table.Head class="border-r border-r-gray-800 pr-2">
									<div class="rcb">
										{column.label}
										<button onclick={() => sortItems(column.key)}>
											<ChevronDown class="cursor-pointer" />
										</button>
									</div>
								</Table.Head>
							{/each}
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each paginatedItems as item (item.id)}
							<TableRow>
								{#each columns.filter((col) => columnsVisibility[col.key]) as column}
									<td class="border border-gray-300 p-2">
										{#if column.key === 'images'}
											{@html item[column.key]}
										{:else if column.formatter}
											<!-- Si la colonne a un formatter, appliquez-le -->
											{column.formatter(item[column.key])}
										{:else}
											<!-- Sinon, affichez la valeur brute -->
											{item[column.key]}
										{/if}
									</td>
								{/each}

								{#if actions && actions.length > 0}
									{#each actions as action}
										<TableCell>
											{#if action.type === 'link'}
												<Tooltip.Provider>
													<Tooltip.Root>
														<Tooltip.Trigger>
															<a href={action.url(item)} class="border rounded p-2">
																{#if action.icon}
																	<action.icon class="h-4 w-4 inline" />
																{/if}
															</a>
														</Tooltip.Trigger>
														<Tooltip.Content>
															<p>{action.name}</p>
														</Tooltip.Content>
													</Tooltip.Root>
												</Tooltip.Provider>
											{:else if action.type === 'form'}
												<AlertDialog.Root
													open={dialogOpenId === item.id}
													onOpenChange={(open) => {
														dialogOpenId = open ? item.id : null;
													}}
												>
													<AlertDialog.Trigger>
														<Button variant="outline" class="m-1 p-1 text-xs">
															{#if action.icon}
																<action.icon class="h-4 w-4 inline" />
															{/if}
														</Button>
													</AlertDialog.Trigger>

													<AlertDialog.Content>
														<AlertDialog.Header>
															<AlertDialog.Title>Are you absolutely sure?</AlertDialog.Title>
															<AlertDialog.Description>
																This action cannot be undone. This will permanently delete the item.
															</AlertDialog.Description>
														</AlertDialog.Header>
														<AlertDialog.Footer>
															<AlertDialog.Cancel onclick={() => (dialogOpenId = null)}
																>Cancel</AlertDialog.Cancel
															>

															<form method="POST" action={action.url} use:action.enhanceAction>
																<input type="hidden" name="id" value={item.id} />
																<AlertDialog.Action
																	type="submit"
																	onclick={() => deleteItem(item.id)}
																>
																	Continue
																</AlertDialog.Action>
															</form>
														</AlertDialog.Footer>
													</AlertDialog.Content>
												</AlertDialog.Root>
											{/if}
										</TableCell>
									{/each}
								{/if}
							</TableRow>
						{/each}
					</Table.Body>
				</Table.Root>
			</div>

			<div class="pagination-controls mt-4 rce">
				{#if currentPage > 1}
					<Button onclick={() => changePage(currentPage - 1)}>Previous</Button>
				{/if}
				<div class="">
					{#each Array(Math.ceil(filteredItems.length / itemsPerPage)) as _, pageIndex}
						<Button class="mx-1" onclick={() => changePage(pageIndex + 1)}>{pageIndex + 1}</Button>
					{/each}
				</div>
				{#if currentPage < Math.ceil(filteredItems.length / itemsPerPage)}
					<Button onclick={() => changePage(currentPage + 1)}>Next</Button>
				{/if}
			</div>
		</div>
	</div>
</div>
