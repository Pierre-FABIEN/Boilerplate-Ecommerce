import { test, expect } from '../support/fixtures';
import { waitForPath } from '../support/flows';
import { signUpAndVerify } from '../support/admin';
import { contactAdminRow } from '../support/contact';
import {
	createContactMessage,
	deleteContactMessage,
	promoteToAdmin
} from '../support/db';

/**
 * Lecture admin des messages de contact. Pas de suppression UI.
 */
test.describe('Administration — contacts', () => {
	test.setTimeout(6 * 60_000);

	test('liste et fiche', async ({ page, account }) => {
		const created = await createContactMessage();

		try {
			await signUpAndVerify(page, account);
			await promoteToAdmin(account.email);

			await test.step('1. La liste admin affiche les messages', async () => {
				await page.goto('/admin/contacts', { waitUntil: 'domcontentloaded' });
				await waitForPath(page, '/admin/contacts');
				await expect(
					page.getByRole('heading', { name: 'Messages de contact', level: 1 })
				).toBeVisible({ timeout: 60_000 });
				const search = page.getByPlaceholder('Cherchez dans le tableau').first();
				await search.fill(created.email);
				await expect(contactAdminRow(page, created.email)).toBeVisible();
			});

			await test.step('2. La fiche affiche le message', async () => {
				await page.goto(`/admin/contacts/view/${created.id}`);
				await expect(page.getByRole('heading', { name: 'Détails du message' })).toBeVisible();
				await expect(page.getByText(created.name, { exact: true })).toBeVisible();
				await expect(page.getByText(created.subject, { exact: true })).toBeVisible();
				await expect(page.getByText(created.message)).toBeVisible();
			});
		} finally {
			await deleteContactMessage(created.id);
		}
	});

	test('un CLIENT est renvoyé à l’accueil', async ({ page, account }) => {
		await signUpAndVerify(page, account);
		await page.goto('/admin/contacts');
		await waitForPath(page, '/');
	});
});
