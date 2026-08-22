import net from 'node:net';
import http from 'node:http';

export type CapturedEmail = {
	to: string[];
	raw: string;
	receivedAt: number;
};

/**
 * Boîte de réception de test : un serveur SMTP minimal qui accepte tout et
 * conserve les messages, doublé d'une petite API HTTP pour les relire.
 *
 * L'application envoie de vrais emails via nodemailer (code de vérification,
 * réinitialisation de mot de passe). Ce puits évite de contacter Brevo tout en
 * laissant l'envoi réussir, et permet aux tests de récupérer le code dans le
 * message effectivement reçu plutôt que dans la base.
 *
 * L'API HTTP est nécessaire parce que les tests Playwright tournent dans des
 * processus distincts de celui qui démarre le puits : la mémoire n'est pas
 * partagée.
 */
export function startSmtpSink(smtpPort: number, httpPort: number) {
	const messages: CapturedEmail[] = [];

	const smtpServer = net.createServer((socket) => {
		let inDataMode = false;
		let buffer = '';
		let recipients: string[] = [];

		const send = (line: string) => socket.write(`${line}\r\n`);
		send('220 localhost E2E SMTP sink');

		socket.on('data', (chunk) => {
			buffer += chunk.toString('utf8');

			if (inDataMode) {
				const terminator = buffer.indexOf('\r\n.\r\n');
				if (terminator !== -1) {
					messages.push({
						to: recipients,
						raw: buffer.slice(0, terminator),
						receivedAt: Date.now()
					});
					recipients = [];
					inDataMode = false;
					buffer = buffer.slice(terminator + 5);
					send('250 2.0.0 Message accepted');
				}
				return;
			}

			let newlineIndex: number;
			while ((newlineIndex = buffer.indexOf('\r\n')) !== -1) {
				const command = buffer.slice(0, newlineIndex);
				buffer = buffer.slice(newlineIndex + 2);
				const verb = command.split(' ')[0].toUpperCase();

				switch (verb) {
					case 'EHLO':
						// STARTTLS n'est pas annoncé : nodemailer reste en clair.
						send('250-localhost');
						send('250-AUTH PLAIN LOGIN');
						send('250 8BITMIME');
						break;
					case 'HELO':
						send('250 localhost');
						break;
					case 'AUTH':
						send('235 2.7.0 Authentication successful');
						break;
					case 'RCPT': {
						const match = command.match(/<([^>]+)>/);
						if (match) recipients.push(match[1].toLowerCase());
						send('250 2.1.5 Ok');
						break;
					}
					case 'MAIL':
					case 'NOOP':
						send('250 2.1.0 Ok');
						break;
					case 'RSET':
						recipients = [];
						send('250 2.0.0 Ok');
						break;
					case 'DATA':
						inDataMode = true;
						buffer = '';
						send('354 End data with <CR><LF>.<CR><LF>');
						return;
					case 'QUIT':
						send('221 2.0.0 Bye');
						socket.end();
						return;
					default:
						send('250 2.0.0 Ok');
				}
			}
		});

		socket.on('error', () => socket.destroy());
	});

	const httpServer = http.createServer((request, response) => {
		if (request.method === 'DELETE') {
			messages.length = 0;
			response.writeHead(204).end();
			return;
		}
		response.writeHead(200, { 'content-type': 'application/json' });
		response.end(JSON.stringify(messages));
	});

	const listen = (server: net.Server | http.Server, port: number) =>
		new Promise<void>((resolve, reject) => {
			server.once('error', reject);
			server.listen(port, '127.0.0.1', () => resolve());
		});

	return Promise.all([listen(smtpServer, smtpPort), listen(httpServer, httpPort)]).then(() => ({
		close: async () => {
			await new Promise<void>((done) => smtpServer.close(() => done()));
			await new Promise<void>((done) => httpServer.close(() => done()));
		}
	}));
}
