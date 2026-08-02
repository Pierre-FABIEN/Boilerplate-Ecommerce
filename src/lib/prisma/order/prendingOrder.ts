import { prisma } from '$lib/server';
import cloudinary from '$lib/server/cloudinary';

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

export async function updateOrderItems(orderId: string, incomingItems: any[]) {
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

		// IDs qu'on va conserver ou créer
		const keptOrCreatedIds: string[] = [];

		// Étape 3: Boucle sur chaque item entrant (upsert)
		for (const newItem of incomingItems) {
			const matchingExisting = existingOrderItems.find((oi) => oi.id === newItem.id);

			// Normaliser newItem.custom en tableau
			const newCustomArray = Array.isArray(newItem.custom)
				? newItem.custom
				: newItem.custom
					? [newItem.custom]
					: [];

			if (matchingExisting) {
				// -> Mise à jour
				await prisma.orderItem.update({
					where: { id: matchingExisting.id },
					data: {
						quantity: newItem.quantity,
						price: newItem.price,
						productId: newItem.product?.id
					}
				});

				// On supprime tous les "custom" existants pour cet item, puis on recrée
				await prisma.custom.deleteMany({
					where: { orderItemId: matchingExisting.id }
				});

				if (newCustomArray.length > 0) {
					await prisma.custom.createMany({
						data: newCustomArray.map((c) => ({
							image: c.image,
							userMessage: c.userMessage,
							orderItemId: matchingExisting.id
						}))
					});
				}

				keptOrCreatedIds.push(matchingExisting.id);
			} else {
				// -> Création d'un nouvel item
				const createdOrderItem = await prisma.orderItem.create({
					data: {
						orderId,
						productId: newItem.product?.id,
						quantity: newItem.quantity,
						price: newItem.price
					}
				});

				if (newCustomArray.length > 0) {
					await prisma.custom.createMany({
						data: newCustomArray.map((c) => ({
							image: c.image,
							userMessage: c.userMessage,
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

			// 4A) Supprimer les customs de la base
			await prisma.custom.deleteMany({
				where: { orderItemId: { in: itemsToDelete } }
			});

			// 4B) Supprimer les orderItems de la base
			await prisma.orderItem.deleteMany({
				where: { id: { in: itemsToDelete } }
			});

			// console.log('Deleted old order items and their custom entries.');
		} else {
			// console.log('No order items to delete - everything is kept or updated.');
		}

		// Étape 5: Recalculer les totaux
		const allItems = await prisma.orderItem.findMany({ where: { orderId } });

		const subtotal = allItems.reduce((sum, item) => sum + item.quantity * item.price, 0);
		const tax = parseFloat((subtotal * 0.055).toFixed(2)); // TVA de 5,5%
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

export async function updateOrder(
	orderId: string,
	addressId: string,
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
			addressId,
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
					product: true
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
