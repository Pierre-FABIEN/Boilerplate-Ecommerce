// SENDCLOUD : création d'étiquette d'expédition (API v3, `shipments/announce`).
// COMMERCE-PLUGIN y fait appel depuis le job post-paiement ; retirer Sendcloud
// n'empêche pas d'enregistrer la Transaction.
//
// Migré depuis l'API v2 `/api/v2/parcels` (dépréciée, en mode maintenance
// chez Sendcloud) — voir docs/commerce/README.md pour le détail de la
// migration. Le `shipping_option_code` v3 attendu ici est déjà celui que le
// client a choisi au checkout (`Transaction.shippingOption`, posé tel quel
// depuis `/api/sendcloud/shipping-options` → `Order.shippingOption` →
// `Transaction.shippingOption`, voir la chaîne complète dans le plan de
// migration) : pas de second appel réseau pour le résoudre, contrairement à
// l'ancien code v2.
import { prisma } from '$lib/server';
import { log } from '$lib/server/log';
import { persistSendcloudMarker } from '$lib/server/sendcloud-marker';

type TransactionForLabel = {
	id: string;
	shippingOption: string | null;
	address_first_name: string;
	address_last_name: string;
	address_phone: string;
	address_company?: string | null;
	address_street_number: string;
	address_street: string;
	address_city: string;
	address_zip: string;
	address_country_code: string;
	customer_details_email?: string | null;
	package_length: number;
	package_width: number;
	package_height: number;
	package_weight: number;
	servicePointId?: string | null;
};

type SendcloudApiError = {
	field?: string;
	detail?: string;
	message?: string;
	source?: { pointer?: string };
};

type SendcloudDocument = {
	type?: string;
	document_type?: string;
	link?: string;
};

type SendcloudParcel = {
	id?: number;
	tracking_number?: string;
	status?: { code?: string; message?: string };
};

type SendcloudAnnounceResponse = {
	id?: number;
	parcels?: SendcloudParcel[];
	tracking_number?: string;
	tracking_numbers?: string[];
	documents?: SendcloudDocument[];
	errors?: SendcloudApiError[];
};

function authHeader() {
	const pub = process.env.SENDCLOUD_PUBLIC_KEY;
	const sec = process.env.SENDCLOUD_SECRET_KEY;
	if (!pub || !sec) throw new Error('Sendcloud credentials missing');
	return 'Basic ' + Buffer.from(`${pub}:${sec}`).toString('base64');
}

function envOr(name: string, fallback: string): string {
	const value = process.env[name]?.trim();
	return value && value.length > 0 ? value : fallback;
}

/**
 * Adresse d'expédition de la boutique (`from_address`), obligatoire sur
 * `shipments/announce` v3 — découvert en conditions réelles (curl direct,
 * réponse `{"errors":[{"detail":"Field required","source":{"pointer":"/from_address"}}]}`),
 * absent de la documentation consultée avant l'implémentation initiale.
 * Mêmes variables d'environnement que `returnValidate.ts`/`returnLabel.ts` :
 * il s'agit physiquement de la même adresse boutique, seule la direction du
 * colis change (destinataire pour un retour, expéditeur pour un envoi aller).
 */
function shopFromAddress() {
	return {
		name: envOr('INVOICE_COMPANY_NAME', 'MadeInDiamonds'),
		address_line_1: envOr('INVOICE_COMPANY_ADDRESS', '123 Rue des Affaires'),
		house_number: envOr('SENDCLOUD_RETURN_HOUSE_NUMBER', '') || undefined,
		postal_code: envOr('SENDCLOUD_RETURN_POSTAL_CODE', '75000'),
		city: envOr('SENDCLOUD_RETURN_CITY', 'Paris'),
		country_code: envOr('SENDCLOUD_RETURN_COUNTRY', 'FR'),
		email: envOr('INVOICE_COMPANY_EMAIL', 'contact@madeindiamonds.com'),
		phone_number: envOr('INVOICE_COMPANY_PHONE', '+33123456789')
	};
}

