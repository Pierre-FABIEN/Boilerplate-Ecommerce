/**
 * Confirmation par e-mail à chaque changement de mot de passe —
 * `/auth/settings`, action `password`. Jamais bloquant : un échec d'envoi
 * est seulement loggé, même patron que `notifyNewDeviceLogin`
 * (`$lib/server/newDeviceAlert.ts`).
 *
 * Contrairement à l'alerte nouvel appareil, le lien de secours pointe vers
 * la réinitialisation de mot de passe, pas vers `/auth/settings/sessions` :
 * si ce n'était pas l'utilisateur, il ne connaît pas le nouveau mot de
 * passe et ne peut plus se connecter avec l'ancien — se réinitialiser est
 * le seul chemin qui lui reste pour reprendre la main sur le compte.
 */
import { sendMail } from '$lib/server/smtp-mail';
import { log } from '$lib/server/log';
import { resolveAppUrlOrDefault } from '$lib/server/app-url';
import { describeUserAgent } from '$lib/lucia/deviceLabel';
import type { SessionDeviceContext } from '$lib/lucia/deviceContext';

export async function notifyPasswordChanged(email: string, device: SessionDeviceContext) {
	const deviceLabel = describeUserAgent(device.userAgent);
	const location = [device.city, device.country].filter(Boolean).join(', ');
	const when = new Date().toLocaleString('fr-FR');
	const resetUrl = `${resolveAppUrlOrDefault()}/auth/forgot-password`;

	try {
		await sendMail({
			to: email,
			subject: 'Votre mot de passe a été modifié',
			text:
				`Le mot de passe de votre compte vient d'être modifié, depuis ${deviceLabel}` +
				`${location ? ` (${location})` : ''}, le ${when}.\n\n` +
				`Toutes vos autres sessions ont été déconnectées.\n\n` +
				`Si c'est vous, aucune action requise. Sinon, réinitialisez votre mot de passe ` +
				`immédiatement : ${resetUrl}`,
			html: `
				<p>Le mot de passe de votre compte vient d'être modifié.</p>
				<ul>
					<li><strong>Appareil :</strong> ${deviceLabel}</li>
					${location ? `<li><strong>Localisation approximative :</strong> ${location}</li>` : ''}
					<li><strong>Date :</strong> ${when}</li>
				</ul>
				<p>Toutes vos autres sessions ont été déconnectées.</p>
				<p>Si c'est vous, aucune action n'est requise.</p>
				<p>Sinon, <a href="${resetUrl}">réinitialisez votre mot de passe immédiatement</a> — c'est le
				seul moyen de reprendre la main sur le compte si vous n'êtes pas à l'origine de ce
				changement.</p>
			`
		});
	} catch (err) {
		log('ERROR', 'auth:password-changed', 'Échec envoi de la confirmation de mot de passe', {
			email,
			error: err instanceof Error ? err.message : String(err)
		});
	}
}
