<script lang="ts">
	import Table from '$components/Table.svelte';
	import { formatDate } from '$lib/utils/formatDate';
	import Mail from 'lucide-svelte/icons/mail';
	import Eye from 'lucide-svelte/icons/eye';

	// CONTACT-PLUGIN : lecture des messages du formulaire public.

	let { data } = $props();

	// Define table columns
	const contactColumns = $state([
		{ key: 'name', label: 'Nom' },
		{ key: 'email', label: 'Email' },
		{ key: 'subject', label: 'Sujet' },
		{ key: 'message', label: 'Message', formatter: (value: string) => value.length > 50 ? value.substring(0, 50) + '...' : value },
		{ key: 'createdAt', label: 'Date de création', formatter: formatDate }
	]);

	// Define actions for each contact submission
	const contactActions = $state([
		{
			type: 'link',
			name: 'voir',
			url: (item: any) => `/admin/contacts/view/${item.id}`,
			icon: Eye,
			condition: () => true // Toujours afficher le lien pour voir les détails
		},
		{
			type: 'link',
			name: 'répondre',
			url: (item: any) => `mailto:${item.email}?subject=Re: ${item.subject}`,
			icon: Mail,
			condition: () => true // Toujours afficher le lien pour répondre
		}
	]);
</script>

<h1 class="m-5 text-4xl">Messages de contact</h1>

<!-- UI Table -->
<div class="ccc w-[100%]">
	<Table
		name="Messages de contact"
		columns={contactColumns}
		data={data.contactSubmissions ?? []}
		actions={contactActions}
	/>
</div> 