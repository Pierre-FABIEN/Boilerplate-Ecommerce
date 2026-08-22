import type { Page } from '@playwright/test';

/**
 * Chemins publics du catalogue, pour les tests e2e.
 *
 * Les slugs n'ont pas besoin d'exister : une fiche inconnue doit répondre 404.
 */
export const PRODUCT_PATHS = ['/products'] as const;

/** Tableau Produits (le premier des deux sur `/admin/products`). */
export function productsAdminTable(page: Page) {
	return page.locator('table').first();
}

export function productAdminRow(page: Page, productName: string) {
	return productsAdminTable(page).locator('tbody tr', { hasText: productName });
}
