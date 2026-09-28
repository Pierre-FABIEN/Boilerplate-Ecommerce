/**
 * Droit à la portabilité (RGPD art. 20) — instantané JSON des données
 * personnelles d'un compte, dans un format structuré et lisible par machine
 * (l'article l'exige explicitement ; un CSV plat s'y prêterait mal pour des
 * données imbriquées comme une commande et ses lignes). Aucun identifiant
 * technique tiers exposé (id Stripe, id PaymentMethod) — seulement ce qui a
 * un sens pour le titulaire des données lui-même.
 */
import { prisma } from '$lib/server';

export async function buildUserDataExport(userId: string) {
	const [
		user,
		addresses,
		orders,
		transactions,
		reviews,
		questions,
		wishlist,
		returnRequests,
		loyaltyAwards,
		loginEvents
	] = await Promise.all([
		prisma.user.findUnique({
			where: { id: userId },
			select: {
				email: true,
				username: true,
				name: true,
				marketingEmailsOptIn: true,
				createdAt: true
			}
		}),
		prisma.address.findMany({ where: { userId } }),
		prisma.order.findMany({
			where: { userId },
			include: { items: { include: { product: { select: { name: true } } } } }
		}),
		prisma.transaction.findMany({
			where: { userId },
			select: {
				invoiceNumber: true,
				amount: true,
				currency: true,
				status: true,
				createdAt: true,
				customer_details_name: true,
				customer_details_email: true
			}
		}),
		prisma.review.findMany({
			where: { userId },
			include: { product: { select: { name: true } } }
		}),
		prisma.productQuestion.findMany({
			where: { userId },
			include: { product: { select: { name: true } } }
		}),
		prisma.wishlistItem.findMany({
			where: { userId },
			include: { product: { select: { name: true } } }
		}),
		prisma.returnRequest.findMany({ where: { userId } }),
		prisma.loyaltyAward.findMany({ where: { userId } }),
		// Conservé 90 jours (`$lib/server/jobs/cleanup.ts`), distinct des
		// sessions actives — voir `LoginEvent` dans schema.prisma.
		prisma.loginEvent.findMany({
			where: { userId },
			orderBy: { createdAt: 'desc' },
			select: {
				method: true,
				userAgent: true,
				ipAddress: true,
				city: true,
				country: true,
				isNewDevice: true,
				createdAt: true
			}
		})
	]);

	return {
		export_genere_le: new Date().toISOString(),
		profil: user,
		adresses: addresses,
		commandes: orders.map((order) => ({
			id: order.id,
			statut: order.status,
			creee_le: order.createdAt,
			articles: order.items.map((item) => ({
				produit: item.product.name,
				quantite: item.quantity,
				prix_unitaire: item.price
			}))
		})),
		factures: transactions,
		avis: reviews.map((review) => ({
			produit: review.product.name,
			note: review.rating,
			commentaire: review.comment,
			publie_le: review.createdAt
		})),
		questions_produit: questions.map((q) => ({
			produit: q.product.name,
			question: q.question,
			reponse: q.answer,
			posee_le: q.createdAt
		})),
		liste_envies: wishlist.map((item) => ({
			produit: item.product.name,
			ajoute_le: item.createdAt
		})),
		retours: returnRequests,
		fidelite: loyaltyAwards,
		historique_connexions: loginEvents.map((event) => ({
			methode: event.method,
			appareil_brut: event.userAgent,
			adresse_ip: event.ipAddress,
			ville: event.city,
			pays: event.country,
			nouvel_appareil_detecte: event.isNewDevice,
			connecte_le: event.createdAt
		}))
	};
}
