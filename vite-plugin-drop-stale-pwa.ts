import type { Plugin } from 'vite';

/**
 * Un PWA d'un autre dépôt (Lezardoises) resté accroché à localhost:2000
 * demande encore `/dev-sw.js`, `/manifest.webmanifest` et des modules `@fs`
 * hors de ce projet. Le hook client n'a pas l'occasion de tourner : le SW
 * sert une page morte avant notre JS.
 *
 * Ce middleware répond AVANT le contrôle `server.fs.allow` de Vite.
 */
const unregisterPage = `navigator.serviceWorker?.getRegistrations?.().then(async (regs) => {
	await Promise.all(regs.map((reg) => reg.unregister()));
	if ('caches' in window) {
		const keys = await caches.keys();
		await Promise.all(keys.map((key) => caches.delete(key)));
	}
	location.replace('/');
});
`;

const unregisterSw = `self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
	event.waitUntil((async () => {
		const keys = await caches.keys();
		await Promise.all(keys.map((key) => caches.delete(key)));
		await self.registration.unregister();
		const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
		for (const client of windows) client.navigate(client.url);
	})());
});
self.addEventListener('fetch', (event) => {
	event.respondWith(fetch(event.request, { cache: 'reload' }));
});
`;

export function dropStalePwa(): Plugin {
	return {
		name: 'drop-stale-pwa',
		configureServer(server) {
			server.middlewares.use((req, res, next) => {
				const url = decodeURIComponent((req.url ?? '').split('?')[0] ?? '');

				if (url === '/dev-sw.js' || url.endsWith('/dev-sw.js')) {
					res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
					res.setHeader('Service-Worker-Allowed', '/');
					res.setHeader('Cache-Control', 'no-store');
					res.end(unregisterSw);
					return;
				}

				if (url === '/manifest.webmanifest') {
					res.setHeader('Content-Type', 'application/manifest+json');
					res.setHeader('Cache-Control', 'no-store');
					res.end(
						JSON.stringify({
							name: 'boilerplate',
							start_url: '/',
							display: 'standalone'
						})
					);
					return;
				}

				const foreignFs =
					url.includes('Lezardoises') ||
					(url.includes('/@fs/') && !url.includes('boilerplate_core'));

				if (foreignFs) {
					res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
					res.setHeader('Cache-Control', 'no-store');
					res.end(unregisterPage);
					return;
				}

				next();
			});
		}
	};
}
