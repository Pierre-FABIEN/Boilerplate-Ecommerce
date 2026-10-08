/**
 * Suivi de commande sans compte — `/suivi-commande` (public, non authentifié).
 *
 * COMMERCE-PLUGIN : les deux critères sont requis ensemble (l'email seul
 * permettrait de lister les commandes d'un tiers). L'email est comparé
 * insensible à la casse, le numéro de facture est déjà un identifiant
 * exact généré par l'app (pas de recherche floue).
 */
import { prisma } from '$lib/server';
import { mapTransaction } from '$lib/prisma/transaction/mapTransaction';

export async function getTransactionByInvoiceAndEmail(invoiceNumber: string, email: string) {
	const transaction = await prisma.transaction.findFirst({
		where: {
			invoiceNumber,
			customer_details_email: { equals: email, mode: 'insensitive' }
		}
	});
	return transaction ? mapTransaction(transaction) : transaction;
}
