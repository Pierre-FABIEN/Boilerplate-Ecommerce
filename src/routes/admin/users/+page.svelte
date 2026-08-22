<script lang="ts">
	import Table from '$components/Table.svelte';
	import { deleteUserSchema } from '$lib/schema/users/userSchema.js';
	import { zodClient } from 'sveltekit-superforms/adapters';
	import { superForm } from 'sveltekit-superforms';
	import { toast } from 'svelte-sonner';
	import Pencil from 'lucide-svelte/icons/pencil';
	import Trash from 'lucide-svelte/icons/trash';

	// Props
	let { data } = $props();

	// Form handling with superForm
	const deleteUser = superForm(data?.IdeleteUserSchema ?? {}, {
		validators: zodClient(deleteUserSchema)
	});

	const {
		form: deleteUserData,
		enhance: deleteUserEnhance,
		message: deleteUserMessage
	} = deleteUser;

	// Define table columns
	const userColumns = $state([
		{ key: 'name', label: 'Nom' },
		{ key: 'email', label: 'Email' },
		{ key: 'role', label: 'Role' }
	]);

	// Define actions with icons
	const userActions = $state([
		{
			type: 'link',
			name: 'edit',
			url: (item: any) => `/admin/users/${item.id}`,
			icon: Pencil
		},
		{
			type: 'form',
			name: 'delete',
			url: '?/deleteUser',
			dataForm: deleteUserData.id,
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
	/>
</div>
