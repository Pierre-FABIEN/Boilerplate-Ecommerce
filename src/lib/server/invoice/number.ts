/**
 * Numéro de facture annuel FAC-AAAA-00001.
 *
 * COMMERCE-PLUGIN : à appeler dans la même transaction Prisma que la
 * création de `Transaction`, pour éviter les trous / doublons.
 */
import type { Prisma } from '@prisma/client';

export function formatInvoiceNumber(year: number, sequence: number): string {
	return `FAC-${year}-${String(sequence).padStart(5, '0')}`;
}

export async function nextInvoiceNumber(tx: Prisma.TransactionClient): Promise<string> {
	const year = new Date().getFullYear();
	const counter = await tx.invoiceCounter.upsert({
		where: { year },
		create: { year, last: 1 },
		update: { last: { increment: 1 } }
	});
	return formatInvoiceNumber(year, counter.last);
}
