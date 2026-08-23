// -----------------------------------------------------------------------------
// Réinitialisation de mot de passe.
//
// Une session de reset matérialise la progression du parcours : code email
// validé, puis 2FA si le compte l'exige, puis saisie du nouveau mot de passe.
// Son identifiant vit dans un cookie dédié, distinct du cookie de session, et
// elle est détruite dès le mot de passe changé.
//
// Les deux drapeaux (`emailVerified`, `twoFactorVerified`) doivent être
// contrôlés à chaque étape : c'est ce qui interdit d'accéder directement à la
// dernière page du parcours.
// -----------------------------------------------------------------------------

import { generateRandomOTP } from './utils';
import { generateSecureToken, isValidId } from './ids';
import type { RequestEvent } from '@sveltejs/kit';
import type { User } from './user';
import {
	createPasswordResetSessionPrisma,
	deletePasswordResetSession,
	findPasswordResetSession
} from '$lib/prisma/passwordResetSession/passwordResetSession';
import nodemailer from 'nodemailer';

export interface PasswordResetSession {
	id: string;
	userId: string;
	email: string;
	expiresAt: Date;
	code: string;
	emailVerified: boolean;
	twoFactorVerified: boolean;
}

export type PasswordResetSessionValidationResult =
	| { session: PasswordResetSession; user: User }
	| { session: null; user: null };

// Crée une session de réinitialisation de mot de passe
export async function createPasswordResetSession(
	userId: string,
	email: string
): Promise<PasswordResetSession> {
	const sessionId = generateSecureToken();

	// Crée une nouvelle session
	const session: PasswordResetSession = {
		id: sessionId,
		userId,
		email,
		expiresAt: new Date(Date.now() + 1000 * 60 * 10), // Expire dans 10 minutes
		code: generateRandomOTP(),
		emailVerified: false,
		twoFactorVerified: false
	};

	// Ajoutez les champs dans la requête Prisma
	await createPasswordResetSessionPrisma(session);

	return session;
}

// Valide le token de session de réinitialisation
export async function validatePasswordResetSessionToken(
	token: string
): Promise<PasswordResetSessionValidationResult> {
	if (!isValidId(token)) {
		throw new Error('Invalid session token format');
	}

	const sessionId = token;
	const result = await findPasswordResetSession(sessionId);

	if (!result || Date.now() >= result.expiresAt.getTime()) {
		await deletePasswordResetSession(sessionId);
		return { session: null, user: null };
	}

	const session: PasswordResetSession = {
		id: result.id,
		userId: result.userId,
		email: result.email,
		code: result.code,
		expiresAt: result.expiresAt,
		emailVerified: result.emailVerified,
		twoFactorVerified: result.twoFactorVerified
	};

	const user: User = {
		id: result.user.id,
		email: result.user.email,
		username: result.user.username,
		emailVerified: result.user.emailVerified,
		registered2FA: result.user.totpKey !== null
	};

	return { session, user };
}

// Valide la requête de session de réinitialisation à partir des cookies
export async function validatePasswordResetSessionRequest(
	event: RequestEvent
): Promise<PasswordResetSessionValidationResult> {
	const token = event.cookies.get('password_reset_session') ?? null;
	if (!isValidId(token)) {
		return { session: null, user: null };
	}
	const result = await validatePasswordResetSessionToken(token);
	if (result.session === null) {
		deletePasswordResetSessionTokenCookie(event);
	}
	return result;
}

// Définit le cookie de session de réinitialisation de mot de passe
export function setPasswordResetSessionTokenCookie(
	event: RequestEvent,
	token: string,
	expiresAt: Date
): void {
	event.cookies.set('password_reset_session', token, {
		expires: expiresAt,
		sameSite: 'lax',
		httpOnly: true,
		path: '/',
		secure: import.meta.env.PROD
	});
}

// Supprime le cookie de session de réinitialisation de mot de passe
export function deletePasswordResetSessionTokenCookie(event: RequestEvent): void {
	event.cookies.set('password_reset_session', '', {
		maxAge: 0,
		sameSite: 'lax',
		httpOnly: true,
		path: '/',
		secure: import.meta.env.PROD
	});
}

// Envoie un email de réinitialisation de mot de passe

export async function sendPasswordResetEmail(email: string, code: string): Promise<void> {
	// Configuration du transporteur SMTP avec Brevo
	const transporter = nodemailer.createTransport({
		host: process.env.SMTP_HOST, // Serveur SMTP de Brevo
		port: parseInt(process.env.SMTP_PORT || '587', 10), // Port SMTP
		secure: false, // STARTTLS
		auth: {
			user: process.env.SMTP_USER, // Ton e-mail inscrit sur Brevo
			pass: process.env.SMTP_PASS // Clé API SMTP
		},
		logger: true, // Ajoute des logs détaillés
		debug: true // Active le mode debug
	});

	try {
		const mailOptions = {
			from: '"MadeInDiamonds" <contact@madeindiamonds.com>', // Expéditeur
			to: email, // Destinataire
			subject: 'Password Reset Request', // Objet de l'email
			text: `Your password reset code is: ${code}`, // Corps texte brut (fallback)
			html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>MadeInDiamonds - Password Reset</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #f6f6f6;
      font-family: Arial, sans-serif;
    }
    table {
      border-collapse: collapse;
      margin: 0 auto;
    }
    img {
      display: block;
      margin: 0 auto;
      max-width: 180px;
    }
    .container {
      background-color: #ffffff;
      border-radius: 8px;
      width: 600px;
      max-width: 95%;
      margin: 20px auto;
      padding: 20px;
      text-align: center;
    }
    .title {
      font-size: 24px;
      color: #333333;
      margin-bottom: 20px;
    }
    .code {
      font-size: 28px;
      font-weight: bold;
      color: #e3342f; /* Couleur de la marque */
      margin: 20px 0;
    }
    .footer {
      font-size: 14px;
      color: #999999;
      margin-top: 20px;
    }
  </style>
</head>
<body>
  <table width="100%" border="0" cellspacing="0" cellpadding="0">
    <tr>
      <td align="center" style="padding: 20px;">
        <!-- Logo -->
        <img src="https://example.com/logo.png" alt="MadeInDiamonds Logo" />

        <!-- Contenu principal -->
        <div class="container">
          <h1 class="title">Password Reset Request</h1>
          <p>We received a request to reset your password. Use the code below to reset it:</p>
          <p class="code">${code}</p>
          <p>This code will expire in 10 minutes.</p>
          
          <div class="footer">
            <p>If you did not request this, please ignore this email.</p>
            <p>— The MadeInDiamonds Team</p>
          </div>
        </div>
      </td>
    </tr>
  </table>
</body>
</html>`
		};

		// Envoi de l'email
		const info = await transporter.sendMail(mailOptions);

		// console.log(`Password reset email sent to ${email}: ${info.response}`);
	} catch (error) {
		console.error('Failed to send password reset email:', error);
		throw new Error('Email sending failed');
	}
}
