import { randomUUID } from 'node:crypto';

/** Préfixe commun à tous les comptes de test, qui rend la purge triviale. */
export const E2E_EMAIL_PREFIX = 'e2e-';

export type Account = {
	email: string;
	username: string;
	password: string;
};

/**
 * Chaque test travaille sur un compte neuf. C'est ce qui neutralise les
 * limiteurs de débit indexés sur l'identifiant utilisateur (TOTP, vérification
 * d'email, throttler de connexion) sans avoir à redémarrer le serveur.
 */
export function makeAccount(): Account {
	const id = randomUUID().slice(0, 8);
	return {
		email: `${E2E_EMAIL_PREFIX}${id}@example.test`,
		username: `e2e_${id}`,
		password: 'Sup3rSecret!2026'
	};
}

/**
 * Adresse IP unique par test, envoyée en `X-Forwarded-For`. Les limiteurs
 * indexés sur l'IP (inscription : 3 requêtes / 10 s, mot de passe oublié :
 * 3 / 60 s, limite globale : 100 / s) deviennent ainsi indépendants d'un test
 * à l'autre.
 */
export function makeClientIp(): string {
	const octet = () => 1 + Math.floor(Math.random() * 254);
	return `10.${octet()}.${octet()}.${octet()}`;
}
