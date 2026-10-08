import type { LayoutServerLoad } from './$types';
import { toPublicCart } from '$lib/commerce/cart';
import { getStoreFeatureFlags } from '$lib/server/storeSettings';
import { getVatRate } from '$lib/server/vat';
import { getCompanyIdentity } from '$lib/server/companyIdentity';

/**
 * Données partagées par toutes les pages.
 *
 * Elles traversent le réseau : n'exposer ici que le strict nécessaire à
 * l'interface (menu compte, garde d'affichage), jamais un secret.
 */
export const load: LayoutServerLoad = async ({ locals }) => {
	// BUNDLE-PLUGIN ▼ le tiroir panier (`Cart.svelte`) affiche ses suggestions
	// partout, donc à même le layout racine plutôt que page par page.
	const { frequentlyBoughtTogetherEnabled } = await getStoreFeatureFlags();
	// BUNDLE-PLUGIN ▲

	// Taux de TVA courant (`StoreSettings.vatRate`, `$lib/server/vat.ts`) —
	// exposé ici pour que les stores panier côté client (`cartStore.ts`,
	// `guestCart.ts`) ne portent plus une constante figée à 5,5 %.
	const vatRate = await getVatRate();

	// Nom affiché dans le pied de page (`Footer.svelte`) et logo utilisé dans
	// le JSON-LD `Organization` (`SEO.svelte`) — priorité à l'identité saisie
	// depuis `/admin/identite`, repli sur le nom de marque en dur tant que
	// rien n'est renseigné (comportement inchangé), jamais de logo inventé.
	const { name: companyName, logoUrl: companyLogoUrl } = await getCompanyIdentity();

	return {
		frequentlyBoughtTogetherEnabled,
		vatRate,
		companyName,
		companyLogoUrl,
		// AUTH-PLUGIN ▼ alimente le menu compte (`Cart.svelte`, `Navigation.svelte`).
		// Projection explicite : `locals.user` porte aussi la clé TOTP chiffrée, qui
		// ne doit jamais quitter le serveur. Toute nouvelle propriété doit être
		// ajoutée ici sciemment.
		user: locals.user
			? {
					id: locals.user.id,
					email: locals.user.email,
					username: locals.user.username,
					name: locals.user.name,
					picture: locals.user.picture,
					role: locals.user.role,
					emailVerified: locals.user.emailVerified,
					isMfaEnabled: locals.user.isMfaEnabled,
					registered2FA: locals.user.registered2FA
				}
			: null,
		// AUTH-PLUGIN ▲

		// COMMERCE-PLUGIN ▼ hydratation du panier client depuis la commande PENDING.
		pendingOrder: locals.pendingOrder ? toPublicCart(locals.pendingOrder) : null
		// COMMERCE-PLUGIN ▲
	};
};
