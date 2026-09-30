/**
 * Accès Prisma aux commandes en cours.
 *
 * COMMERCE-PLUGIN : `findPendingOrder` ne voit que `PENDING`. Les prix des
 * lignes sont toujours relus depuis `Product` — jamais ceux du JSON client.
 */
import { z } from 'zod';
import { prisma } from '$lib/server';
import cloudinary from '$lib/server/cloudinary';
import { InvalidCustomizationError, UnknownProductError } from '$lib/commerce/errors';
import { getVatRate } from '$lib/server/vat';

// Forme réelle d'une entrée `custom` à ce stade du pipeline : `image` est déjà
// une URL (uploadée en amont), pas un `File` — `customSchema.ts`
// (`$lib/schema/products/customSchema.ts`) valide un `File` et sert à un
// futur formulaire d'upload, pas à cette écriture-ci.
const CUSTOM_ENTRY_SCHEMA = z.object({
	image: z.string().trim().min(1).max(2048),
	userMessage: z.string().trim().max(500)
});
const MAX_CUSTOM_ITEM_QUANTITY = 10000;

export const findPendingOrder = async (userId: string) => {
	return await prisma.order.findFirst({
		where: {
			userId: userId,
			status: 'PENDING'
		},
		include: {
			items: {
				include: {
					product: true,
					variant: true,
					custom: true
				}
			}
		}
	});
};

export const createPendingOrder = async (userId: string) => {
	const order = await prisma.order.create({
		data: {
			userId: userId,
			status: 'PENDING'
		}
	});
	return { ...order, items: [] };
};

// Forme d'un item de commande tel qu'envoyé par le client (panier) —
// uniquement les champs effectivement lus ci-dessous, le reste (nom, image
// d'affichage...) est ignoré et recalculé depuis `Product`/`ProductVariant`.
export type IncomingOrderItem = {
	id?: string;
	product?: { id?: string };
	productId?: string;
	variant?: { id?: string };
	variantId?: string;
	quantity?: number;
	custom?: { image?: string; userMessage?: string } | { image?: string; userMessage?: string }[];
};

