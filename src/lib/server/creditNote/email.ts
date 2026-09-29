/**
 * Envoi de l'avoir PDF, au moment du remboursement Stripe ou du crédit
 * compte d'un retour (`/admin/returns`).
 *
 * COMMERCE-PLUGIN : best-effort — un échec SMTP ne doit jamais faire échouer
 * l'action admin, le remboursement/crédit est déjà acquis (voir l'appelant).
 */
import { isDummySecret } from '$lib/server/dummy-secrets';
import { log } from '$lib/server/log';
import { sendMail } from '$lib/server/smtp-mail';
import { formatMoney } from '$lib/utils/formatMoney';
import { renderCreditNotePdf } from './pdf';
import type { CreditNoteView } from '$lib/creditNote/types';

export function shouldSendCreditNoteEmail(): boolean {
	return !isDummySecret(process.env.SMTP_HOST);
}

export async function sendCreditNoteEmail(creditNote: CreditNoteView): Promise<boolean> {
	if (!shouldSendCreditNoteEmail()) {
		console.log('📧 Avoir : SMTP factice ou absent, e-mail ignoré');
		return false;
	}

	const to = creditNote.customerEmail?.trim();
	if (!to || to === 'N/A') {
		console.warn('📧 Avoir : destinataire manquant, e-mail ignoré');
		return false;
	}

	const pdf = await renderCreditNotePdf(creditNote);
	const amount = formatMoney(creditNote.amount, creditNote.currency);

	await sendMail({
		to,
		subject: `Votre avoir ${creditNote.number}`,
		text: `Bonjour ${creditNote.customerName},\n\nSuite au traitement de votre retour (${creditNote.reasonLabel}), vous trouverez ci-joint l'avoir ${creditNote.number} d'un montant de ${amount}, relatif à la facture ${creditNote.relatedInvoiceNumber}.\n\n— ${creditNote.company.name}`,
		html: `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8" /><title>Avoir ${creditNote.number}</title></head>
<body style="font-family: Arial, sans-serif; background:#f6f6f6; margin:0; padding:24px;">
  <div style="max-width:600px; margin:0 auto; background:#fff; border-radius:8px; padding:24px;">
    <h1 style="font-size:20px; color:#111;">Votre avoir est prêt</h1>
    <p>Bonjour ${creditNote.customerName},</p>
    <p>Suite au traitement de votre retour (<strong>${creditNote.reasonLabel}</strong>), vous trouverez en pièce jointe l'avoir <strong>${creditNote.number}</strong> d'un montant de <strong>${amount}</strong>, relatif à la facture <strong>${creditNote.relatedInvoiceNumber}</strong>.</p>
    <p style="margin-top:24px; color:#999; font-size:13px;">— ${creditNote.company.name}</p>
  </div>
</body>
</html>`,
		attachments: [
			{
				filename: creditNote.filename,
				content: pdf,
				contentType: 'application/pdf'
			}
		]
	});

	// Même règle que pour les factures : une référence, jamais l'adresse.
	log('INFO', 'creditNote:email', 'Avoir envoyé', { creditNoteNumber: creditNote.number });
	return true;
}