/**
 * Étiquette à un enregistrement Sendcloud v3 précis dans un tableau de
 * réponse : la doc Sendcloud ne précise pas si `data.id` (l'expédition) ou
 * `data.parcels[0].id` (le colis) correspond au `parcel.id` que le webhook
 * entrant rapportera ensuite — les deux sont loggés en INFO au premier appel
 * réel pour trancher définitivement (voir plan de migration, étape 3).
 */
function extractParcelId(data: SendcloudAnnounceResponse): number | null {
	const fromParcel = Number(data?.parcels?.[0]?.id);
	if (Number.isFinite(fromParcel)) return fromParcel;
	const fromShipment = Number(data?.id);
	return Number.isFinite(fromShipment) ? fromShipment : null;
}

function extractTrackingNumber(data: SendcloudAnnounceResponse): string | null {
	return (
		data?.tracking_number ??
		data?.parcels?.[0]?.tracking_number ??
		data?.tracking_numbers?.[0] ??
		null
	);
}

function extractTrackingUrl(data: SendcloudAnnounceResponse): string | null {
	const documents = Array.isArray(data?.documents) ? data.documents : [];
	const label = documents.find((doc) => doc?.type === 'label' || doc?.document_type === 'label');
	return label?.link ?? null;
}

/**
 * Crée une étiquette d'expédition Sendcloud (v3, synchrone) pour une
 * transaction payée. Lève une exception sur tout échec (jamais un `return`
 * silencieux) : c'est ce qui permet au disjoncteur/dead-letter du job
 * appelant (`$lib/server/jobs/post-payment.ts`) de réellement protéger cette
 * étape — un échec avalé en silence laissait autrefois une transaction payée
 * sans étiquette, pour toujours, sans aucune alerte.
 */
