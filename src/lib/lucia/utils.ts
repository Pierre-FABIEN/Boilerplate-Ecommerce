// -----------------------------------------------------------------------------
// Génération des codes lisibles par un humain.
//
// Base32 sans rembourrage : uniquement des majuscules et des chiffres, faciles à
// recopier depuis un email. 5 octets aléatoires donnent 8 caractères (codes de
// vérification), 10 octets en donnent 16 (codes de secours).
// -----------------------------------------------------------------------------

import { encodeBase32UpperCaseNoPadding } from '@oslojs/encoding';

export function generateRandomOTP(): string {
	const bytes = new Uint8Array(5);
	crypto.getRandomValues(bytes);
	const code = encodeBase32UpperCaseNoPadding(bytes);
	return code;
}

export function generateRandomRecoveryCode(): string {
	const recoveryCodeBytes = new Uint8Array(10);
	crypto.getRandomValues(recoveryCodeBytes);
	const recoveryCode = encodeBase32UpperCaseNoPadding(recoveryCodeBytes);
	return recoveryCode;
}

export function generateForgotPasswordCode(): string {
	const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'; // Lettres majuscules + chiffres
	let code = '';
	for (let i = 0; i < 8; i++) {
		code += charset.charAt(Math.floor(Math.random() * charset.length));
	}
	return code;
}
