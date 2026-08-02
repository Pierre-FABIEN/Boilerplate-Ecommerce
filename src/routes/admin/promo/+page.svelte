<script lang="ts">
	import Table from '$components/Table.svelte';
	import { zodClient } from 'sveltekit-superforms/adapters';
	import { superForm } from 'sveltekit-superforms';
	import { toast } from 'svelte-sonner';
	import Pencil from 'lucide-svelte/icons/pencil';
	import Trash from 'lucide-svelte/icons/trash';
	import { deletePromoSchema } from '$lib/schema/promo/promoSchema.js';

	let { data } = $props();

	const deletePromo = superForm(data?.IdeletePromoSchema ?? {}, {
		validators: zodClient(deletePromoSchema),
		id: 'deletePromo'
	});

	const { enhance: deletePromoEnhance, message: deletePromoMessage } = deletePromo;

	// Mise en forme des données pour l'affichage dans le tableau
	const formattedPromoCodes = $derived.by(() => {
		return (data.promoCodes ?? []).map((promo) => ({
			...promo,
			typeLabel: promo.type === 'PERCENTAGE' ? 'Pourcentage' : 'Montant fixe',
			valueLabel: promo.type === 'PERCENTAGE' ? `${promo.value}%` : `${promo.value.toFixed(2)}€`,
			minAmountLabel: promo.minAmount != null ? `${promo.minAmount.toFixed(2)}€` : '—',
			usageLabel:
				promo.usageLimit != null ? `${promo.usageCount} / ${promo.usageLimit}` : `${promo.usageCount} / ∞`,
			expiresLabel: promo.expiresAt
				? new Date(promo.expiresAt).toLocaleDateString('fr-FR')
				: 'Jamais',
			activeLabel: promo.active ? 'Actif' : 'Inactif'
		}));
	});

	const PromoColumns = $state([
		{ key: 'code', label: 'Code' },
		{ key: 'typeLabel', label: 'Type' },
		{ key: 'valueLabel', label: 'Valeur' },
		{ key: 'minAmountLabel', label: 'Montant min.' },
		{ key: 'usageLabel', label: 'Utilisations' },
		{ key: 'expiresLabel', label: 'Expiration' },
		{ key: 'activeLabel', label: 'Statut' }
	]);

	const PromoActions = $state([
		{
			type: 'link',
			name: 'edit',
			url: (item: any) => `/admin/promo/${item.id}`,
			icon: Pencil
		},
		{
			type: 'form',
			name: 'delete',
			url: '?/deletePromo',
			enhanceAction: deletePromoEnhance,
			icon: Trash
		}
	]);

	$effect(() => {
		if ($deletePromoMessage) {
			toast.success($deletePromoMessage);
		}
	});
</script>

<h1 class="m-5 text-4xl">Gestion des codes promo</h1>

<div class="ccc w-[100%]">
	<Table
		name="Codes promotionnels"
		columns={PromoColumns}
		data={formattedPromoCodes}
		actions={PromoActions}
		addLink="/admin/promo/create"
	/>
</div>
