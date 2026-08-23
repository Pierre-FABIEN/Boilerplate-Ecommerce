import type { Page } from '@playwright/test';

/** Tableau Messages de contact sur `/admin/contacts`. */
export function contactAdminTable(page: Page) {
	return page.locator('table').first();
}

export function contactAdminRow(page: Page, text: string) {
	return contactAdminTable(page).locator('tbody tr', { hasText: text });
}
