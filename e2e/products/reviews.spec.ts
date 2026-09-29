import { test, expect } from '../support/fixtures';
import { expectMessage, waitForPath } from '../support/flows';
import { pageOrigin, signUpAndVerify } from '../support/admin';
import {
	createCatalogProduct,
	createReview,
	deleteCatalogProduct,
	deleteUser,
	getReviewForUser,
	occupyEmail,
	promoteToAdmin,
	requireUser
} from '../support/db';

/**
 * Avis produit : dépôt public (authentifié, un avis par compte et par
 * produit), affichage sur la fiche, et modération admin (lecture + suppression
 * uniquement — voir `src/routes/admin/products/reviews/+page.server.ts`).
 */
test.describe('Avis produit', () => {
	test.setTimeout(6 * 60_000);

	test('dépôt, doublon refusé, affichage et modération', async ({ page, account }) => {
		const created = await createCatalogProduct();

		try {
			await test.step('1. Anonyme : invité à se connecter, pas de formulaire', async () => {
				await page.goto(`/products/${created.product.slug}`);
				await expect(page.getByText('Connectez-vous').first()).toBeVisible();
				await expect(page.locator('form[action="?/review"]')).toHaveCount(0);
			});

			await test.step('2. Connecté : note et commentaire publiés', async () => {
				await signUpAndVerify(page, account);
				await page.goto(`/products/${created.product.slug}`);

				await page.getByRole('radio', { name: '5 étoiles' }).click();
				await page.locator('textarea[name="comment"]').fill('Très bon produit e2e.');
				await page.getByRole('button', { name: "Publier l'avis" }).click();

				await expectMessage(page, 'Avis publié, merci !');
				await expect(page.getByText('Très bon produit e2e.')).toBeVisible();

				const review = await getReviewForUser(
					created.product.id,
					(await requireUser(account.email)).id
				);
				expect(review?.rating).toBe(5);
			});

			await test.step('3. Un second avis du même compte est refusé', async () => {
				await page.reload();
				await expect(page.getByText('Vous avez déjà noté ce produit — merci !')).toBeVisible();
				await expect(page.locator('form[action="?/review"]')).toHaveCount(0);

				const origin = pageOrigin(page);
				const response = await page.request.post(`/products/${created.product.slug}?/review`, {
					form: { rating: '4', comment: 'Second avis interdit' },
					headers: { Origin: origin, 'x-sveltekit-action': 'true', Accept: 'application/json' }
				});
				// Une requête `enhance` (Accept: application/json) reçoit toujours un
				// HTTP 200 : le vrai statut de `fail()` voyage dans le corps JSON.
				expect(response.status()).toBe(200);
				const body = await response.json();
				expect(body.status).toBe(409);
			});

			await test.step('4. Modération admin : liste puis suppression', async () => {
				await promoteToAdmin(account.email);
				await page.goto('/admin/products/reviews');
				await waitForPath(page, '/admin/products/reviews');
				await expect(page.getByRole('heading', { name: 'Avis produit' })).toBeVisible();
				await expect(page.getByRole('cell', { name: created.product.name })).toBeVisible();

				const row = page.locator('tbody tr', { hasText: created.product.name });
				await row.locator('[data-alert-dialog-trigger]').click();
				await expect(page.getByRole('alertdialog')).toBeVisible();
				await Promise.all([
					page.waitForResponse(
						(response) =>
							response.url().includes('deleteReview') && response.request().method() === 'POST'
					),
					page.getByRole('alertdialog').getByRole('button', { name: 'Supprimer' }).click()
				]);

				const user = await requireUser(account.email);
				expect(await getReviewForUser(created.product.id, user.id)).toBeNull();
			});
		} finally {
			await deleteCatalogProduct(created.product.id);
		}
	});

	test("un CLIENT ne peut pas supprimer l'avis d'un autre depuis l'admin", async ({
		page,
		account
	}) => {
		const created = await createCatalogProduct();
		const authorEmail = `e2e-review-author-${Date.now()}@example.test`;

		await occupyEmail(authorEmail);
		const author = await requireUser(authorEmail);
		const review = await createReview({ productId: created.product.id, userId: author.id });

		try {
			await signUpAndVerify(page, account);
			const origin = pageOrigin(page);
			await page.request.post('/admin/products/reviews?/deleteReview', {
				form: { id: review.id },
				headers: { Origin: origin }
			});
			expect(await getReviewForUser(created.product.id, author.id)).not.toBeNull();
		} finally {
			await deleteCatalogProduct(created.product.id);
			await deleteUser(authorEmail);
		}
	});
});
