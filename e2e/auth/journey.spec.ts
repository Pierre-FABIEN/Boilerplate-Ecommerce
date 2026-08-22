import { test, expect } from '../support/fixtures';
import {
	currentPath,
	currentTotpCode,
	expectMessage,
	fillSignupForm,
	logIn,
	sessionCookie,
	setUpTotp,
	signOut,
	submitTotpSetupCode,
	validSetupCode,
	waitForPath,
	waitOutLoginThrottle
} from '../support/flows';
import { clearMailbox, waitForEmailCode } from '../support/mailbox';
import {
	countSessions,
	deleteUser,
	enableMfa,
	occupyEmail,
	requireUser,
	getRecoveryCode
} from '../support/db';

/**
 * Parcours d'authentification complet en une seule session, pour produire une
 * vidéo continue et vérifier l'enchaînement réel des états du compte.
 *
 * Chaque étape est jouée deux fois : d'abord les cas refusés (contraintes de
 * saisie, gardes de route, secrets invalides), puis le cas accepté. Le refus est
 * confirmé par l'interface *et* par l'état en base, pour qu'un message affiché
 * sans effet réel ne puisse pas faire passer un test.
 *
 * Voir `e2e/README.md` pour l'architecture et la marche à suivre.
 */

const FIRST_PASSWORD = 'Sup3rSecret!2026';
const SECOND_PASSWORD = 'M0tDePasseChange!';
const THIRD_PASSWORD = 'Ultim3MotDePasse!';
const WRONG_PASSWORD = 'M4uvaisMotDePasse!';

/** Codes au bon format mais jamais émis par le serveur. */
const WRONG_EMAIL_CODE = 'ZZZZ9999';
const WRONG_TOTP_CODE = '000000';
const WRONG_RECOVERY_CODE = 'ZZZZZZZZZZZZZZZZ';

/** Mots de passe refusés à l'inscription, avec le message attendu. */
const WEAK_PASSWORDS = [
	['Court1!', 'Le mot de passe doit contenir au moins 8 caractères.'],
	['minuscule1!', 'Le mot de passe doit contenir au moins une majuscule.'],
	['MAJUSCULE1!', 'Le mot de passe doit contenir au moins une minuscule.'],
	['SansChiffre!', 'Le mot de passe doit contenir au moins un chiffre.'],
	['SansSpecial1', 'Le mot de passe doit contenir au moins un caractère spécial.']
] as const;

/** Pages protégées et destination attendue pour un visiteur anonyme. */
const GUARDED_PAGES = [
	['/auth/', '/auth/login'],
	['/auth/settings', '/auth/login'],
	['/auth/verify-email', '/auth/login'],
	['/auth/2fa', '/auth/login'],
	['/auth/2fa/setup', '/auth/login'],
	['/auth/recovery-code', '/auth/login'],
	['/auth/reset-password', '/auth/forgot-password'],
	['/auth/reset-password/verify-email', '/auth/forgot-password'],
	['/auth/reset-password/2fa', '/auth/forgot-password']
] as const;

