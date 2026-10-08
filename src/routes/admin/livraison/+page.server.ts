import { fail, type Actions } from '@sveltejs/kit';
import { superValidate, message } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import type { PageServerLoad } from './$types';
import { assertAdmin, requireAdmin } from '$lib/admin/guards';
import { getDeliveryEstimate, updateDeliveryEstimate } from '$lib/server/delivery';
import { deliveryEstimateSchema } from '$lib/schema/settings/deliverySchema';
import { log } from '$lib/server/log';

/**
 * Délai de livraison estimé (`StoreSettings.estimatedDelivery{Min,Max}Days`)
 * — voir `RESTE_A_FAIRE.md` : affiché au client avant commande
 * (Code conso. L216-1), jamais de date inventée par défaut.
 *
 * ADMIN-PLUGIN : page dédiée (déplacée depuis `/admin/settings`) — une
 * saisie logistique ponctuelle, distincte des interrupteurs de modules.
 */
export const load = (async ({ locals }) => {
	assertAdmin(locals);
	const deliveryEstimate = await getDeliveryEstimate();
	const deliveryForm = await superValidate(
		{ minDays: deliveryEstimate?.minDays, maxDays: deliveryEstimate?.maxDays },
		zod(deliveryEstimateSchema),
		{ id: 'deliveryEstimate' }
	);
	return { deliveryForm };
}) satisfies PageServerLoad;

export const actions: Actions = {
	default: async ({ request, locals }) => {
		requireAdmin(locals);
		const formData = await request.formData();
		const form = await superValidate(formData, zod(deliveryEstimateSchema), {
			id: 'deliveryEstimate'
		});

		if (!form.valid) {
			return fail(400, { deliveryForm: form });
		}

		try {
			const estimate =
				form.data.minDays != null && form.data.maxDays != null
					? { minDays: form.data.minDays, maxDays: form.data.maxDays }
					: null;
			await updateDeliveryEstimate(estimate);
			log('INFO', 'admin-livraison', `Délai de livraison mis à jour par ${locals.user.email}`, {
				estimate
			});
			return message(form, 'Délai de livraison mis à jour');
		} catch (error) {
			console.error('Error updating delivery estimate:', error);
			return fail(500, {
				deliveryForm: form,
				message: "La mise à jour n'a pas pu être enregistrée."
			});
		}
	}
};
