import { prisma } from '$lib/server';

// Fonction de logging locale
function log(level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR', context: string, ...args: unknown[]) {
	const timestamp = new Date().toISOString();
	const prefix = `[${timestamp}] [${level}] [${context}]`;

	switch (level) {
		case 'ERROR':
			console.error(prefix, ...args);
			break;
		case 'WARN':
			console.warn(prefix, ...args);
			break;
		case 'INFO':
			console.info(prefix, ...args);
			break;
		case 'DEBUG':
			console.debug(prefix, ...args);
			break;
	}
}

export const getAllTransactionsDashboard = async () => {
	try {
		// Requête pour obtenir les dates, montants, statuts et utilisateurs des transactions
		const transactions = await prisma.transaction.findMany({
			select: {
				id: true,
				createdAt: true,
				amount: true,
				status: true,
				customer_details_email: true,
				customer_details_name: true,
				products: true,
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

		// Transformer les données pour correspondre au format attendu par le frontend
		const formattedTransactions = transactions.map((transaction) => ({
			...transaction,
			app_user_email: transaction.user?.email,
			app_user_name: transaction.user?.name,
			user: undefined // Supprimer l'objet user original
		}));

		log('DEBUG', 'Transaction', 'Transactions récupérées:', formattedTransactions);
		return formattedTransactions;
	} catch (error) {
		log('ERROR', 'Transaction', 'Erreur lors de la récupération des transactions:', error);
		throw error;
	}
};
