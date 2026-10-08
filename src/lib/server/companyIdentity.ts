/**
 * Identité de l'entreprise (`StoreSettings.company*`, ligne unique
 * `id = "singleton"`, même ligne que `$lib/server/storeSettings.ts`) —
 * saisie depuis `/admin/identite`, consommée par `/mentions-legales`, le
 * JSON-LD `Organization` (`SEO.svelte`) et les factures/avoirs
 * (`$lib/server/invoice/company.ts`, PDF inclus pour le logo).
 *
 * Chaque champ est `null` tant que l'admin ne l'a pas saisi — aucune
 * valeur inventée à sa place (voir RESTE_A_FAIRE.md).
 *
 * Même cache courte durée que `getVatRate`/`getDeliveryEstimate`.
 */
import { prisma } from '$lib/server';
import { cached, bumpCacheVersion, getCacheVersion } from '$lib/server/cache';

const CACHE_NAMESPACE = 'settings';
const CACHE_TTL_SECONDS = 30;
const SINGLETON_ID = 'singleton';

export type CompanyIdentity = {
	name: string | null;
	legalForm: string | null;
	shareCapital: string | null;
	address: string | null;
	city: string | null;
	siret: string | null;
	vatNumber: string | null;
	publicationDirector: string | null;
	phone: string | null;
	email: string | null;
	/** URL Cloudinary — voir `/admin/identite` (upload), même mécanisme que
	 * les images produit (`cloudinary.uploader.upload`, folder `identite`). */
	logoUrl: string | null;
};

export async function getCompanyIdentity(): Promise<CompanyIdentity> {
	const version = await getCacheVersion(CACHE_NAMESPACE);
	const key = `${CACHE_NAMESPACE}:v${version}:companyIdentity`;
	return cached(key, CACHE_TTL_SECONDS, async () => {
		const row = await prisma.storeSettings.findUnique({
			where: { id: SINGLETON_ID },
			select: {
				companyName: true,
				companyLegalForm: true,
				companyShareCapital: true,
				companyAddress: true,
				companyCity: true,
				companySiret: true,
				companyVatNumber: true,
				companyPublicationDirector: true,
				companyPhone: true,
				companyEmail: true,
				companyLogoUrl: true
			}
		});
		return {
			name: row?.companyName ?? null,
			legalForm: row?.companyLegalForm ?? null,
			shareCapital: row?.companyShareCapital ?? null,
			address: row?.companyAddress ?? null,
			city: row?.companyCity ?? null,
			siret: row?.companySiret ?? null,
			vatNumber: row?.companyVatNumber ?? null,
			publicationDirector: row?.companyPublicationDirector ?? null,
			phone: row?.companyPhone ?? null,
			email: row?.companyEmail ?? null,
			logoUrl: row?.companyLogoUrl ?? null
		};
	});
}

export async function updateCompanyIdentity(identity: CompanyIdentity): Promise<void> {
	await prisma.storeSettings.update({
		where: { id: SINGLETON_ID },
		data: {
			companyName: identity.name,
			companyLegalForm: identity.legalForm,
			companyShareCapital: identity.shareCapital,
			companyAddress: identity.address,
			companyCity: identity.city,
			companySiret: identity.siret,
			companyVatNumber: identity.vatNumber,
			companyPublicationDirector: identity.publicationDirector,
			companyPhone: identity.phone,
			companyEmail: identity.email,
			companyLogoUrl: identity.logoUrl
		}
	});
	await bumpCacheVersion(CACHE_NAMESPACE);
}
