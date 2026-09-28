import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `reportFailedLoginAttempt` doit alerter le compte visé une fois — jamais
 * zéro (attaque ratée en silence), jamais à chaque échec (spam). La
 * décision « alerter ou non » vient entièrement de `reportIfRepeated`
 * (déjà testée pour son comportement de seuil) : ce test vérifie seulement
 * le branchement — un e-mail part quand elle répond `true`, aucun sinon.
 */

const reportIfRepeated = vi.fn();
vi.mock('$lib/server/alerting', () => ({
	reportIfRepeated: (...args: unknown[]) => reportIfRepeated(...args)
}));

const sendMail = vi.fn().mockResolvedValue(undefined);
// `sendMail: (...args) => sendMail(...args)`, pas `{ sendMail }` directement :
// la factory est invoquée dès l'import de `failedLoginAlert.ts`, hoisté avant
// cette déclaration `const` — référencer `sendMail` sans l'envelopper la
// lirait avant son initialisation (TDZ). Même patron que `reportIfRepeated`
// ci-dessus, qui fonctionne parce que l'appel est différé dans une closure.
vi.mock('$lib/server/smtp-mail', () => ({
	sendMail: (...args: unknown[]) => sendMail(...args)
}));

import { reportFailedLoginAttempt } from './failedLoginAlert';

const device = {
	userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0',
	ipAddress: '203.0.113.1',
	city: 'Lyon',
	country: 'FR'
};

beforeEach(() => {
	vi.clearAllMocks();
});

describe('reportFailedLoginAttempt', () => {
	it('sous le seuil (reportIfRepeated répond false) → aucun e-mail', async () => {
		reportIfRepeated.mockResolvedValue(false);

		await reportFailedLoginAttempt('user_1', 'victime@example.test', device);

		expect(reportIfRepeated).toHaveBeenCalledWith(
			'failed-login:user_1',
			expect.objectContaining({ threshold: 3, windowSeconds: 15 * 60 })
		);
		expect(sendMail).not.toHaveBeenCalled();
	});

	it('seuil franchi (reportIfRepeated répond true) → e-mail envoyé au compte visé', async () => {
		reportIfRepeated.mockResolvedValue(true);

		await reportFailedLoginAttempt('user_1', 'victime@example.test', device);
		// `notifyFailedLoginAttempts` est fire-and-forget côté production (jamais
		// bloquant pour la réponse HTTP) : on laisse la microtask se dérouler.
		await new Promise((resolve) => setImmediate(resolve));

		expect(sendMail).toHaveBeenCalledWith(
			expect.objectContaining({
				to: 'victime@example.test',
				subject: expect.stringContaining('tentatives de connexion échouées')
			})
		);
	});

	it('un échec d’envoi ne remonte jamais (avalé, jamais lancé au-dessus)', async () => {
		reportIfRepeated.mockResolvedValue(true);
		sendMail.mockRejectedValueOnce(new Error('SMTP down'));

		await expect(
			reportFailedLoginAttempt('user_1', 'victime@example.test', device)
		).resolves.toBeUndefined();
	});
});
