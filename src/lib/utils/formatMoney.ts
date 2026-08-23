/** Montant affiché en euros (fr-FR). */
export function formatMoney(amount: number, currency = 'EUR'): string {
	const value = Number.isFinite(amount) ? amount : 0;
	return new Intl.NumberFormat('fr-FR', {
		style: 'currency',
		currency: currency.toUpperCase() === 'EUR' ? 'EUR' : currency.toUpperCase()
	}).format(value);
}
