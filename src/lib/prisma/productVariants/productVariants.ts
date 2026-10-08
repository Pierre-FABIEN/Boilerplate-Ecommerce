/**
 * Accès Prisma aux variantes produit (`ProductVariant`) : étiquette libre
 * (« Taille 54 », « Or blanc »...), stock propre, prix optionnel qui
 * surcharge `Product.price`. Voir le commentaire du modèle dans
 * `schema.prisma` pour la décision de rester sur des étiquettes plutôt que
 * des axes combinatoires (taxonomie taille × couleur, etc.).
 */
import { prisma } from '$lib/server';
import { bumpCacheVersion } from '$lib/server/cache';
import { mapVariantPrice } from '$lib/prisma/products/mapProduct';

export class VariantInUseError extends Error {
	constructor(variantId: string) {
		super(`Variant ${variantId} cannot be deleted because it has been ordered.`);
		this.name = 'VariantInUseError';
	}
}

export async function getVariantsForProduct(productId: string) {
	const variants = await prisma.productVariant.findMany({
		where: { productId },
		orderBy: { position: 'asc' }
	});
	return variants.map(mapVariantPrice);
}

export async function getVariantById(id: string) {
	const variant = await prisma.productVariant.findUnique({
		where: { id },
		include: { product: { select: { id: true, name: true, slug: true } } }
	});
	return variant ? mapVariantPrice(variant) : null;
}

export async function createVariant(
	productId: string,
	data: { label: string; sku?: string | null; price?: number | null; stock: number }
) {
	const lastVariant = await prisma.productVariant.findFirst({
		where: { productId },
		orderBy: { position: 'desc' },
		select: { position: true }
	});

	const variant = await prisma.productVariant.create({
		data: {
			productId,
			label: data.label,
			sku: data.sku || null,
			price: data.price || null,
			stock: data.stock,
			position: (lastVariant?.position ?? -1) + 1
		}
	});
	await bumpCacheVersion('catalog');
	return mapVariantPrice(variant);
}

export async function updateVariant(
	id: string,
	data: { label: string; sku?: string | null; price?: number | null; stock: number }
) {
	const variant = await prisma.productVariant.update({
		where: { id },
		data: {
			label: data.label,
			sku: data.sku || null,
			price: data.price || null,
			stock: data.stock
		}
	});
	await bumpCacheVersion('catalog');
	return mapVariantPrice(variant);
}

export async function deleteVariantById(id: string) {
	const linkedItems = await prisma.orderItem.count({ where: { variantId: id } });
	if (linkedItems > 0) {
		throw new VariantInUseError(id);
	}

	await prisma.productVariant.delete({ where: { id } });
	await bumpCacheVersion('catalog');
}
