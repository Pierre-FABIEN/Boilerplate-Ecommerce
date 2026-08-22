#!/usr/bin/env node
/**
 * Rassemble les vidéos Playwright dans `e2e-videos/` sous des noms lisibles.
 *
 * Playwright les enregistre sous `test-results/<nom-tronqué>/video.webm`, ce qui
 * est peu pratique à retrouver et à partager.
 */
import { readdir, mkdir, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const SOURCE = 'test-results';
const TARGET = 'e2e-videos';

if (!existsSync(SOURCE)) {
	console.log(`Aucun dossier ${SOURCE} : lancez d'abord les tests.`);
	process.exit(0);
}

await mkdir(TARGET, { recursive: true });

const entries = await readdir(SOURCE, { withFileTypes: true });
let copied = 0;

for (const entry of entries) {
	if (!entry.isDirectory()) continue;

	const video = path.join(SOURCE, entry.name, 'video.webm');
	if (!existsSync(video)) continue;

	// Playwright tronque le milieu des noms longs et y insère un hachage. Le
	// parcours complet étant l'enregistrement destiné à être partagé, il reçoit
	// un nom stable ; les autres sont simplement nettoyés.
	const readable = entry.name.startsWith('auth-journey')
		? 'parcours-authentification-complet.webm'
		: `${entry.name.replace(/-chromium$/, '').replace(/-[0-9a-f]{5}-/, '-')}.webm`;

	await copyFile(video, path.join(TARGET, readable));
	copied += 1;
}

console.log(
	copied === 0
		? 'Aucune vidéo trouvée (activez E2E_VIDEO=1).'
		: `${copied} vidéo(s) copiée(s) dans ${TARGET}/`
);
