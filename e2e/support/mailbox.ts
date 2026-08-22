import { expect } from '@playwright/test';
import type { CapturedEmail } from './smtp-sink';

const MAILBOX_URL = `http://127.0.0.1:${process.env.SMTP_HTTP_PORT ?? 2526}/messages`;

/**
 * Décode le corps quoted-printable produit par nodemailer.
 *
 * Les longues lignes HTML sont coupées par des `=` en fin de ligne, et les
 * caractères non ASCII encodés en `=XX` : sans décodage, le code de vérification
 * peut se retrouver scindé en deux.
 */
function decodeQuotedPrintable(body: string): string {
	return body
		.replace(/=\r?\n/g, '')
		.replace(/=([0-9A-F]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

export async function fetchMailbox(): Promise<CapturedEmail[]> {
	const response = await fetch(MAILBOX_URL);
	return (await response.json()) as CapturedEmail[];
}

/** Vide la boîte, à appeler avant une étape qui déclenche un envoi. */
export async function clearMailbox(): Promise<void> {
	await fetch(MAILBOX_URL, { method: 'DELETE' });
}

/**
 * Attend l'arrivée d'un email pour ce destinataire et en extrait le code à
 * 8 caractères, tel qu'il apparaît dans le gabarit (`<p class="code">`).
 *
 * C'est la lecture du message réellement reçu, et non de la base : le parcours
 * testé est donc bien celui d'un utilisateur qui relève sa boîte.
 */
export async function waitForEmailCode(recipient: string, timeout = 30_000): Promise<string> {
	const target = recipient.toLowerCase();

	const findCode = async (): Promise<string | null> => {
		const messages = await fetchMailbox();
		const match = messages
			.filter((message) => message.to.includes(target))
			.sort((a, b) => b.receivedAt - a.receivedAt)
			.map((message) => decodeQuotedPrintable(message.raw))
			.map((body) => body.match(/<p class="code">\s*([A-Z0-9]{8})\s*<\/p>/))
			.find((result): result is RegExpMatchArray => result !== null);
		return match ? match[1] : null;
	};

	await expect
		.poll(findCode, { timeout, message: `Aucun email avec code reçu pour ${recipient}` })
		.not.toBeNull();

	const code = await findCode();
	if (!code) throw new Error(`Aucun email avec code reçu pour ${recipient}`);
	return code;
}