export async function createSendcloudLabel(transaction: TransactionForLabel) {
	// Commandes sur-mesure (`Order.shippingOption = 'no_shipping'`) : jamais
	// expédiées par Sendcloud, rien à faire ici.
	if (!transaction.shippingOption || transaction.shippingOption === 'no_shipping') {
		log('DEBUG', 'sendcloud:label', 'Pas de transporteur Sendcloud pour cette transaction', {
			transactionId: transaction.id,
			shippingOption: transaction.shippingOption
		});
		return;
	}

	// Données d'adresse obligatoires côté v3 (`to_address`) : une valeur
	// manquante lève avant d'appeler Sendcloud, plutôt que d'envoyer une
	// fausse adresse/coordonnée à un vrai transporteur (SMS/email de livraison
	// envoyés à un inconnu — préjudice réel, pas une simple erreur cosmétique).
	const requiredFields: (keyof TransactionForLabel)[] = [
		'address_street',
		'address_city',
		'address_zip',
		'address_country_code'
	];
	const missing = requiredFields.filter((key) => !transaction[key]);
	if (missing.length > 0) {
		throw new Error(
			`Adresse d'expédition incomplète pour la transaction ${transaction.id} (champs manquants : ${missing.join(', ')})`
		);
	}

	const name = `${transaction.address_first_name} ${transaction.address_last_name}`.trim();
	if (!name) {
		throw new Error(`Nom du destinataire manquant pour la transaction ${transaction.id}`);
	}

	const requestBody = {
		from_address: shopFromAddress(),
		to_address: {
			name,
			company_name: transaction.address_company || undefined,
			address_line_1: transaction.address_street,
			house_number: transaction.address_street_number || undefined,
			postal_code: transaction.address_zip,
			city: transaction.address_city,
			country_code: transaction.address_country_code.toUpperCase(),
			email: transaction.customer_details_email || undefined,
			phone_number: transaction.address_phone || undefined
		},
		ship_with: {
			type: 'shipping_option_code',
			properties: { shipping_option_code: transaction.shippingOption }
		},
		parcels: [
			{
				weight: { value: transaction.package_weight, unit: 'kg' },
				dimensions: {
					length: transaction.package_length,
					width: transaction.package_width,
					height: transaction.package_height,
					unit: 'cm'
				}
			}
		],
		order_number: `ORDER-${transaction.id}`,
		external_reference_id: transaction.id,
		...(transaction.servicePointId ? { to_service_point: Number(transaction.servicePointId) } : {})
	};

	log('INFO', 'sendcloud:label', "Création d'étiquette v3", {
		transactionId: transaction.id,
		shippingOption: transaction.shippingOption
	});

	const response = await fetch('https://panel.sendcloud.sc/api/v3/shipments/announce', {
		method: 'POST',
		headers: {
			Authorization: authHeader(),
			'Content-Type': 'application/json',
			Accept: 'application/json'
		},
		body: JSON.stringify(requestBody)
	});

	const responseData: SendcloudAnnounceResponse = await response.json().catch(() => ({}));

	if (!response.ok) {
		// Deux formes d'erreur v3 observées en conditions réelles selon
		// l'endpoint : `{field, detail}` (returns/validate) et
		// `{source: {pointer: "/from_address"}, detail}` (shipments/announce,
		// style JSON:API) — les deux sont lues ici pour ne jamais retomber sur
		// un « Field required » sans nom de champ, illisible en dead-letter.
		const detail = Array.isArray(responseData?.errors)
			? responseData.errors
					.map((e) => {
						const field = e?.field ?? e?.source?.pointer;
						const message = e?.detail ?? e?.message;
						return field ? `${field}: ${message}` : message;
					})
					.join('; ')
			: JSON.stringify(responseData);
		throw new Error(
			`Sendcloud v3 shipments/announce a échoué (${response.status}) pour la transaction ${transaction.id} : ${detail}`
		);
	}

	// Un statut HTTP 2xx n'exclut pas un échec d'annonce par colis : Sendcloud
	// peut accepter la requête mais refuser le colis lui-même.
	const parcelStatus = responseData?.parcels?.[0]?.status;
	if (parcelStatus?.code === 'ANNOUNCEMENT_FAILED') {
		throw new Error(
			`Sendcloud v3 a refusé l'annonce du colis pour la transaction ${transaction.id} : ${parcelStatus?.message ?? 'raison inconnue'}`
		);
	}

	const parcelId = extractParcelId(responseData);
	const trackingNumber = extractTrackingNumber(responseData);
	const trackingUrl = extractTrackingUrl(responseData);

	log('INFO', 'sendcloud:label', 'Étiquette créée', {
		transactionId: transaction.id,
		// Les deux id bruts, le temps de confirmer lequel matche `parcel.id`
		// côté webhook entrant (voir `extractParcelId`).
		shipmentId: responseData?.id ?? null,
		parcelIdFromParcelsArray: responseData?.parcels?.[0]?.id ?? null,
		resolvedParcelId: parcelId,
		trackingNumber
	});

	if (!parcelId) {
		throw new Error(
			`Réponse Sendcloud v3 sans identifiant de colis exploitable pour la transaction ${transaction.id}`
		);
	}

	const existingTransaction = await prisma.transaction.findUnique({
		where: { id: transaction.id }
	});
	if (!existingTransaction) {
		throw new Error(
			`Transaction ${transaction.id} introuvable en base après création de l'étiquette`
		);
	}

	await persistSendcloudMarker('étiquette Sendcloud', () =>
		prisma.transaction.update({
			where: { id: transaction.id },
			data: {
				sendcloudParcelId: parcelId,
				trackingNumber,
				trackingUrl
			}
		})
	);

	log('INFO', 'sendcloud:label', 'Transaction mise à jour avec les informations Sendcloud', {
		transactionId: transaction.id,
		parcelId
	});
}
