import net from 'node:net';

/**
 * Serveur SMTP minimal qui accepte tout et jette les messages.
 *
 * L'application envoie de vrais emails via nodemailer (vérification d'adresse,
 * réinitialisation de mot de passe). En test on ne veut ni contacter Brevo ni
 * voir l'envoi échouer, car certains chemins ne rattrapent pas l'erreur. Ce
 * puits répond correctement au dialogue SMTP pour que nodemailer considère
 * l'envoi réussi. Les codes eux-mêmes sont ensuite lus directement en base.
 */
export function startSmtpSink(port: number): Promise<{ close: () => Promise<void> }> {
	const server = net.createServer((socket) => {
		let inDataMode = false;

		const send = (line: string) => socket.write(`${line}\r\n`);

		send('220 localhost E2E SMTP sink');

		let buffer = '';
		socket.on('data', (chunk) => {
			buffer += chunk.toString('utf8');

			// En mode DATA, le message se termine par une ligne ne contenant qu'un point.
			if (inDataMode) {
				if (buffer.includes('\r\n.\r\n')) {
					inDataMode = false;
					buffer = '';
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
						// On n'annonce pas STARTTLS : nodemailer reste en clair.
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
					case 'MAIL':
					case 'RCPT':
					case 'RSET':
					case 'NOOP':
						send('250 2.1.0 Ok');
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

	return new Promise((resolve, reject) => {
		server.once('error', reject);
		server.listen(port, '127.0.0.1', () => {
			resolve({
				close: () =>
					new Promise<void>((done) => {
						server.close(() => done());
					})
			});
		});
	});
}
