import type { Page } from '@playwright/test';

/**
 * Chemins publics du blog, pour les tests e2e.
 *
 * Les slugs n'ont pas besoin d'exister : une fiche inconnue doit répondre 404.
 */
export const BLOG_PATHS = ['/blog'] as const;

/** Tableau Articles (le premier des trois sur `/admin/blog`). */
export function blogAdminTable(page: Page) {
	return page.locator('table').first();
}

export function blogAdminRow(page: Page, title: string) {
	return blogAdminTable(page).locator('tbody tr', { hasText: title });
}
