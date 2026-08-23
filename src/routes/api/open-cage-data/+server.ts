/**
 * AUTH-PLUGIN : géocodage du carnet d'adresses.
 * Mock uniquement si la clé OpenCage est factice — pas dès que PUBLIC_ENV=test.
 */
import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { SECRET_OPENCAGEDATA_KEY } from '$env/static/private';
import { E2E_OPENCAGE_SUGGESTIONS } from '$lib/addresses/opencage-e2e';
import { isDummySecret } from '$lib/server/dummy-secrets';

type OpenCageComponents = Record<string, unknown>;

function asString(value: unknown, fallback: string): string {
	if (typeof value === 'string' && value.trim()) return value;
	if (Array.isArray(value) && typeof value[0] === 'string' && value[0].trim()) return value[0];
	return fallback;
}

function normalizeComponents(components: OpenCageComponents): OpenCageComponents {
	const countryCode = asString(
		components.country_code ?? components['ISO_3166-1_alpha-2'],
		'fr'
	).toUpperCase();
	const alpha2 = asString(components['ISO_3166-1_alpha-2'], countryCode).toUpperCase();
	const alpha3 = asString(components['ISO_3166-1_alpha-3'], countryCode === 'FR' ? 'FRA' : '');
	return {
		...components,
		country_code: countryCode.slice(0, 2),
		'ISO_3166-1_alpha-2': alpha2.slice(0, 2),
		'ISO_3166-1_alpha-3': alpha3.slice(0, 3),
		state_code: asString(components.state_code, asString(components.state, 'NA')).slice(0, 10),
		county: asString(components.county, asString(components.state, 'NA'))
	};
}

export const GET: RequestHandler = async ({ url }) => {
	const query = url.searchParams.get('q');
	if (!query) {
		return json({ error: 'Query parameter is missing' }, { status: 400 });
	}

	if (isDummySecret(SECRET_OPENCAGEDATA_KEY)) {
		return json({ suggestions: E2E_OPENCAGE_SUGGESTIONS });
	}

	const response = await fetch(
		`https://api.opencagedata.com/geocode/v1/json?q=${encodeURIComponent(query)}&key=${SECRET_OPENCAGEDATA_KEY}&countrycode=fr`
	);
	const data = await response.json();

	if (!data.results) {
		return json({ error: 'No results found' }, { status: 404 });
	}

	const suggestions = data.results.map((result: { formatted: string; components: OpenCageComponents }) => ({
		formatted: result.formatted,
		components: normalizeComponents(result.components ?? {})
	}));

	return json({ suggestions });
};
