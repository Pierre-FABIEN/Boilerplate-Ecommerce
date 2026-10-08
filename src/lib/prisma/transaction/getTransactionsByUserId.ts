import { prisma } from '$lib/server';
import { normalizeListParams, type ListParams } from '$lib/prisma/pagination';
import { mapTransaction } from '$lib/prisma/transaction/mapTransaction';

const USER_TRANSACTION_SORTABLE = ['amount', 'createdAt', 'status'] as const;

/** Liste paginée pour `/auth/settings/factures` : historique d'achats d'un compte, recherche sur le n° de facture. */
export const getTransactionsByUserId = async (userId: string, params: ListParams = {}) => {
	const { page, perPage, skip, search, sort, dir } = normalizeListParams(params, {
		perPage: 20,
		defaultSort: 'createdAt',
		sortable: USER_TRANSACTION_SORTABLE
	});

	const where = {
		userId,
		...(search ? { invoiceNumber: { contains: search, mode: 'insensitive' as const } } : {})
	};

	try {
		const [rows, total] = await Promise.all([
			prisma.transaction.findMany({
				where,
				include: {
					user: {
						select: {
							email: true,
							name: true
						}
					}
				},
				orderBy: { [sort]: dir },
				skip,
				take: perPage
			}),
			prisma.transaction.count({ where })
		]);

		const items = rows.map((transaction) => ({
			...mapTransaction(transaction),
			app_user_email: transaction.user?.email ?? '',
			app_user_name: transaction.user?.name ?? '',
			hasFacture: transaction.status === 'paid',
			user: undefined
		}));

		return { items, total, page, perPage, search, sort, dir };
	} catch (error) {
		console.error('Error retrieving transactions: ', error);
		return { items: [], total: 0, page, perPage, search, sort, dir };
	}
};
