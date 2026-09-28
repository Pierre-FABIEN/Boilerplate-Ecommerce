import { log } from '$lib/server/log';

/**
 * L'appel réseau Sendcloud a déjà réussi quand cette erreur est levée : un
 * retry (QStash) referait l'appel réseau et créerait un doublon facturé
 * (commande ou étiquette) chez Sendcloud. À traiter comme un dead-letter,
 * jamais comme un échec Sendcloud ordinaire (voir `runPostPaymentJob`).
 */
export class SendcloudMarkerPersistError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'SendcloudMarkerPersistError';
	}
}

/**
 * Retente une écriture DB qui suit un appel réseau Sendcloud déjà réussi
 * (§2.1 de l'audit fonctionnel) : sans ça, un simple timeout DB juste après
 * la création d'une commande/étiquette laisse le marqueur d'idempotence
 * (`sendcloudOrderCreatedAt`/`sendcloudParcelId`) vide, et un retry QStash
 * recrée la commande/étiquette une seconde fois. Après épuisement des
 * tentatives, lève `SendcloudMarkerPersistError` plutôt que l'erreur DB
 * brute, pour que l'appelant sache qu'il ne doit surtout pas retenter
 * l'appel réseau associé.
 */
export async function persistSendcloudMarker<T>(
	label: string,
	write: () => Promise<T>,
	attempts = 3
): Promise<T> {
	let lastError: unknown;
	for (let attempt = 1; attempt <= attempts; attempt++) {
		try {
			return await write();
		} catch (error) {
			lastError = error;
			log(
				'WARN',
				'post-payment',
				`Échec écriture marqueur ${label} (tentative ${attempt}/${attempts})`,
				error
			);
			if (attempt < attempts) {
				await new Promise((resolve) => setTimeout(resolve, 200 * attempt));
			}
		}
	}
	throw new SendcloudMarkerPersistError(
		`Marqueur ${label} non persisté après ${attempts} tentatives (appel Sendcloud déjà effectué) : ${String(lastError)}`
	);
}
