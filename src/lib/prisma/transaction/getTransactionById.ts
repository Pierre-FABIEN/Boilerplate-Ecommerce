/**
 * Lectures Transaction.
 *
 * COMMERCE-PLUGIN : `getTransactionById` est réservé à l'admin.
 * `getTransactionByIdForUser` refuse l'IDOR sur l'espace compte.
 */
import { prisma } from '$lib/server';
import { mapTransaction } from '$lib/prisma/transaction/mapTransaction';

export const getTransactionById = async (id: string) => {
	try {
		const transaction = await prisma.transaction.findUnique({
			where: { id }
		});
		return transaction ? mapTransaction(transaction) : transaction;
	} catch (error) {
		console.error('Error retrieving transaction: ', error);
	}
};

export const getTransactionByIdForUser = async (id: string, userId: string) => {
	const transaction = await prisma.transaction.findFirst({
		where: { id, userId }
	});
	return transaction ? mapTransaction(transaction) : transaction;
};
