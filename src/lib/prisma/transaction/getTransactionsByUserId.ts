import { prisma } from '$lib/server';

export const getTransactionsByUserId = async (userId: string) => {
	try {
		// Récupère toutes les transactions d'un utilisateur
		const transactions = await prisma.transaction.findMany({
			where: {
				userId: userId // Filtre par userId au lieu de id
			},
			orderBy: {
				createdAt: 'desc' // Trie les transactions par date (facultatif)
			}
		});

		// console.log(`Transactions for user ${userId}:`, transactions);

		return transactions;
	} catch (error) {
		console.error('Error retrieving transactions: ', error);
		return [];
	}
};
