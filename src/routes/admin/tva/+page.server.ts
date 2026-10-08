import { fail, type Actions } from '@sveltejs/kit';
import { superValidate, message } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import type { PageServerLoad } from './$types';
import { assertAdmin, requireAdmin } from '$lib/admin/guards';
import { getVatRate, updateVatRate } from '$lib/server/vat';
import { vatRateSchema } from '$lib/schema/settings/vatSchema';
import { log } from '$lib/server/log';

/**
 * Taux de TVA (`StoreSettings.vatRate`) — voir `RESTE_A_FAIRE.md` :
 * remplace l'ancienne constante figée à 5,5 %, incorrecte pour de la
 * bijouterie (taux normal attendu). Saisi en pourcentage, converti en
 * fraction avant écriture.
 *
 * ADMIN-PLUGIN : page dédiée (déplacée depuis `/admin/settings`) — une
 * saisie fiscale ponctuelle, distincte des interrupteurs de modules.
 */
export const load = (async ({ locals }) => {
	assertAdmin(locals);
	const vatRate = await getVatRate();
	const vatForm = await superValidate({ vatRatePercent: vatRate * 100 }, zod(vatRateSchema), {
		id: 'vatRate'
	});
	return { vatForm };
}) satisfies PageServerLoad;

export const actions: Actions = {
	default: async ({ request, locals }) => {
		requireAdmin(locals);
		const formData = await request.formData();
		const form = await superValidate(formData, zod(vatRateSchema), { id: 'vatRate' });

		if (!form.valid) {
			return fail(400, { vatForm: form });
		}

		try {
			await updateVatRate(form.data.vatRatePercent / 100);
			log('INFO', 'admin-tva', `Taux de TVA mis à jour par ${locals.user.email}`, {
				vatRatePercent: form.data.vatRatePercent
			});
			return message(form, 'Taux de TVA mis à jour');
		} catch (error) {
			console.error('Error updating VAT rate:', error);
			return fail(500, { vatForm: form, message: "La mise à jour n'a pas pu être enregistrée." });
		}
	}
};
