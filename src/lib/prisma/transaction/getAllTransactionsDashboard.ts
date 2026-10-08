import { prisma } from '$lib/server';
import { toNumber } from '$lib/server/decimal';

/** Fenêtre du dashboard : les 3 graphiques (timeline, cumul du mois, top produits)
 * ne regardent jamais plus loin qu'un an en arrière. Sans cette borne, la requête
 * et le payload envoyé au navigateur grossissent indéfiniment avec l'historique
 * de vente — même classe de problème que la pagination des listes admin, mais
 * sur ce chemin de code spécifique au dashboard. */
const DASHBOARD_WINDOW_MONTHS = 12;
/** Filet de sécurité si le volume dans la fenêtre dépasse ce qu'un dashboard doit afficher. */
const DASHBOARD_MAX_ROWS = 5000;

export const getAllTransactionsDashboard = async () => {
	const since = new Date();
	since.setMonth(since.getMonth() - DASHBOARD_WINDOW_MONTHS);

	try {
		// Seuls `createdAt`/`amount`/`products` alimentent les 3 graphiques du
		// dashboard (`+page.svelte`) : pas d'id, de statut, ni d'identité client
		// à faire transiter jusqu'au navigateur pour cet usage.
		const rows = await prisma.transaction.findMany({
			where: { createdAt: { gte: since } },
			select: {
				createdAt: true,
				amount: true,
				products: true
			},
			orderBy: {
				createdAt: 'desc'
			},
			take: DASHBOARD_MAX_ROWS
		});
		return rows.map((row) => ({ ...row, amount: toNumber(row.amount) }));
	} catch (error) {
		console.error('Erreur lors de la récupération des transactions du dashboard:', error);
		throw error;
	}
};
