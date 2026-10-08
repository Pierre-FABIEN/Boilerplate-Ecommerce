/** COMMERCE-PLUGIN : liste paginée pour `/admin/sales`. */
import { prisma } from '$lib/server';
import { normalizeListParams, type ListParams } from '$lib/prisma/pagination';
import { formatDisputeStatus } from '$lib/server/dispute';
import { formatRiskLevel } from '$lib/server/fraud';
import { mapTransaction } from '$lib/prisma/transaction/mapTransaction';

const TRANSACTION_SORTABLE = ['amount', 'createdAt', 'status'] as const;

/** Recherche sur n° de facture, nom/email de commande, et email/nom du compte. */
export const getAllTransactions = async (params: ListParams = {}) => {
	const { page, perPage, skip, search, sort, dir } = normalizeListParams(params, {
		perPage: 20,
		defaultSort: 'createdAt',
		sortable: TRANSACTION_SORTABLE
	});

	const where = search
		? {
				OR: [
					{ invoiceNumber: { contains: search, mode: 'insensitive' as const } },
					{ customer_details_name: { contains: search, mode: 'insensitive' as const } },
					{ customer_details_email: { contains: search, mode: 'insensitive' as const } },
					{ user: { email: { contains: search, mode: 'insensitive' as const } } },
					{ user: { name: { contains: search, mode: 'insensitive' as const } } }
				]
			}
		: undefined;

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
				orderBy: sort === 'createdAt' ? { createdAt: dir } : { [sort]: dir },
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
			hasBordereau: transaction.status === 'paid',
			disputeLabel: transaction.disputeStatus
				? formatDisputeStatus(transaction.disputeStatus)
				: null,
			riskLabel: transaction.riskLevel
				? `${formatRiskLevel(transaction.riskLevel)} (${transaction.riskScore ?? '?'})`
				: null,
			riskBadgeVariant:
				transaction.riskLevel === 'high'
					? ('destructive' as const)
					: transaction.riskLevel === 'medium'
						? ('outline' as const)
						: ('secondary' as const),
			user: undefined
		}));

		return { items, total, page, perPage, search, sort, dir };
	} catch (error) {
		console.error('Error retrieving transactions: ', error);
		return { items: [], total: 0, page, perPage, search, sort, dir };
	}
};
