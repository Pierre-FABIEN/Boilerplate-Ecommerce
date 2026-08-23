/**
 * Envoi du mail de vérification.
 *
 * Isolé de Lucia / SvelteKit pour pouvoir être appelé depuis le worker
 * Playwright (`e2e/live/brevo.spec.ts`) avec `SMTP_LIVE_*` injectés dans
 * `process.env.SMTP_*` le temps d'un envoi.
 */
import nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';

export function createSmtpTransport() {
	return nodemailer.createTransport({
		host: process.env.SMTP_HOST,
		port: parseInt(process.env.SMTP_PORT || '587', 10),
		secure: false,
		auth: {
			user: process.env.SMTP_USER,
			pass: process.env.SMTP_PASS
		},
		logger: true,
		debug: true
	});
}

export type MailAttachment = {
	filename: string;
	content: Buffer;
	contentType?: string;
};

export async function sendMail(options: {
	to: string;
	subject: string;
	text: string;
	html: string;
	attachments?: MailAttachment[];
}): Promise<SMTPTransport.SentMessageInfo> {
	const transporter = createSmtpTransport();
	return transporter.sendMail({
		from: process.env.SMTP_FROM || '"MadeInDiamonds" <contact@madeindiamonds.com>',
		to: options.to,
		subject: options.subject,
		text: options.text,
		html: options.html,
		attachments: options.attachments
	});
}

export async function sendVerificationEmail(
	email: string,
	code: string
): Promise<SMTPTransport.SentMessageInfo> {
	const transporter = createSmtpTransport();

	try {
		return await transporter.sendMail({
			from: '"MadeInDiamonds" <contact@madeindiamonds.com>',
			to: email,
			subject: 'Your Verification Code',
			text: `Your verification code is: ${code}`,
			html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>MadeInDiamonds - Verification Code</title>
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
      color: #e3342f;
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
        <img src="https://example.com/logo.png" alt="MadeInDiamonds Logo" />
        <div class="container">
          <h1 class="title">Your Verification Code</h1>
          <p>Thank you for using MadeInDiamonds! Please use the verification code below to complete your signup process:</p>
          <p class="code">${code}</p>
          <p>This code will expire in 10 minutes.</p>
          <div class="footer">
            <p>If you did not request this code, please ignore this email.</p>
            <p>— The MadeInDiamonds Team</p>
          </div>
        </div>
      </td>
    </tr>
  </table>
</body>
</html>`
		});
	} catch {
		throw new Error('Email sending failed');
	}
}
