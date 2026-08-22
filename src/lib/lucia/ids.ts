import { nanoid } from 'nanoid';

/**
 * Jeton imprévisible servant d'identifiant aux entités éphémères d'authentification
 * (sessions, requêtes de vérification d'email, sessions de reset).
 * 32 caractères nanoid ≈ 190 bits d'entropie.
 */
export function generateSecureToken(): string {
	return nanoid(32);
}

/**
 * Garde-fou sur les identifiants reçus de l'extérieur (cookies, formulaires, URL).
 * L'intégrité référentielle est désormais assurée par les clés étrangères PostgreSQL :
 * cette validation ne sert qu'à rejeter tôt les entrées manifestement invalides.
 */
export function isValidId(id: unknown): id is string {
	return typeof id === 'string' && id.length > 0 && id.length <= 64;
}
