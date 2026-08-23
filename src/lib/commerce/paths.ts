// -----------------------------------------------------------------------------
// Chemins du tunnel de commande, pour la documentation et les tests e2e.
// -----------------------------------------------------------------------------

export const COMMERCE_PATHS = ['/checkout', '/checkout/success'] as const;

export const COMMERCE_ADMIN_PATHS = [
	'/admin/sales',
	'/admin/sales/facture',
	'/admin/sales/bordereau'
] as const;
