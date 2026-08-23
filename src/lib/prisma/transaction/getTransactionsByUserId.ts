import { prisma } from '$lib/server';

export const getTransactionsByUserId = async (userId: string) => {
	try {
		// Récupère toutes les transactions d'un utilisateur
		const transactions = await prisma.transaction.findMany({
			where: {
				userId: userId
			},
			include: {
				user: {
					select: {
						email: true,
						name: true
					}
				}
			},
			orderBy: {
				createdAt: 'desc'
			}
		});

		return transactions.map((transaction) => ({
			...transaction,
			app_user_email: transaction.user?.email ?? '',
			app_user_name: transaction.user?.name ?? '',
			hasFacture: transaction.status === 'paid',
			user: undefined
		}));
	} catch (error) {
		console.error('Error retrieving transactions: ', error);
		return [];
	}
};
