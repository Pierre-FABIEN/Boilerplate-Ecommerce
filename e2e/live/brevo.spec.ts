import nodemailer from 'nodemailer';
import { test, expect } from '../support/fixtures';
import { hasLiveBrevo, hasLiveInbox } from '../support/third-party';
import { sendVerificationEmail } from '../../src/lib/server/smtp-mail';

const LIVE_KEYS = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS'] as const;

function applyLiveSmtp() {
	const previous = Object.fromEntries(LIVE_KEYS.map((key) => [key, process.env[key]]));
	process.env.SMTP_HOST = process.env.SMTP_LIVE_HOST;
	process.env.SMTP_PORT = process.env.SMTP_LIVE_PORT ?? '587';
	process.env.SMTP_USER = process.env.SMTP_LIVE_USER;
	process.env.SMTP_PASS = process.env.SMTP_LIVE_PASS;
	return () => {
		for (const key of LIVE_KEYS) {
			const value = previous[key];
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
	};
}

/**
 * Auth SMTP Brevo réelle. L'envoi vers une boîte contrôlée n'a lieu que si
 * `E2E_LIVE_INBOX` est renseigné : le serveur Vite reste sur le puits local.
 */
test.describe('Live — Brevo SMTP', () => {
	test.setTimeout(2 * 60_000);
	test.skip(!hasLiveBrevo(), 'SMTP_LIVE_* factices : pas d’appel Brevo');

	test('auth SMTP, puis envoi si inbox live', async () => {
		await test.step('1. transporter.verify()', async () => {
			const transporter = nodemailer.createTransport({
				host: process.env.SMTP_LIVE_HOST,
				port: parseInt(process.env.SMTP_LIVE_PORT || '587', 10),
				secure: false,
				auth: {
					user: process.env.SMTP_LIVE_USER,
					pass: process.env.SMTP_LIVE_PASS
				}
			});
			try {
				await expect(transporter.verify()).resolves.toBe(true);
			} catch (error) {
				const detail = error instanceof Error ? error.message : String(error);
				throw new Error(
					`Brevo a refusé l’auth SMTP (${detail}). Un 525 Unauthorized IP : autoriser cette machine dans Brevo → SMTP → IPs autorisées.`
				);
			}
		});

		if (!hasLiveInbox()) return;

		await test.step('2. sendVerificationEmail vers E2E_LIVE_INBOX', async () => {
			const inbox = process.env.E2E_LIVE_INBOX!.trim();
			const restore = applyLiveSmtp();
			try {
				const info = await sendVerificationEmail(inbox, 'E2ELIVE1');
				const accepted = info.accepted.map(String).map((entry) => entry.toLowerCase());
				expect(accepted.some((entry) => entry.includes(inbox.toLowerCase()))).toBe(true);
			} finally {
				restore();
			}
		});
	});
});
