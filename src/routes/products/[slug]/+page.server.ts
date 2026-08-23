import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getProductBySlug } from '$lib/products/catalog';

/**
 * Fiche produit publique.
 *
 * PRODUCT-PLUGIN : 404 si le slug n'existe pas.
 * COMMERCE-PLUGIN : le bouton « Ajouter au panier » est sur la page cliente.
 */
export const load: PageServerLoad = async ({ params }) => {
	const product = await getProductBySlug(params.slug);
	if (!product) {
		error(404, 'Produit introuvable');
	}

	return { product };
};
