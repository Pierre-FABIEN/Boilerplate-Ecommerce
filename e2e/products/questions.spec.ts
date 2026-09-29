import { test, expect } from '../support/fixtures';
import { expectMessage, waitForPath } from '../support/flows';
import { pageOrigin, signUpAndVerify } from '../support/admin';
import {
	createCatalogProduct,
	createProductQuestion,
	deleteCatalogProduct,
	deleteProductQuestion,
	deleteUser,
	getProductQuestionById,
	getStoreFeatureFlags,
	occupyEmail,
	promoteToAdmin,
	requireUser,
	setStoreFeatureFlags
} from '../support/db';

/**
 * Questions & réponses produit : dépôt public (authentifié), invisibilité
 * tant qu'un admin n'a pas répondu, publication de la réponse, et modération
 * (suppression). Distinct des avis (`reviews.spec.ts`) : pas de note, et la
 * question ne s'affiche jamais publiquement avant réponse — voir
 * `src/lib/prisma/productQuestions/productQuestions.ts`.
 */
test.describe('Questions produit', () => {
	test.setTimeout(6 * 60_000);

	test('dépôt, invisible tant que sans réponse, publication et modération', async ({
		page,
		account
	}) => {
		const created = await createCatalogProduct();
		const previousFlags = await getStoreFeatureFlags();

		try {
			await setStoreFeatureFlags({ productQnaEnabled: true });

			await test.step('1. Désactivé globalement : section absente', async () => {
				await setStoreFeatureFlags({ productQnaEnabled: false });
				await page.goto(`/products/${created.product.slug}`);
				await expect(page.getByRole('heading', { name: 'Questions & réponses' })).toHaveCount(0);
				await setStoreFeatureFlags({ productQnaEnabled: true });
			});

			await test.step('2. Anonyme : invité à se connecter, pas de formulaire', async () => {
				await page.goto(`/products/${created.product.slug}`);
				await expect(page.getByRole('heading', { name: 'Questions & réponses' })).toBeVisible();
				await expect(page.getByText('Connectez-vous').last()).toBeVisible();
				await expect(page.locator('form[action="?/askQuestion"]')).toHaveCount(0);
			});

			await test.step('3. Connecté : question envoyée, pas encore publique', async () => {
				await signUpAndVerify(page, account);
				await page.goto(`/products/${created.product.slug}`);

				await page
					.locator('textarea[name="question"]')
					.fill('Cette bague existe-t-elle en taille 54 ?');
				await page.getByRole('button', { name: 'Envoyer la question' }).click();

				await expectMessage(page, 'Question envoyée');
				await expect(page.getByText('Cette bague existe-t-elle en taille 54 ?')).toHaveCount(0);
				await expect(page.getByText('Aucune question répondue pour ce produit.')).toBeVisible();
			});

			await test.step('4. Modération admin : réponse publiée', async () => {
				await promoteToAdmin(account.email);
				await page.goto('/admin/products/questions');
				await waitForPath(page, '/admin/products/questions');
				await expect(page.getByRole('heading', { name: 'Questions produit' })).toBeVisible();
				await expect(page.getByRole('cell', { name: created.product.name })).toBeVisible();

				const row = page.locator('tbody tr', { hasText: created.product.name }).first();
				await row.getByRole('link', { name: 'répondre' }).click();
				await expect(
					page.getByText('Cette bague existe-t-elle en taille 54 ?').first()
				).toBeVisible();

				await page
					.locator('textarea[name="answer"]')
					.fill('Oui, la taille 54 est disponible sur commande.');
				await page.getByRole('button', { name: 'Publier la réponse' }).click();
				await waitForPath(page, '/admin/products/questions');
			});

			await test.step('5. La réponse est maintenant publique', async () => {
				await page.goto(`/products/${created.product.slug}`);
				await expect(page.getByText('Q : Cette bague existe-t-elle en taille 54 ?')).toBeVisible();
				await expect(
					page.getByText('R : Oui, la taille 54 est disponible sur commande.')
				).toBeVisible();
			});

			await test.step('6. Modération admin : suppression', async () => {
				await page.goto('/admin/products/questions');
				const row = page.locator('tbody tr', { hasText: created.product.name });
				await row.locator('[data-alert-dialog-trigger]').click();
				await expect(page.getByRole('alertdialog')).toBeVisible();
				await Promise.all([
					page.waitForResponse(
						(response) =>
							response.url().includes('deleteQuestion') && response.request().method() === 'POST'
					),
					page.getByRole('alertdialog').getByRole('button', { name: 'Supprimer' }).click()
				]);

				await page.goto(`/products/${created.product.slug}`);
				await expect(
					page.getByText('R : Oui, la taille 54 est disponible sur commande.')
				).toHaveCount(0);
			});
		} finally {
			await setStoreFeatureFlags(previousFlags);
			await deleteCatalogProduct(created.product.id);
		}
	});

	test("un CLIENT ne peut pas supprimer la question d'un autre depuis l'admin", async ({
		page,
		account
	}) => {
		const created = await createCatalogProduct();
		const authorEmail = `e2e-question-author-${Date.now()}@example.test`;

		await occupyEmail(authorEmail);
		const author = await requireUser(authorEmail);
		const question = await createProductQuestion(created.product.id, author.id);

		try {
			await signUpAndVerify(page, account);
			const origin = pageOrigin(page);
			await page.request.post('/admin/products/questions?/deleteQuestion', {
				form: { id: question.id },
				headers: { Origin: origin }
			});
			expect(await getProductQuestionById(question.id)).not.toBeNull();
		} finally {
			await deleteProductQuestion(question.id);
			await deleteCatalogProduct(created.product.id);
			await deleteUser(authorEmail);
		}
	});
});
