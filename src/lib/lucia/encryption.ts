// -----------------------------------------------------------------------------
// Chiffrement symétrique des secrets 2FA (clé TOTP, code de récupération).
//
// AES-128-GCM, clé lue dans `ENCRYPTION_KEY` (16 octets encodés en base64). Le
// vecteur d'initialisation est tiré au hasard à chaque appel et stocké en tête
// du chiffré, suivi du tag d'authentification : [iv 16 | chiffré | tag 16].
//
// Ces secrets ne peuvent pas être hachés comme un mot de passe : le serveur doit
// pouvoir les relire pour valider un code. Perdre `ENCRYPTION_KEY` rend donc
// toutes les 2FA existantes inutilisables — la sauvegarder au même titre qu'un
// mot de passe de base de données.
// -----------------------------------------------------------------------------

import { decodeBase64 } from '@oslojs/encoding';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { ENCRYPTION_KEY } from '$env/static/private';

// Validation de la clé d'encryption
if (!ENCRYPTION_KEY) {
	throw new Error(
		'ENCRYPTION_KEY is not defined in environment variables. Please check your .env file.'
	);
}

// Décodage de la clé d'encryption à partir de l'environnement
const key = decodeBase64(ENCRYPTION_KEY);

// Fonction utilitaire pour valider une chaîne Base64
function isValidBase64(str: string): boolean {
	return /^[A-Za-z0-9+/]+={0,2}$/.test(str);
}

/**
 * Chiffre un tableau d'octets en utilisant AES-128-GCM.
 * @param {Uint8Array} data - Les données à chiffrer.
 * @returns {Uint8Array} - Les données chiffrées sous forme de tableau d'octets.
 */
export function encrypt(data: Uint8Array): Uint8Array {
	const iv = randomBytes(16); // Génération d'un vecteur d'initialisation aléatoire
	const cipher = createCipheriv('aes-128-gcm', key, iv);
	const ciphertext = Buffer.concat([cipher.update(data), cipher.final()]);
	const tag = cipher.getAuthTag();

	// Concaténer IV, texte chiffré et tag
	return Buffer.concat([iv, ciphertext, tag]);
}

/**
 * Chiffre une chaîne de caractères en utilisant AES-128-GCM.
 * @param {string} data - La chaîne de caractères à chiffrer.
 * @returns {Uint8Array} - Les données chiffrées sous forme de tableau d'octets.
 */
export function encryptString(data: string): Uint8Array {
	return encrypt(Buffer.from(data, 'utf-8'));
}

/**
 * Déchiffre un tableau d'octets ou une chaîne Base64 en utilisant AES-128-GCM.
 * @param {string | Uint8Array} encrypted - Les données chiffrées.
 * @returns {Uint8Array} - Les données déchiffrées sous forme de tableau d'octets.
 */
export function decrypt(encrypted: string | Uint8Array): Uint8Array {
	// Si les données sont une chaîne, les convertir en tableau d'octets
	if (typeof encrypted === 'string') {
		// Valider la chaîne Base64
		if (!isValidBase64(encrypted)) {
			throw new Error('Invalid Base64 string');
		}

		try {
			encrypted = decodeBase64(encrypted);
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			throw new Error(`Erreur lors du décodage Base64 : ${errorMessage}`);
		}
	}

	// Vérification de la longueur minimale des données
	if (encrypted.byteLength < 32) {
		throw new Error('Invalid data: Insufficient length');
	}

	const iv = encrypted.slice(0, 16); // Extraction du vecteur d'initialisation
	const tag = encrypted.slice(encrypted.byteLength - 16); // Extraction du tag d'authentification
	const ciphertext = encrypted.slice(16, encrypted.byteLength - 16); // Extraction du texte chiffré

	const decipher = createDecipheriv('aes-128-gcm', key, iv);

	// Validation de la longueur du tag
	if (tag.byteLength !== 16) {
		throw new Error(`Invalid Auth Tag length: ${tag.byteLength}`);
	}

	decipher.setAuthTag(tag);

	try {
		const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
		return decrypted;
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		throw new Error(`Erreur lors du déchiffrement : ${errorMessage}`);
	}
}

/**
 * Déchiffre un tableau d'octets et retourne le résultat sous forme de chaîne de caractères.
 * @param {Uint8Array} data - Les données chiffrées.
 * @returns {string} - Les données déchiffrées sous forme de chaîne de caractères.
 */
export function decryptToString(data: Uint8Array): string {
	return Buffer.from(decrypt(data)).toString('utf-8');
}
