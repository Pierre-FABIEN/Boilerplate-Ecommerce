/** COMMERCE-PLUGIN : liste pour `/admin/sales`. */
import { prisma } from '$lib/server';

export const getAllTransactions = async () => {
	try {
		const transactions = await prisma.transaction.findMany({
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
			hasBordereau: transaction.status === 'paid',
			user: undefined
		}));
	} catch (error) {
		console.error('Error retrieving transactions: ', error);
		return [];
	}
};
