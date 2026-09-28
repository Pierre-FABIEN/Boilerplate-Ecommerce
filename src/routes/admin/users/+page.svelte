<script lang="ts">
	import { untrack } from 'svelte';
	import Table from '$components/Table.svelte';
	import type { TableAction, TableColumn } from '$components/Table.svelte';
	import { deleteUserSchema } from '$lib/schema/users/userSchema.js';
	import { zodClient } from 'sveltekit-superforms/adapters';
	import { superForm } from 'sveltekit-superforms';
	import { RETRY_FRIENDLY_FORM } from '$lib/forms/superformOptions';
	import { toast } from 'svelte-sonner';
	import Pencil from 'lucide-svelte/icons/pencil';
	import Trash from 'lucide-svelte/icons/trash';

	// Props
	let { data } = $props();

	// Form handling with superForm
	const deleteUser = superForm(
		untrack(() => data?.IdeleteUserSchema ?? {}),
		{
			validators: zodClient(deleteUserSchema),
			...RETRY_FRIENDLY_FORM
		}
	);

	const { enhance: deleteUserEnhance, message: deleteUserMessage } = deleteUser;

	// Define table columns
	const userColumns = $state<TableColumn[]>([
		{ key: 'name', label: 'Nom', sortable: false },
		{ key: 'email', label: 'Email' },
		{ key: 'role', label: 'Role' }
	]);

	// Define actions with icons
	const userActions = $state<TableAction[]>([
		{
			type: 'link',
			name: 'edit',
			url: (item) => `/admin/users/${item.id}`,
			icon: Pencil
		},
		{
			type: 'form',
			name: 'delete',
			url: '?/deleteUser',
			enhanceAction: deleteUserEnhance,
			icon: Trash
		}
	]);

	// Show toast on delete message
	$effect(() => {
		if ($deleteUserMessage) {
			toast.success($deleteUserMessage);
		}
	});
</script>

<!-- UI Table -->
<div class="ccc w-[100%]">
	<Table
		name="Utilisateurs"
		columns={userColumns}
		data={data.allUsers ?? []}
		actions={userActions}
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
