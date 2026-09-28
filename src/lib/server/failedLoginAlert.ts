/**
 * Alerte « plusieurs tentatives de connexion échouées » — signale au
 * titulaire du compte une possible attaque par force brute/bourrage
 * d'identifiants ciblant spécifiquement son compte. Jamais à chaque échec
 * (bruyant, et le `Throttler` — `$lib/server/rate-limit.ts` — ralentit déjà
 * l'attaquant) : une seule alerte par fenêtre, via `reportIfRepeated`
 * (même primitive que les alertes internes 5xx/contention de verrou, mais
 * ici doublée d'un e-mail au compte visé, pas seulement Sentry).
 *
 * Jamais appelée pour un e-mail inconnu (voir `login/+page.server.ts`) :
 * décompter les échecs sur un compte qui n'existe pas révélerait, par la
 * simple absence d'alerte, quelles adresses sont inscrites — même principe
 * que le message d'erreur générique déjà en place.
 */
import { reportIfRepeated } from '$lib/server/alerting';
import { sendMail } from '$lib/server/smtp-mail';
import { log } from '$lib/server/log';
import { resolveAppUrlOrDefault } from '$lib/server/app-url';
import { describeUserAgent } from '$lib/lucia/deviceLabel';
import type { SessionDeviceContext } from '$lib/lucia/deviceContext';

const THRESHOLD = 3;
const WINDOW_SECONDS = 15 * 60;

/**
 * À appeler à chaque mot de passe refusé sur un compte identifié. Compte et
 * alerte au 3ᵉ échec dans une fenêtre de 15 minutes, jamais aux échecs
 * suivants de la même fenêtre — un nouveau cycle de 3 pourra réalerter à la
 * fenêtre d'après si les échecs persistent.
 */
export async function reportFailedLoginAttempt(
	userId: string,
	email: string,
	device: SessionDeviceContext
) {
	const shouldAlert = await reportIfRepeated(`failed-login:${userId}`, {
		threshold: THRESHOLD,
		windowSeconds: WINDOW_SECONDS,
		message: `Tentatives de connexion échouées répétées pour ${email}`
	});
	if (shouldAlert) {
		void notifyFailedLoginAttempts(email, device);
	}
}

async function notifyFailedLoginAttempts(email: string, device: SessionDeviceContext) {
	const deviceLabel = describeUserAgent(device.userAgent);
	const location = [device.city, device.country].filter(Boolean).join(', ');
	const settingsUrl = `${resolveAppUrlOrDefault()}/auth/settings`;

	try {
		await sendMail({
			to: email,
			subject: 'Plusieurs tentatives de connexion échouées sur votre compte',
			text:
				`Plusieurs mots de passe incorrects viennent d'être essayés sur votre compte, ` +
				`depuis ${deviceLabel}${location ? ` (${location})` : ''}.\n\n` +
				`Si c'est vous qui avez oublié votre mot de passe, aucune action requise au-delà ` +
				`d'une réinitialisation si besoin.\n\n` +
				`Sinon, vérifiez vos paramètres de sécurité : ${settingsUrl}`,
			html: `
				<p>Plusieurs mots de passe incorrects viennent d'être essayés sur votre compte.</p>
				<ul>
					<li><strong>Appareil :</strong> ${deviceLabel}</li>
					${location ? `<li><strong>Localisation approximative :</strong> ${location}</li>` : ''}
				</ul>
				<p>Si c'est vous qui avez oublié votre mot de passe, aucune action n'est requise au-delà
				d'une réinitialisation si besoin.</p>
				<p>Sinon, vérifiez <a href="${settingsUrl}">vos paramètres de sécurité</a> — envisagez
				d'activer la double authentification si ce n'est pas déjà fait.</p>
			`
		});
	} catch (err) {
		log('ERROR', 'auth:failed-login', "Échec envoi de l'alerte tentatives échouées", {
			email,
			error: err instanceof Error ? err.message : String(err)
		});
	}
}
