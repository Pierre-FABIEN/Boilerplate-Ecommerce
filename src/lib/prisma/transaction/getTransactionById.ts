/**
 * Lectures Transaction.
 *
 * COMMERCE-PLUGIN : `getTransactionById` est réservé à l'admin.
 * `getTransactionByIdForUser` refuse l'IDOR sur l'espace compte.
 */
import { prisma } from '$lib/server';

export const getTransactionById = async (id: string) => {
	try {
		return await prisma.transaction.findUnique({
			where: { id }
		});
	} catch (error) {
		console.error('Error retrieving transaction: ', error);
	}
};

export const getTransactionByIdForUser = async (id: string, userId: string) => {
	return prisma.transaction.findFirst({
		where: { id, userId }
	});
};
