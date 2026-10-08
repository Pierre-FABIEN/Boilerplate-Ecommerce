#!/usr/bin/env node
/**
 * Génère l'image Open Graph/Twitter par défaut (`static/og-default.jpg`,
 * 1200×630 — taille standard) via Playwright (déjà une dépendance e2e,
 * pas de package supplémentaire). Simple carte typographique tant
 * qu'aucun visuel de marque réel (photo produit, logo) n'est fourni par
 * l'entreprise — voir RESTE_A_FAIRE.md, section SEO.
 *
 * Relancer après tout changement d'identité de marque :
 *   node scripts/generate-og-image.mjs
 */
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUTPUT = path.join(
	path.dirname(fileURLToPath(import.meta.url)),
	'..',
	'static',
	'og-default.jpg'
);

const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link
	href="https://fonts.googleapis.com/css2?family=Open+Sans:ital,wght@0,400;0,600;1,800&family=Raleway:wght@300;400&display=swap"
	rel="stylesheet"
/>
<style>
	* { margin: 0; padding: 0; box-sizing: border-box; }
	html, body { width: 1200px; height: 630px; }
	body {
		background: radial-gradient(circle at 30% 20%, #1c1c1c 0%, #0a0a0a 65%);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		font-family: 'Open Sans', sans-serif;
	}
	.wordmark {
		font-family: 'Open Sans', sans-serif;
		font-weight: 800;
		font-style: italic;
		text-transform: uppercase;
		font-size: 84px;
		letter-spacing: 0.02em;
		color: #f5f0e6;
	}
	.rule {
		width: 90px;
		height: 2px;
		background: #c9a86a;
		margin: 28px 0;
	}
	.tagline {
		font-family: 'Raleway', sans-serif;
		font-weight: 300;
		font-size: 30px;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: #c9a86a;
	}
</style>
</head>
<body>
	<div class="wordmark">MadeInDiamonds</div>
	<div class="rule"></div>
	<div class="tagline">Joaillerie en ligne</div>
</body>
</html>`;

await mkdir(path.dirname(OUTPUT), { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html, { waitUntil: 'networkidle' });
await page.screenshot({ path: OUTPUT, type: 'jpeg', quality: 92 });
await browser.close();

console.log(`Image générée : ${OUTPUT}`);
