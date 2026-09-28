import { test, expect } from '../support/fixtures';
import { pageOrigin, signUpAndVerify, sveltekitActionHeaders } from '../support/admin';
import { sessionCookie } from '../support/flows';
import {
	countSessions,
	createExtraSessionForUser,
	deleteUser,
	promoteToAdmin,
	requireUser
} from '../support/db';

/**
 * Sessions actives (`/auth/settings/sessions`) : liste des sessions d'un
 * compte, avec appareil/localisation dérivés de `Session.userAgent`/`city`/
 * `country` (voir `$lib/lucia/deviceLabel.ts`), et deux actions — déconnecter
 * une session précise, déconnecter toutes les autres. La session en cours
 * n'est jamais révocable par ce chemin (`?/revoke` la refuse explicitement),
 * seule `/auth/signout` la ferme.
 *
 * `page.request.post` n'est une lecture fiable du résultat que pour les
 * échecs (`fail()`, sérialisé en 200 + JSON `{type:'failure',...}` — voir
 * `gdpr-data.spec.ts`) ; les succès sont vérifiés par de vraies interactions
 * UI, pas par un parsing du format devalue d'un retour d'action brut.
 */
async function expectFailure(response: import('@playwright/test').APIResponse, status: number) {
	expect(response.status()).toBe(200);
	const body = await response.json();
	expect(body.type).toBe('failure');
	expect(body.status).toBe(status);
	return body.data;
}

test.describe('Auth — sessions actives', () => {
	test.setTimeout(6 * 60_000);

	test('liste, révocation, "autres sessions", IDOR', async ({ page, account }) => {
		try {
			await signUpAndVerify(page, account);
			const user = await requireUser(account.email);
			const origin = pageOrigin(page);

			await createExtraSessionForUser(user.id, {
				userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Firefox/128.0',
				city: 'Lyon',
				country: 'FR'
			});

			await test.step('1. La liste affiche la session en cours et l’autre appareil', async () => {
				await page.goto('/auth/settings/sessions');
				await expect(page.getByText('Session actuelle', { exact: true })).toBeVisible();
				await expect(page.getByText('Firefox sur Windows')).toBeVisible();
				await expect(page.getByText('Lyon, FR', { exact: false })).toBeVisible();
				expect(await countSessions(account.email)).toBe(2);
			});

			await test.step('2. Refus : révoquer la session en cours', async () => {
				const currentSessionId = (await sessionCookie(page))?.value;
				expect(currentSessionId).toBeTruthy();

				const response = await page.request.post('/auth/settings/sessions?/revoke', {
					form: { sessionId: currentSessionId! },
					headers: sveltekitActionHeaders(origin)
				});
				await expectFailure(response, 400);
				expect(await countSessions(account.email)).toBe(2);
			});

			await test.step('3. IDOR : révoquer une session inconnue échoue sans révéler pourquoi', async () => {
				const response = await page.request.post('/auth/settings/sessions?/revoke', {
					form: { sessionId: 'session-appartenant-a-un-autre-compte' },
					headers: sveltekitActionHeaders(origin)
				});
				const data = await expectFailure(response, 404);
				expect(JSON.stringify(data)).not.toContain('appartient');
				expect(await countSessions(account.email)).toBe(2);
			});

			await test.step('4. Déconnecter l’autre appareil (bouton réel)', async () => {
				// `exact: true` : sinon la correspondance par sous-chaîne attrape aussi
				// le bouton « Déconnecter les autres » (visible dès 2 sessions).
				await page.getByRole('button', { name: 'Déconnecter', exact: true }).click();
				await expect(page.getByText('Firefox sur Windows')).not.toBeVisible();
				expect(await countSessions(account.email)).toBe(1);
			});

			await test.step('5. "Déconnecter les autres" ferme tous les autres appareils', async () => {
				await createExtraSessionForUser(user.id, {
					userAgent: 'Mozilla/5.0 (iPhone) Safari/604.1'
				});
				await createExtraSessionForUser(user.id, {
					userAgent: 'Mozilla/5.0 (Linux; Android 10) Chrome/120.0'
				});
				await page.reload();
				expect(await countSessions(account.email)).toBe(3);

				await page.getByRole('button', { name: 'Déconnecter les autres' }).click();
				const dialog = page.getByRole('alertdialog');
				await expect(dialog).toBeVisible();
				await dialog.getByRole('button', { name: 'Déconnecter' }).click();
				// `exact: true` : sinon la description du dialogue ("la session
				// actuelle n'est pas affectée") matche aussi par sous-chaîne
				// insensible à la casse.
				await expect(page.getByText('Session actuelle', { exact: true })).toBeVisible();
				await expect(page.getByText('iPhone', { exact: false })).not.toBeVisible();
				expect(await countSessions(account.email)).toBe(1);
			});

			await test.step('6. Vue admin (lecture seule) : la session courante apparaît', async () => {
				await promoteToAdmin(account.email);
				await page.goto(`/admin/users/${user.id}`);
				await expect(page.getByRole('heading', { name: 'Sessions actives' })).toBeVisible();
				await expect(page.getByText('Aucune session active.')).not.toBeVisible();
				await expect(page.locator('table tbody tr')).toHaveCount(1);
			});
		} finally {
			await deleteUser(account.email);
		}
	});
});
