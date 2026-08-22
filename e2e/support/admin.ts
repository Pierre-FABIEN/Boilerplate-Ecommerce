import type { Page } from '@playwright/test';
import { fillSignupForm, submitCode, waitForPath } from './flows';
import { clearMailbox, waitForEmailCode } from './mailbox';
import type { Account } from './account';

/**
 * Routes du back-office à fermer aux non-administrateurs.
 *
 * Les identifiants `[id]` n'ont pas besoin d'exister : la garde du hook s'applique
 * avant le `load` de la page, donc avant un 404.
 */
export const ADMIN_PATHS = [
	'/admin',
	'/admin/sales',
	'/admin/sales/facture/placeholder',
	'/admin/sales/bordereau/placeholder',
	'/admin/users',
	'/admin/users/placeholder',
	'/admin/products',
	'/admin/products/create',
	'/admin/products/placeholder',
	'/admin/products/categories/create',
	'/admin/products/categories/placeholder',
	'/admin/blog',
	'/admin/blog/post/create',
	'/admin/blog/post/placeholder',
	'/admin/blog/categories',
	'/admin/blog/categories/create',
	'/admin/blog/categories/placeholder',
	'/admin/blog/tags',
	'/admin/blog/tags/create',
	'/admin/blog/tags/placeholder',
	'/admin/promo',
	'/admin/promo/create',
	'/admin/promo/placeholder',
	'/admin/contacts',
	'/admin/contacts/view/placeholder'
] as const;

/** Inscrit le compte, confirme l'adresse, et s'arrête sur l'espace connecté. */
export async function signUpAndVerify(page: Page, account: Account) {
	await page.goto('/auth/signup');
	await clearMailbox();
	await fillSignupForm(page, {
		username: account.username,
		email: account.email,
		password: account.password
	});
	await page.getByRole('button', { name: "S'inscrire" }).click();
	await waitForPath(page, '/auth/verify-email');

	const code = await waitForEmailCode(account.email);
	await submitCode(page, code);
	await waitForPath(page, '/auth');
}

/** Origine courante, pour les POST same-origin (contrôle CSRF de SvelteKit). */
export function pageOrigin(page: Page): string {
	return new URL(page.url()).origin;
}