test.describe('Parcours complet', () => {
	// Le scénario enchaîne dix-sept étapes, dont deux configurations TOTP et
	// plusieurs attentes de backoff volontaires.
	test.setTimeout(12 * 60_000);

	test('inscription, vérification, mot de passe, email, réinitialisation puis 2FA', async ({
		page,
		account
	}) => {
		const takenEmail = `e2e-occupe-${Date.now()}@example.test`;
		const newEmail = `e2e-migre-${Date.now()}@example.test`;
		let currentEmail = account.email;
		let recoveryCode = '';

		await test.step('1. Les pages protégées sont fermées aux visiteurs anonymes', async () => {
			for (const [path, destination] of GUARDED_PAGES) {
				await page.goto(path);
				await waitForPath(page, destination);
			}
		});

		await test.step('2. Inscription : les saisies invalides sont refusées', async () => {
			await page.goto('/auth/signup');
			await expect(page.getByRole('heading', { name: 'Créer un compte' })).toBeVisible();

			await fillSignupForm(page, {
				username: 'abc',
				email: account.email,
				password: FIRST_PASSWORD
			});
			await page.getByRole('button', { name: "S'inscrire" }).click();
			await expectMessage(page, "Le nom d'utilisateur doit contenir au moins 4 caractères.");

			// Le champ `type="email"` bloque l'envoi avant même la validation Zod :
			// c'est l'état de validité du champ qui témoigne du refus.
			await page.locator('input[name="email"]').fill('adresse-invalide');
			const emailIsValid = await page
				.locator('input[name="email"]')
				.evaluate((input: HTMLInputElement) => input.checkValidity());
			expect(emailIsValid).toBe(false);

			for (const [password, expectedMessage] of WEAK_PASSWORDS) {
				await fillSignupForm(page, {
					username: account.username,
					email: account.email,
					password
				});
				await page.getByRole('button', { name: "S'inscrire" }).click();
				await expectMessage(page, expectedMessage);
			}

			// Aucune de ces tentatives n'a atteint le serveur.
			expect(currentPath(page)).toBe('/auth/signup');
			expect(await sessionCookie(page)).toBeNull();
		});

		await test.step('3. Inscription : le compte est créé, non vérifié', async () => {
			await clearMailbox();

			await fillSignupForm(page, {
				username: account.username,
				email: account.email,
				password: FIRST_PASSWORD
			});
			await page.getByRole('button', { name: "S'inscrire" }).click();

			await waitForPath(page, '/auth/verify-email');
			expect(await sessionCookie(page)).not.toBeNull();

			const user = await requireUser(currentEmail);
			expect(user.username).toBe(account.username);
			expect(user.emailVerified).toBe(false);
			expect(user.isMfaEnabled).toBe(false);
			expect(user.totpKey).toBeNull();
			// Le mot de passe est haché, jamais stocké tel quel.
			expect(user.passwordHash).toBeTruthy();
			expect(user.passwordHash).not.toContain(FIRST_PASSWORD);
		});

		await test.step("4. Vérification de l'adresse : les codes invalides sont rejetés", async () => {
			await expect(page.getByRole('heading', { name: 'Vérifiez votre adresse email' })).toBeVisible();

			await page.locator('input[name="code"]').fill('123');
			await page.getByRole('button', { name: 'Vérifier' }).click();
			await expectMessage(page, 'Le code doit contenir 8 chiffres.');

			// Format valide mais code inexistant : la requête part, l'adresse reste
			// non vérifiée.
			await page.locator('input[name="code"]').fill(WRONG_EMAIL_CODE);
			await page.getByRole('button', { name: 'Vérifier' }).click();
			await expect(page.getByRole('heading', { name: 'Vérifiez votre adresse email' })).toBeVisible();
			expect((await requireUser(currentEmail)).emailVerified).toBe(false);
		});

		await test.step("5. Vérification de l'adresse : un renvoi invalide le code précédent", async () => {
			const firstCode = await waitForEmailCode(currentEmail);

			await clearMailbox();
			await page.getByRole('button', { name: 'Renvoyer le code' }).click();
			const secondCode = await waitForEmailCode(currentEmail);
			expect(secondCode).not.toBe(firstCode);

			await page.locator('input[name="code"]').fill(firstCode);
			await page.getByRole('button', { name: 'Vérifier' }).click();
			await expect(page.getByRole('heading', { name: 'Vérifiez votre adresse email' })).toBeVisible();
			expect((await requireUser(currentEmail)).emailVerified).toBe(false);

			await page.locator('input[name="code"]').fill(secondCode);
			await page.getByRole('button', { name: 'Vérifier' }).click();

			await waitForPath(page, '/auth');
			await expect(page.getByText(`👋 Bonjour, ${account.username} !`)).toBeVisible();
			expect((await requireUser(currentEmail)).emailVerified).toBe(true);
		});

		await test.step('6. Mot de passe : un mot de passe courant erroné ne change rien', async () => {
			await page.getByRole('link', { name: 'Paramètres' }).click();
			await waitForPath(page, '/auth/settings');

			const passwordHashBefore = (await requireUser(currentEmail)).passwordHash;

			await page.locator('input[name="password"]').fill(FIRST_PASSWORD);
			await page.locator('input[name="new_password"]').fill('court');
			await page.getByRole('button', { name: 'Changer le mot de passe' }).click();
			await expectMessage(page, 'Le nouveau mot de passe doit contenir au moins 8 caractères.');

			await page.locator('input[name="password"]').fill(WRONG_PASSWORD);
			await page.locator('input[name="new_password"]').fill(SECOND_PASSWORD);
			await page.getByRole('button', { name: 'Changer le mot de passe' }).click();
			await expectMessage(page, 'Incorrect password');

			expect((await requireUser(currentEmail)).passwordHash).toBe(passwordHashBefore);
		});

		await test.step('7. Mot de passe : le changement révoque les autres sessions', async () => {
			await page.locator('input[name="password"]').fill(FIRST_PASSWORD);
			await page.locator('input[name="new_password"]').fill(SECOND_PASSWORD);
			await page.getByRole('button', { name: 'Changer le mot de passe' }).click();

			await expectMessage(page, 'Password modified successfully');
			// Les sessions sont invalidées puis une seule est réémise pour l'onglet
			// courant, qui reste connecté.
			expect(await countSessions(currentEmail)).toBe(1);
			expect(await sessionCookie(page)).not.toBeNull();
		});

		await test.step('8. Connexion : les identifiants erronés sont refusés', async () => {
			await signOut(page);
			expect(await sessionCookie(page)).toBeNull();

			await logIn(page, `inconnu-${Date.now()}@example.test`, SECOND_PASSWORD);
			// Message tel qu'il est écrit dans `src/routes/auth/login/+page.server.ts`.
			await expectMessage(page, 'Le compte nexiste pas');
			expect(currentPath(page)).toBe('/auth/login');

			// L'ancien mot de passe ne fonctionne plus : le changement a bien pris.
			await logIn(page, currentEmail, FIRST_PASSWORD);
			await expectMessage(page, 'Invalid password');

			await waitOutLoginThrottle(page, 1);
			await logIn(page, currentEmail, WRONG_PASSWORD);
			await expectMessage(page, 'Invalid password');
			expect(await sessionCookie(page)).toBeNull();
		});

		await test.step('9. Connexion : le nouveau mot de passe est accepté', async () => {
			await waitOutLoginThrottle(page, 2);
			await logIn(page, currentEmail, SECOND_PASSWORD);

			await page.waitForURL((url) => url.pathname === '/');
			expect(await sessionCookie(page)).not.toBeNull();
		});

		await test.step("10. Changement d'email : une adresse déjà prise est refusée", async () => {
			await occupyEmail(takenEmail);

			await page.goto('/auth/settings');
			await page.locator('input[name="email"]').fill(takenEmail);
			await page.getByRole('button', { name: "Mettre à jour l'email" }).click();

			await expectMessage(page, 'This email is already used');
			expect((await requireUser(currentEmail)).email).toBe(currentEmail);

			await deleteUser(takenEmail);
		});

		await test.step("11. Changement d'email : effectif après validation du code", async () => {
			await clearMailbox();

			await page.locator('input[name="email"]').fill(newEmail);
			await page.getByRole('button', { name: "Mettre à jour l'email" }).click();

			await waitForPath(page, '/auth/verify-email');
			await expect(page.getByText(newEmail)).toBeVisible();
			// Tant que le code n'est pas saisi, l'adresse du compte est inchangée.
			expect((await requireUser(currentEmail)).email).toBe(currentEmail);

			// Le code part à la nouvelle adresse : c'est elle qui doit être prouvée.
			const code = await waitForEmailCode(newEmail);
			await page.locator('input[name="code"]').fill(code);
			await page.getByRole('button', { name: 'Vérifier' }).click();

			await waitForPath(page, '/auth');
			currentEmail = newEmail;
			const user = await requireUser(currentEmail);
			expect(user.email).toBe(newEmail);
			expect(user.emailVerified).toBe(true);
		});

		await test.step('12. Mot de passe oublié : demande et code invalides', async () => {
			await clearMailbox();
			await signOut(page);

			await page.getByRole('link', { name: 'Mot de passe oublié ?' }).click();
			await waitForPath(page, '/auth/forgot-password');

			// Une adresse inconnue ne déclenche aucun envoi.
			await page.locator('input[name="email"]').fill(`inconnu-${Date.now()}@example.test`);
			await page.getByRole('button', { name: 'Envoyer' }).click();
			await expectMessage(page, 'Account does not exist');
			expect(currentPath(page)).toBe('/auth/forgot-password');

			await page.locator('input[name="email"]').fill(currentEmail);
			await page.getByRole('button', { name: 'Envoyer' }).click();
			await waitForPath(page, '/auth/reset-password/verify-email');

			await page.locator('input[name="code"]').fill(WRONG_EMAIL_CODE);
			await page.getByRole('button', { name: 'Vérifier' }).click();
			await expectMessage(page, 'Incorrect code');

			// Le formulaire de nouveau mot de passe reste inaccessible avant preuve
			// de l'adresse.
			await page.goto('/auth/reset-password');
			await waitForPath(page, '/auth/reset-password/verify-email');
		});

		await test.step('13. Mot de passe oublié : réinitialisation avec le bon code', async () => {
			const code = await waitForEmailCode(currentEmail);
			await page.locator('input[name="code"]').fill(code);
			await page.getByRole('button', { name: 'Vérifier' }).click();

			// Sans 2FA configurée à ce stade, l'étape du second facteur est sautée.
			await waitForPath(page, '/auth/reset-password');

			await page.locator('input[name="password"]').fill('faible');
			await page.getByRole('button', { name: 'Réinitialiser le mot de passe' }).click();
			await expectMessage(page, 'Le mot de passe doit contenir au moins 8 caractères');
			expect(currentPath(page)).toBe('/auth/reset-password');

			await page.locator('input[name="password"]').fill(THIRD_PASSWORD);
			await page.getByRole('button', { name: 'Réinitialiser le mot de passe' }).click();

			await waitForPath(page, '/auth');
			expect(await countSessions(currentEmail)).toBe(1);
		});

		await test.step('14. 2FA : un code de configuration invalide n’enregistre rien', async () => {
			// Le commutateur d'activation est commenté dans les paramètres : il n'y a
			// pas de chemin par l'interface, le drapeau est donc posé en base.
			await enableMfa(currentEmail);

			await page.goto('/auth/');
			await waitForPath(page, '/auth/2fa/setup');

			await submitTotpSetupCode(page, '123');
			await expectMessage(page, 'Le code doit contenir exactement 6 caractères');

			await submitTotpSetupCode(page, WRONG_TOTP_CODE);
			await expectMessage(page, 'Invalid TOTP code');
			expect((await requireUser(currentEmail)).totpKey).toBeNull();
		});

		await test.step('15. 2FA : configuration acceptée et code de secours délivré', async () => {
			recoveryCode = await setUpTotp(page);
			await expect(page.getByText(recoveryCode)).toBeVisible();
			// Le code affiché est bien celui enregistré, chiffré, pour ce compte.
			expect(await getRecoveryCode(currentEmail)).toBe(recoveryCode);
			expect((await requireUser(currentEmail)).totpKey).not.toBeNull();

			await page.getByRole('button', { name: 'Continuer' }).click();
			await waitForPath(page, '/auth');
		});

		await test.step('16. 2FA : la session reste bridée jusqu’à la saisie du code', async () => {
			await signOut(page);
			await logIn(page, currentEmail, THIRD_PASSWORD);
			await waitForPath(page, '/auth/2fa');

			await page.locator('input[name="code"]').fill(WRONG_TOTP_CODE);
			await page.getByRole('button', { name: 'Verify' }).click();
			await expectMessage(page, 'Invalid TOTP code');

			// Tant que le second facteur n'est pas validé, les pages du compte
			// renvoient vers la vérification.
			await page.goto('/auth/settings');
			await waitForPath(page, '/auth/2fa');

			await page.locator('input[name="code"]').fill(await currentTotpCode(currentEmail));
			await page.getByRole('button', { name: 'Verify' }).click();
			await waitForPath(page, '/auth');
		});

		await test.step('17. Code de secours : refusé s’il est faux, à usage unique sinon', async () => {
			await signOut(page);
			await logIn(page, currentEmail, THIRD_PASSWORD);
			await waitForPath(page, '/auth/2fa');

			await page.getByRole('link', { name: 'Use recovery code instead' }).click();
			await waitForPath(page, '/auth/2fa/reset');

			await page.locator('input[name="code"]').fill('trop-court');
			await page.getByRole('button', { name: 'Vérifier' }).click();
			await expectMessage(page, 'Le code doit contenir 16 chiffres.');

			await page.locator('input[name="code"]').fill(WRONG_RECOVERY_CODE);
			await page.getByRole('button', { name: 'Vérifier' }).click();
			await expectMessage(page, 'Invalid recovery code');
			expect((await requireUser(currentEmail)).totpKey).not.toBeNull();

			await page.locator('input[name="code"]').fill(recoveryCode);
			await page.getByRole('button', { name: 'Vérifier' }).click();

			// La 2FA est retirée : une nouvelle configuration est exigée et le code de
			// secours est remplacé.
			await waitForPath(page, '/auth/2fa/setup');
			expect((await requireUser(currentEmail)).totpKey).toBeNull();
			expect(await getRecoveryCode(currentEmail)).not.toBe(recoveryCode);
		});

		await test.step('18. Reconfiguration de la 2FA puis déconnexion complète', async () => {
			// La clé proposée n'est valable que pour la page affichée : un code calculé
			// sur une clé périmée est refusé.
			const staleCode = await validSetupCode(page);
			await page.reload();
			await submitTotpSetupCode(page, staleCode);
			await expectMessage(page, 'Invalid TOTP code');

			await setUpTotp(page);
			await page.getByRole('button', { name: 'Continuer' }).click();
			await waitForPath(page, '/auth');

			await signOut(page);
			expect(await sessionCookie(page)).toBeNull();
			expect(await countSessions(currentEmail)).toBe(0);

			// La session détruite, l'espace connecté est de nouveau fermé.
			await page.goto('/auth/');
			await waitForPath(page, '/auth/login');
		});

		// L'adresse a changé en cours de route : la fixture ne nettoierait que
		// l'adresse d'origine.
		await deleteUser(currentEmail);
	});
});
