/**
 * Erreurs du tunnel de commande.
 *
 * COMMERCE-PLUGIN : ces classes sont le contrat des routes `/api/save-cart`
 * et `?/checkout`. Ne pas les remplacer par des `Error` anonymes : les
 * handlers s'en servent pour choisir 403 / 400.
 */

export class CartForbiddenError extends Error {
	constructor(message = 'Cette commande ne vous appartient pas.') {
		super(message);
		this.name = 'CartForbiddenError';
	}
}

export class UnknownProductError extends Error {
	constructor(public readonly productId?: string) {
		super(
			productId
				? `Produit inconnu : ${productId}`
				: 'Un article du panier ne correspond à aucun produit.'
		);
		this.name = 'UnknownProductError';
	}
}

export class InvalidShippingError extends Error {
	constructor(
		message = 'Les frais de port fournis par le client ne sont pas acceptés.'
	) {
		super(message);
		this.name = 'InvalidShippingError';
	}
}
