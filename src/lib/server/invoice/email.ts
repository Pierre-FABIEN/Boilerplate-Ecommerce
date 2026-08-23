/**
 * Envoi de la facture PDF après paiement.
 *
 * COMMERCE-PLUGIN : un échec SMTP ne doit jamais empêcher le webhook de
 * répondre 200 — la facture existe déjà en base.
 */
import { isDummySecret } from '$lib/server/dummy-secrets';
import { sendMail } from '$lib/server/smtp-mail';
import { formatMoney } from '$lib/utils/formatMoney';
import { renderInvoicePdf } from './pdf';
import { buildInvoiceView, type InvoiceSource } from './view';

export function shouldSendInvoiceEmail(): boolean {
	return !isDummySecret(process.env.SMTP_HOST);
}

export async function sendInvoiceEmail(source: InvoiceSource): Promise<boolean> {
	if (!shouldSendInvoiceEmail()) {
		console.log('📧 Facture : SMTP factice ou absent, e-mail ignoré');
		return false;
	}

	const invoice = buildInvoiceView(source);
	const to = source.customer_details_email?.trim();
	if (!to || to === 'N/A') {
		console.warn('📧 Facture : destinataire manquant, e-mail ignoré');
		return false;
	}

	const pdf = renderInvoicePdf(invoice);
	const total = formatMoney(invoice.totalTtc, invoice.currency);

	await sendMail({
		to,
		subject: `Votre facture ${invoice.id}`,
		text: `Bonjour ${invoice.customerName},\n\nMerci pour votre commande. Votre facture de ${total} est jointe à cet e-mail.\n\n— ${invoice.company.name}`,
		html: `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8" /><title>Facture ${invoice.id}</title></head>
<body style="font-family: Arial, sans-serif; background:#f6f6f6; margin:0; padding:24px;">
  <div style="max-width:600px; margin:0 auto; background:#fff; border-radius:8px; padding:24px;">
    <h1 style="font-size:20px; color:#111;">Votre facture est prête</h1>
    <p>Bonjour ${invoice.customerName},</p>
    <p>Merci pour votre commande. Vous trouverez en pièce jointe la facture <strong>${invoice.id}</strong> d’un montant de <strong>${total}</strong>.</p>
    <p style="color:#666; font-size:14px;">Vous pouvez aussi la télécharger depuis votre espace compte, rubrique Factures.</p>
    <p style="margin-top:24px; color:#999; font-size:13px;">— ${invoice.company.name}</p>
  </div>
</body>
</html>`,
		attachments: [
			{
				filename: invoice.filename,
				content: pdf,
				contentType: 'application/pdf'
			}
		]
	});

	console.log('📧 Facture envoyée à', to);
	return true;
}