export async function updateOrderItems(orderId: string, incomingItems: IncomingOrderItem[]) {
	// console.log('--- Start updating order items (non-destructive) ---');
	// console.log(`Order ID: ${orderId}`);
	// console.log('New items:', JSON.stringify(incomingItems, null, 2));

	try {
		// Étape 1: Vérifier si la commande existe
		const orderExists = await prisma.order.findUnique({
			where: { id: orderId }
		});
		if (!orderExists) {
			throw new Error(`Order with ID ${orderId} not found.`);
		}
		// console.log('Order found:', orderExists);

		// Étape 2: Récupérer les items existants
		const existingOrderItems = await prisma.orderItem.findMany({
			where: { orderId },
			include: { custom: true }
		});
		const existingOrderItemIds = existingOrderItems.map((oi) => oi.id);

		// Catalogue préchargé en deux requêtes : relire produit puis variante dans la
		// boucle coûtait jusqu'à deux allers-retours par article du panier.
		const incomingProductIds = [
			...new Set(
				incomingItems
					.map((item) => item.product?.id ?? item.productId)
					.filter((id): id is string => Boolean(id))
			)
		];
		const incomingVariantIds = [
			...new Set(
				incomingItems
					.map((item) => item.variant?.id ?? item.variantId)
					.filter((id): id is string => Boolean(id))
			)
		];

		const [catalogProducts, catalogVariants] = await Promise.all([
			incomingProductIds.length
				? prisma.product.findMany({
						where: { id: { in: incomingProductIds } },
						select: { id: true, price: true }
					})
				: [],
			incomingVariantIds.length
				? prisma.productVariant.findMany({
						where: { id: { in: incomingVariantIds } },
						select: { id: true, productId: true, price: true }
					})
				: []
		]);
		const catalogProductById = new Map(catalogProducts.map((product) => [product.id, product]));
		const catalogVariantById = new Map(catalogVariants.map((variant) => [variant.id, variant]));

		// IDs qu'on va conserver ou créer
		const keptOrCreatedIds: string[] = [];

		// Étape 3: Boucle sur chaque item entrant (upsert)
		for (const newItem of incomingItems) {
			const matchingExisting = existingOrderItems.find((oi) => oi.id === newItem.id);
			const productId = newItem.product?.id ?? newItem.productId;
			if (!productId) {
				throw new UnknownProductError();
			}
			const catalogProduct = catalogProductById.get(productId);
			if (!catalogProduct) {
				throw new UnknownProductError(productId);
			}

			// Variante sélectionnée : prix relu depuis `ProductVariant`, jamais
			// celui du client — même garde que pour `catalogProduct` ci-dessus.
			// `variant.productId !== productId` est refusé (id de variante rejoué
			// pour un autre produit) plutôt que silencieusement ignoré.
			const variantId: string | null = newItem.variant?.id ?? newItem.variantId ?? null;
			let variantPrice: number | null = null;
			if (variantId) {
				const variant = catalogVariantById.get(variantId);
				if (!variant || variant.productId !== productId) {
					throw new UnknownProductError(productId);
				}
				variantPrice = variant.price;
			}

			const catalogPrice = variantPrice ?? catalogProduct.price;

			// Normaliser newItem.custom en tableau
			const rawCustomArray = Array.isArray(newItem.custom)
				? newItem.custom
				: newItem.custom
					? [newItem.custom]
					: [];

			// Un article personnalisé (photo + message) n'a pas de borne haute de
			// quantité par défaut plus stricte que les autres — mais reste borné
			// pour éviter qu'un appel direct à l'API (sans passer par une UI) ne
			// crée un nombre de lignes `Custom` arbitraire pour un seul article.
			const quantity = Math.min(
				rawCustomArray.length > 0 ? MAX_CUSTOM_ITEM_QUANTITY : Number.MAX_SAFE_INTEGER,
				Math.max(1, Math.trunc(Number(newItem.quantity) || 1))
			);

			const newCustomArray = rawCustomArray.map((entry) => {
				const parsed = CUSTOM_ENTRY_SCHEMA.safeParse(entry);
				if (!parsed.success) {
					throw new InvalidCustomizationError();
				}
				return parsed.data;
			});

			if (matchingExisting) {
				// -> Mise à jour
				await prisma.orderItem.update({
					where: { id: matchingExisting.id },
					data: {
						quantity,
						price: catalogPrice,
						productId: catalogProduct.id,
						variantId
					}
				});

				// On supprime tous les "custom" existants pour cet item, puis on recrée
				const oldCustomImages = matchingExisting.custom.map((c) => c.image).filter(Boolean);
				await prisma.custom.deleteMany({
					where: { orderItemId: matchingExisting.id }
				});

				if (newCustomArray.length > 0) {
					await prisma.custom.createMany({
						data: newCustomArray.map((c) => ({
							image: c.image ?? '',
							userMessage: c.userMessage ?? '',
							orderItemId: matchingExisting.id
						}))
					});
				}

				// Les anciennes images remplacées ne sont plus référencées : purge Cloudinary
				// (no-op si l'URL a été recréée à l'identique, `maybeDeleteImageOnCloudinary`
				// revérifie l'usage en base après le recréation ci-dessus).
				await Promise.all(oldCustomImages.map((image) => maybeDeleteImageOnCloudinary(image)));

				keptOrCreatedIds.push(matchingExisting.id);
			} else {
				// -> Création d'un nouvel item
				const createdOrderItem = await prisma.orderItem.create({
					data: {
						orderId,
						productId: catalogProduct.id,
						variantId,
						quantity,
						price: catalogPrice
					}
				});

				if (newCustomArray.length > 0) {
					await prisma.custom.createMany({
						data: newCustomArray.map((c) => ({
							image: c.image ?? '',
							userMessage: c.userMessage ?? '',
							orderItemId: createdOrderItem.id
						}))
					});
				}

				keptOrCreatedIds.push(createdOrderItem.id);
			}
		}

		// Étape 4: Identifier les items à supprimer
		const itemsToDelete = existingOrderItemIds.filter((id) => !keptOrCreatedIds.includes(id));
		if (itemsToDelete.length > 0) {
			// console.log('Deleting items not in new list:', itemsToDelete);

			const deletedCustomImages = existingOrderItems
				.filter((oi) => itemsToDelete.includes(oi.id))
				.flatMap((oi) => oi.custom.map((c) => c.image))
				.filter(Boolean);

			// 4A) Supprimer les customs de la base
			await prisma.custom.deleteMany({
				where: { orderItemId: { in: itemsToDelete } }
			});

			// 4B) Supprimer les orderItems de la base
			await prisma.orderItem.deleteMany({
				where: { id: { in: itemsToDelete } }
			});

			// Purge Cloudinary des images des items supprimés
			await Promise.all(deletedCustomImages.map((image) => maybeDeleteImageOnCloudinary(image)));

			// console.log('Deleted old order items and their custom entries.');
		} else {
			// console.log('No order items to delete - everything is kept or updated.');
		}

		// Étape 5: Recalculer les totaux
		const allItems = await prisma.orderItem.findMany({ where: { orderId } });

		const subtotal = allItems.reduce((sum, item) => sum + item.quantity * item.price, 0);
		const vatRate = await getVatRate();
		const tax = parseFloat((subtotal * vatRate).toFixed(2));
		const total = parseFloat((subtotal + tax).toFixed(2));

		// console.log(`New subtotal calculated: ${subtotal}`);
		// console.log(`New tax calculated: ${tax}`);
		// console.log(`New total calculated: ${total}`);

		// Étape 6: Mettre à jour la commande
		await prisma.order.update({
			where: { id: orderId },
			data: { subtotal, tax, total }
		});

		// Étape 7: Retour final de la commande avec items + custom
		const updatedOrderWithItems = await prisma.order.findUnique({
			where: { id: orderId },
			include: {
				items: {
					include: {
						product: true,
						variant: true,
						custom: true
					}
				}
			}
		});

		// console.log('--- Successfully updated order items ---');
		// console.log('Final updated order:', updatedOrderWithItems);

		return updatedOrderWithItems;
	} catch (error) {
		console.error('Error while updating order items (non-destructive):', error);
		throw error;
	}
}

