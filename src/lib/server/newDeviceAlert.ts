/**
 * Alerte « nouvelle connexion détectée » — envoyée uniquement quand
 * `recordLoginEvent` (`$lib/prisma/loginEvent/loginEvent.ts`) signale un
 * appareil jamais vu pour ce compte. Jamais bloquant pour la connexion : un
 * échec d'envoi est seulement loggé, même patron que `notifyDispute`
 * (`$lib/server/disputeAlert.ts`) — un e-mail de sécurité qui échoue ne doit
 * pas empêcher l'utilisateur de se connecter.
 */
import { sendMail } from '$lib/server/smtp-mail';
import { log } from '$lib/server/log';
import { resolveAppUrlOrDefault } from '$lib/server/app-url';
import { describeUserAgent } from '$lib/lucia/deviceLabel';
import { createSessionRevokeToken } from '$lib/prisma/sessionRevokeToken/sessionRevokeToken';
import type { SessionDeviceContext } from '$lib/lucia/deviceContext';

export async function notifyNewDeviceLogin(
	email: string,
	userId: string,
	sessionId: string,
	device: SessionDeviceContext
) {
	const deviceLabel = describeUserAgent(device.userAgent);
	const location = [device.city, device.country].filter(Boolean).join(', ');
	const when = new Date().toLocaleString('fr-FR');
	const sessionsUrl = `${resolveAppUrlOrDefault()}/auth/settings/sessions`;

	// Jamais le `sessionId` brut dans l'e-mail (c'est un identifiant porteur,
	// équivalent au cookie de session) — un jeton dédié, à usage unique,
	// limité à la seule action de révocation, voir `SessionRevokeToken`.
	const revokeToken = await createSessionRevokeToken(userId, sessionId);
	const notMeUrl = `${resolveAppUrlOrDefault()}/auth/not-me/${revokeToken}`;

	const details = [
		`Appareil : ${deviceLabel}`,
		location ? `Localisation approximative : ${location}` : null,
		`Date : ${when}`
	]
		.filter(Boolean)
		.join('\n');

	try {
		await sendMail({
			to: email,
			subject: 'Nouvelle connexion détectée sur votre compte',
			text:
				`Une connexion vient d'avoir lieu depuis un appareil que nous ne reconnaissons pas.\n\n${details}\n\n` +
				`Si c'est vous, aucune action requise.\n\n` +
				`Sinon : ${notMeUrl} (déconnecte cette session en un clic, sans avoir besoin de vous connecter) ` +
				`— pensez aussi à changer votre mot de passe : ${sessionsUrl}`,
			html: `
				<p>Une connexion vient d'avoir lieu depuis un appareil que nous ne reconnaissons pas.</p>
				<ul>
					<li><strong>Appareil :</strong> ${deviceLabel}</li>
					${location ? `<li><strong>Localisation approximative :</strong> ${location}</li>` : ''}
					<li><strong>Date :</strong> ${when}</li>
				</ul>
				<p>Si c'est vous, aucune action n'est requise.</p>
				<p>Sinon, <a href="${notMeUrl}"><strong>ce n'était pas moi</strong></a> — déconnecte cette
				session immédiatement, sans avoir besoin de vous connecter. Pensez aussi à
				<a href="${sessionsUrl}">changer votre mot de passe</a>.</p>
			`
		});
	} catch (err) {
		log('ERROR', 'auth:new-device', "Échec envoi de l'alerte nouvelle connexion", {
			email,
			error: err instanceof Error ? err.message : String(err)
		});
	}
}
