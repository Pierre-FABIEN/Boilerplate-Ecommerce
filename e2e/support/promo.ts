import type { Page } from '@playwright/test';

/** Tableau Codes promotionnels sur `/admin/promo`. */
export function promoAdminTable(page: Page) {
	return page.locator('table').first();
}

export function promoAdminRow(page: Page, code: string) {
	return promoAdminTable(page).locator('tbody tr', { hasText: code });
}

export async function postValidatePromo(
	page: Page,
	body: { code: string; productTotalTTC: number }
) {
	const response = await page.request.post('/api/promo/validate', { data: body });
	return { status: response.status(), json: await response.json() };
}