/**
 * Supprime une image sur Cloudinary si elle n'est plus utilisée.
 */
async function maybeDeleteImageOnCloudinary(imageUrl: string) {
	try {
		if (!imageUrl) return;

		const publicId = extractPublicId(imageUrl);
		// console.log(`Attempting to delete image with public_id: ${publicId}`);

		// Vérifier si l'image est encore utilisée

		const stillInUse = await prisma.custom.findFirst({ where: { image: imageUrl } });
		if (stillInUse) {
			// console.log(`Image still in use: ${imageUrl}, skipping deletion.`);
			return;
		}

		// Supprimer l'image de Cloudinary
		const result = await cloudinary.uploader.destroy(`client/${publicId}`);
		if (result.result === 'ok') {
			// console.log(`Image ${publicId} deleted successfully.`);
		} else {
			console.error(`Failed to delete image ${publicId}:`, result);
		}
	} catch (err) {
		console.error(`Error deleting image: ${imageUrl}`, err);
	}
}

/**
 * Extrait le public_id d'une URL Cloudinary.
 */
function extractPublicId(imageUrl: string): string {
	const file = imageUrl.split('/').pop() ?? '';
	return file.replace(/\.[^.]+$/, '');
}

export async function updateOrder(
	orderId: string,
	shippingAddressId: string,
	billingAddressId: string,
	shippingOption: string,
	shippingCost: string,
	servicePointId?: string,
	servicePointPostNumber?: string,
	servicePointLatitude?: string,
	servicePointLongitude?: string,
	servicePointType?: string | null,
	servicePointExtraRefCab?: string,
	servicePointExtraShopRef?: string,
	promoCode?: string | null,
	discountAmount: number = 0
) {
	// 1. Convert shippingCost to float
	const shippingCostFloat = parseFloat(shippingCost);
	const discount = discountAmount > 0 ? parseFloat(discountAmount.toFixed(2)) : 0;

	// 2. Récupère l'ordre existant
	const existingOrder = await prisma.order.findUnique({
		where: { id: orderId }
	});
	if (!existingOrder) {
		throw new Error(`Order ${orderId} does not exist`);
	}

	// 3. Calcule le total final (produits TTC + port - remise)
	// existingOrder.total = prix des articles + leur TVA
	// shippingCostFloat = frais de port
	const orderTotalHTWithoutShipping = existingOrder.total; // par hypothèse

	// total final (jamais négatif)
	const finalTotal = Math.max(0, orderTotalHTWithoutShipping + shippingCostFloat - discount);

	// 4. Met à jour la commande
	return await prisma.order.update({
		where: { id: orderId },
		data: {
			shippingAddressId,
			billingAddressId,
			shippingOption,
			shippingCost: shippingCostFloat,
			promoCode: promoCode || null,
			discountAmount: discount,
			total: parseFloat(finalTotal.toFixed(2)), // on arrondit
			updatedAt: new Date(),
			servicePointId,
			servicePointPostNumber,
			servicePointLatitude,
			servicePointLongitude,
			servicePointType,
			servicePointExtraRefCab,
			servicePointExtraShopRef
		}
	});
}

export async function getOrderById(orderId: string) {
	return await prisma.order.findUnique({
		where: { id: orderId },
		include: {
			items: {
				include: {
					product: true,
					custom: true
				}
			}
		}
	});
}

export async function getUserIdByOrderId(orderId: string) {
	return await prisma.order.findUnique({
		where: { id: orderId },
		select: { userId: true }
	});
}
