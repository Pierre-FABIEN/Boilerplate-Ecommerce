/**
 * AUTH-PLUGIN : géocodage du carnet d'adresses.
 * Fixture utilisée seulement si `SECRET_OPENCAGEDATA_KEY` est factice (`e2e`).
 */
export const E2E_OPENCAGE_QUERY = 'Rue des Tests';

/** Requête réelle, assez précise pour obtenir un numéro et Toulouse. */
export const LIVE_OPENCAGE_QUERY = '1 Place du Capitole Toulouse';

export const E2E_OPENCAGE_SUGGESTIONS = [
	{
		formatted: '1 Rue des Tests, 31000 Toulouse, France',
		components: {
			house_number: '1',
			road: 'Rue des Tests',
			city: 'Toulouse',
			county: 'Haute-Garonne',
			state: 'Occitanie',
			state_code: 'OC',
			postcode: '31000',
			country: 'France',
			country_code: 'FR',
			'ISO_3166-1_alpha-2': 'FR',
			'ISO_3166-1_alpha-3': 'FRA'
		}
	}
];
