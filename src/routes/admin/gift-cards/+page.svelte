<script lang="ts">
	import { untrack } from 'svelte';
	import Table from '$components/Table.svelte';
	import type { TableAction, TableColumn } from '$components/Table.svelte';
	import { zodClient } from 'sveltekit-superforms/adapters';
	import { superForm } from 'sveltekit-superforms';
	import { RETRY_FRIENDLY_FORM } from '$lib/forms/superformOptions';
	import { toast } from 'svelte-sonner';
	import Pencil from 'lucide-svelte/icons/pencil';
	import Trash from 'lucide-svelte/icons/trash';
	import { deleteGiftCardSchema } from '$lib/schema/giftCards/giftCardSchema.js';

	let { data } = $props();

	const deleteGiftCard = superForm(
		untrack(() => data?.IdeleteGiftCardSchema ?? {}),
		{
			validators: zodClient(deleteGiftCardSchema),
			id: 'deleteGiftCard',
			...RETRY_FRIENDLY_FORM
		}
	);

	const { enhance: deleteGiftCardEnhance, message: deleteGiftCardMessage } = deleteGiftCard;

	const formattedGiftCards = $derived.by(() => {
		return (data.giftCards ?? []).map((giftCard) => ({
			...giftCard,
			initialValueLabel: `${giftCard.initialValue.toFixed(2)}€`,
			balanceLabel: `${giftCard.balance.toFixed(2)}€`,
			expiresLabel: giftCard.expiresAt
				? new Date(giftCard.expiresAt).toLocaleDateString('fr-FR')
				: 'Jamais',
			activeLabel: giftCard.active ? 'Active' : 'Inactive',
			recipientLabel: giftCard.recipientEmail || '—'
		}));
	});

	const giftCardColumns = $state<TableColumn[]>([
		{ key: 'code', label: 'Code' },
		{ key: 'initialValueLabel', label: 'Valeur initiale' },
		{ key: 'balanceLabel', label: 'Solde restant' },
		{ key: 'recipientLabel', label: 'Destinataire' },
		{ key: 'expiresLabel', label: 'Expiration' },
		{ key: 'activeLabel', label: 'Statut' }
	]);

	const giftCardActions = $state<TableAction[]>([
		{
			type: 'link',
			name: 'edit',
			url: (item) => `/admin/gift-cards/${item.id}`,
			icon: Pencil
		},
		{
			type: 'form',
			name: 'delete',
			url: '?/deleteGiftCard',
			enhanceAction: deleteGiftCardEnhance,
			icon: Trash
		}
	]);

	$effect(() => {
		if ($deleteGiftCardMessage) {
			toast.success($deleteGiftCardMessage);
		}
	});
</script>

<h1 class="m-5 text-4xl">Cartes cadeaux</h1>

<div class="ccc w-[100%]">
	<Table
		name="Cartes cadeaux"
		columns={giftCardColumns}
		data={formattedGiftCards}
		actions={giftCardActions}
		addLink="/admin/gift-cards/create"
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
