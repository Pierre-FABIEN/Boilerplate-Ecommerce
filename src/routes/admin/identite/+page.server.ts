import { fail, type Actions } from '@sveltejs/kit';
import { superValidate, message } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import type { PageServerLoad } from './$types';
import { assertAdmin, requireAdmin } from '$lib/admin/guards';
import { getCompanyIdentity, updateCompanyIdentity } from '$lib/server/companyIdentity';
import { companyIdentitySchema } from '$lib/schema/settings/companyIdentitySchema';
import { getPublicIdFromUrl } from '$lib/prisma/getPublicIdFromUrl';
import cloudinary from '$lib/server/cloudinary';
import { validateImageUpload } from '$lib/server/imageUpload';
import { log } from '$lib/server/log';

const LOGO_FOLDER = 'identite';

/**
 * Identité de l'entreprise (`StoreSettings.company*`) — voir
 * RESTE_A_FAIRE.md : alimente `/mentions-legales`, le JSON-LD
 * `Organization` (`SEO.svelte`) et les factures/avoirs (texte + logo),
 * remplace les `[À COMPLÉTER]` et les variables d'environnement
 * `INVOICE_COMPANY_*`. Un champ vide reste `null` (pas de valeur inventée).
 *
 * ADMIN-PLUGIN : page dédiée (déplacée depuis `/admin/settings`) — une
 * saisie qui n'a lieu qu'une fois ou rarement, distincte des interrupteurs
 * de modules et des réglages commerciaux modifiés plus souvent.
 */
export const load = (async ({ locals }) => {
	assertAdmin(locals);
	const companyIdentity = await getCompanyIdentity();
	const companyForm = await superValidate(
		{
			name: companyIdentity.name ?? '',
			legalForm: companyIdentity.legalForm ?? '',
			shareCapital: companyIdentity.shareCapital ?? '',
			address: companyIdentity.address ?? '',
			city: companyIdentity.city ?? '',
			siret: companyIdentity.siret ?? '',
			vatNumber: companyIdentity.vatNumber ?? '',
			publicationDirector: companyIdentity.publicationDirector ?? '',
			phone: companyIdentity.phone ?? '',
			email: companyIdentity.email ?? ''
		},
		zod(companyIdentitySchema),
		{ id: 'companyIdentity' }
	);
	return { companyForm, logoUrl: companyIdentity.logoUrl };
}) satisfies PageServerLoad;

export const actions: Actions = {
	default: async ({ request, locals }) => {
		requireAdmin(locals);
		const formData = await request.formData();
		const form = await superValidate(formData, zod(companyIdentitySchema), {
			id: 'companyIdentity'
		});

		if (!form.valid) {
			return fail(400, { companyForm: form });
		}

		const current = await getCompanyIdentity();
		let logoUrl = current.logoUrl;

		const logoFile = formData.get('logo');
		const removeLogo = formData.get('removeLogo') === 'on';

		if (logoFile instanceof File && logoFile.size > 0) {
			const invalid = validateImageUpload(logoFile);
			if (invalid) {
				return fail(400, { companyForm: form, message: invalid });
			}
			try {
				const buffer = await logoFile.arrayBuffer();
				const base64String = Buffer.from(buffer).toString('base64');
				const uploadResponse = await cloudinary.uploader.upload(
					`data:${logoFile.type};base64,${base64String}`,
					{ folder: LOGO_FOLDER }
				);
				logoUrl = uploadResponse.secure_url;
			} catch (error) {
				console.error('Error uploading logo:', error);
				return fail(500, { companyForm: form, message: "L'envoi du logo a échoué." });
			}
		} else if (removeLogo) {
			logoUrl = null;
		}

		// Ancien logo remplacé ou supprimé : nettoyé côté Cloudinary, jamais
		// bloquant (même logique best-effort que l'édition produit).
		if (current.logoUrl && current.logoUrl !== logoUrl) {
			const publicId = getPublicIdFromUrl(current.logoUrl);
			if (publicId) {
				try {
					await cloudinary.uploader.destroy(`${LOGO_FOLDER}/${publicId}`);
				} catch (error) {
					console.error('Error deleting previous logo:', error);
				}
			}
		}

		try {
			const blank = (value: string | undefined) => (value && value.trim() ? value.trim() : null);
			await updateCompanyIdentity({
				name: blank(form.data.name),
				legalForm: blank(form.data.legalForm),
				shareCapital: blank(form.data.shareCapital),
				address: blank(form.data.address),
				city: blank(form.data.city),
				siret: blank(form.data.siret),
				vatNumber: blank(form.data.vatNumber),
				publicationDirector: blank(form.data.publicationDirector),
				phone: blank(form.data.phone),
				email: blank(form.data.email),
				logoUrl
			});
			log(
				'INFO',
				'admin-identite',
				`Identité de l'entreprise mise à jour par ${locals.user.email}`
			);
			return message(form, 'Identité de l’entreprise mise à jour');
		} catch (error) {
			console.error('Error updating company identity:', error);
			return fail(500, {
				companyForm: form,
				message: "La mise à jour n'a pas pu être enregistrée."
			});
		}
	}
};
