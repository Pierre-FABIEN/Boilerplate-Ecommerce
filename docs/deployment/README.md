# ntDéploiement sur Vercel

Ce document couvre la mise en production sur Vercel : configuration du
projet, variables d'environnement, services tiers à provisionner et étapes
post-déploiement. Il ne documente pas une fonctionnalité retirable (pas de
`retrait.md`) : c'est un guide d'exploitation.

## Vue d'ensemble

Le projet est déjà câblé pour Vercel :

* `svelte.config.js` utilise `@sveltejs/adapter-vercel` (`runtime: 'nodejs20.x'`,
  `memory: 1024`, `maxDuration: 30`) — build/preset détectés automatiquement,
  rien à choisir manuellement dans les réglages Vercel du projet.
* `vercel.json` déclare deux Cron Jobs (`/api/jobs/cleanup` quotidien,
  `/api/jobs/cart-recovery` toutes les 30 min) — **voir la limite du plan
  Hobby ci-dessous, elle bloque le déploiement tel quel.**
* `postinstall` (`package.json`) exécute `prisma generate` et copie les
  assets TinyMCE : aucune étape manuelle nécessaire pour ces deux points au
  build.
* La CSP (`svelte.config.js` → `kit.csp`) est en `reportOnly` : elle ne
  bloque rien en production tant qu'elle n'a pas été validée (voir section
  dédiée en bas de page).

## Variables d'environnement

Base complète et commentée : [.env.example](../../.env.example). À reporter
dans Vercel → Project Settings → Environment Variables, pour les
environnements **Production** et **Preview** (voir la nuance `APP_URL` /
`VERCEL_URL` plus bas — ne pas se contenter de Production seul si des
Preview Deployments doivent aussi fonctionner).

| Variable | Obligatoire | Fournisseur | Rôle |
|----|----|----|----|
| `DATABASE_URL` | oui | Neon | connexion runtime, via le pooler (`-pooler`) |
| `DIRECT_URL` | oui | Neon | connexion directe, requise par `prisma migrate` |
| `ENCRYPTION_KEY` | oui | — | AES-256-GCM, secrets 2FA (32 octets, base64) |
| `ENCRYPTION_KEY_LEGACY` | non (tant que utile) | — | AES-128-GCM, déchiffrement des secrets 2FA `encryptionVersion=1` |
| `PUBLIC_ENV` | oui | — | `production` en prod |
| `SECRET_NAME_DATA_COOKIE` | oui | — | nom du cookie de session |
| `VITE_GOOGLE_REDIRECT_URI` | oui (si Google actif) | Google | doit pointer vers le domaine de prod |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | oui (si Google actif) | Google | OAuth |
| `STRIPE_SECRET_KEY` | oui | Stripe | paiements |
| `STRIPE_WEBHOOK_SECRET` | oui | Stripe | signature `POST /api/webhooks` |
| `VITE_STRIPE_PUBLISHABLE_KEY` | oui | Stripe | Stripe Elements / Checkout côté client |
| `SENDCLOUD_BASE_URL` | oui | Sendcloud | fixe (`https://panel.sendcloud.sc`) |
| `SENDCLOUD_PUBLIC_KEY` / `SENDCLOUD_SECRET_KEY` | oui | Sendcloud | API |
| `SENDCLOUD_INTEGRATION_ID` | oui | Sendcloud | intégration liée aux étiquettes |
| `SENDCLOUD_SENDER_ADDRESS_ID` | oui | Sendcloud | adresse d'expédition |
| `SENDCLOUD_WEBHOOK_SECRET` | oui | Sendcloud | signature `POST /api/webhooks/sendcloud` |
| `VITE_SHOP_FROM_COUNTRY` / `VITE_SHOP_FROM_POSTAL` | oui | — | calcul des frais de port |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | oui | Brevo | e-mails transactionnels |
| `SMTP_FROM` | non (valeur par défaut) | — | adresse d'expéditeur affichée |
| `ACCOUNTING_EXPORT_EMAIL` | non (sinon job muet) | — | destinataire de l'export comptable mensuel (voir [docs/admin](../admin/README.md#export-comptable-automatis%C3%A9)) |
| `DISPUTE_ALERT_EMAIL` | non (sinon log seul) | — | destinataire de l'alerte litige Stripe (voir [docs/commerce](../commerce/README.md#litiges-stripe-chargebacks)) |
| `CLOUDINARY_CLOUD_NAME` / `_API_KEY` / `_API_SECRET` | oui | Cloudinary | upload/CDN images produits |
| `PUBLIC_TINYMCE_API_KEY` | oui (si blog actif) | TinyMCE | éditeur riche `/admin/blog` |
| `SECRET_ADDRESS_SEARCH_MODE` | oui (`live` en prod) | — | `e2e` uniquement pour les tests, jamais en prod |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | recommandé | Upstash | rate-limit/cache/verrous partagés entre instances |
| `QSTASH_TOKEN` | recommandé | Upstash | file de jobs asynchrones |
| `QSTASH_CURRENT_SIGNING_KEY` / `QSTASH_NEXT_SIGNING_KEY` | avec QStash | Upstash | vérification des callbacks QStash |
| `APP_URL` | voir note ci-dessous | — | URL publique explicite (jobs, e-mails, callbacks QStash) |
| `CRON_SECRET` | si pas de QStash | — | authentifie les requêtes Vercel Cron |
| `SENTRY_DSN` / `PUBLIC_SENTRY_DSN` | recommandé | Sentry | erreurs + traces serveur/navigateur |
| `SENTRY_AUTH_TOKEN` / `SENTRY_ORG` / `SENTRY_PROJECT` | non (CI uniquement) | Sentry | upload des source maps, désactivé par défaut |

### `APP_URL` vs `VERCEL_URL` — piège spécifique à Vercel

`resolveAppUrl()` (`src/lib/server/app-url.ts`, `src/lib/server/qstash.ts`)
utilise `APP_URL` en priorité, sinon `VERCEL_URL` (fourni automatiquement par
Vercel). `VERCEL_URL` change à chaque déploiement Preview (URL unique par
déploiement) : si QStash s'appuie dessus pour rappeler l'app (schedules ou
jobs enfilés), un ancien déploiement Preview supprimé ne répond plus, et un
schedule enregistré depuis un Preview ne pointera jamais le domaine de
Production. **Toujours définir** `APP_URL` explicitement sur l'environnement
Production, avec le domaine stable (custom domain ou `*.vercel.app` de
production) — ne pas compter sur `VERCEL_URL` en dehors des Previews.

Dépendent aussi de cette résolution (`resolveAppUrlOrDefault()`, repli
`http://localhost:2000` si ni l'une ni l'autre n'est définie) les liens
inclus dans les e-mails de sécurité du compte : alerte « nouvelle
connexion détectée », confirmation de changement de mot de passe, alerte
« tentatives de connexion échouées », et le lien de révocation à distance
« Ce n'était pas moi » (`$lib/server/newDeviceAlert.ts`,
`passwordChangedAlert.ts`, `failedLoginAlert.ts`). Un `APP_URL` absent en
Preview n'empêche rien de fonctionner (repli sur `VERCEL_URL`, toujours
fourni par Vercel), mais vérifier au moins une fois qu'un de ces e-mails
contient bien un lien cliquable vers le bon domaine avant la mise en
production réelle.

## Base de données — Neon


1. Créer un projet Neon, récupérer les deux chaînes de connexion : celle avec
   `-pooler` (→ `DATABASE_URL`, utilisée au runtime par toutes les instances
   serverless) et la directe, sans `-pooler` (→ `DIRECT_URL`, requise par
   `prisma migrate`).
2. Ajouter `?connection_limit=` bas (1-3) sur `DATABASE_URL` en prod : chaque
   instance Vercel ouvre son propre pool Prisma, le pooler Neon (PgBouncer)
   multiplexe déjà les connexions — voir les commentaires dans
   [.env.example](../../.env.example).
3. Appliquer les migrations **avant** (ou pendant) le premier déploiement :

   ```bash
   DATABASE_URL=... DIRECT_URL=... npx prisma migrate deploy
   ```

   Le build Vercel (`postinstall` → `prisma generate`) ne fait **pas**
   `migrate deploy` automatiquement. Deux options :
   * lancer la commande manuellement depuis un poste avec les identifiants de
     prod avant chaque déploiement qui ajoute une migration ;
   * ou faire porter cette étape par la commande de build Vercel (Project
     Settings → Build & Development Settings → Build Command :
     `npx prisma migrate deploy && vite build`) pour l'automatiser — à activer
     sciemment, pas fait par défaut dans ce dépôt.
4. `npm run seed` (compte admin de démo + données) ne doit être lancé qu'en
   développement/démo, jamais contre la base de production — désormais
   **refusé par le script lui-même** si `VERCEL_ENV=production` (posé
   automatiquement par Vercel), sauf `FORCE_SEED=1` explicite. Ne couvre que
   le cas où le script serait, par erreur, câblé dans un déploiement — un
   lancement manuel local avec des identifiants de prod dans `.env` reste
   possible, à la seule vigilance de qui l'exécute. Le mot de passe partagé
   des comptes de démo (`DemoPass!2026` par défaut) est surchargeable via
   `SEED_DEMO_PASSWORD` si ce jeu de données doit exister ailleurs qu'un
   poste de dev local.

## Stripe


1. Dashboard Stripe → Developers → API keys → `STRIPE_SECRET_KEY` (secrète) et
   `VITE_STRIPE_PUBLISHABLE_KEY` (publique).
2. Developers → Webhooks → **Add endpoint** :
   `https://<domaine-prod>/api/webhooks`, événements couvrant au minimum les
   paiements/checkout utilisés par `src/routes/api/webhooks/+server.ts`.
3. Récupérer le secret de signature de **cet endpoint Dashboard** (pas celui
   du CLI `stripe listen`, utilisé seulement en local) → `STRIPE_WEBHOOK_SECRET`.
4. Rotation : voir [docs/secrets-rotation.md](../secrets-rotation.md#stripe_secret_key--stripe_webhook_secret).

## Sendcloud


1. Panel Sendcloud → Settings → API access : `SENDCLOUD_PUBLIC_KEY` /
   `SENDCLOUD_SECRET_KEY`.
2. Récupérer `SENDCLOUD_INTEGRATION_ID` et `SENDCLOUD_SENDER_ADDRESS_ID`
   (adresse d'expédition configurée dans Sendcloud).
3. Configurer le webhook Sendcloud vers
   `https://<domaine-prod>/api/webhooks/sendcloud`, secret →
   `SENDCLOUD_WEBHOOK_SECRET` (signature HMAC-SHA256, header
   `Sendcloud-Signature`).
4. `SENDCLOUD_BASE_URL=https://panel.sendcloud.sc` (valeur fixe, déjà dans
   `.env.example`).

## Cloudinary


1. Dashboard Cloudinary → `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`,
   `CLOUDINARY_API_SECRET`.
2. Aucune configuration webhook nécessaire : l'upload se fait depuis le
   serveur (`src/lib/server/cloudinary.ts`), pas d'upload preset non signé à
   déclarer côté Cloudinary.
3. Le domaine `res.cloudinary.com` est déjà autorisé dans la CSP
   (`img-src`) — pas de changement à faire si le cloud name change, seule
   l'URL de base des images change, pas le domaine.

## E-mails transactionnels — Brevo (SMTP)


1. Brevo → SMTP & API → récupérer l'hôte (`smtp-relay.brevo.com`), le port
   (`587`), l'identifiant SMTP et la clé API SMTP → `SMTP_HOST` / `SMTP_PORT`
   / `SMTP_USER` / `SMTP_PASS`.
2. `SMTP_FROM` optionnel (sinon adresse par défaut codée dans
   `src/lib/server/smtp-mail.ts`) — à définir avec une adresse validée côté
   Brevo (SPF/DKIM) pour éviter le spam.
3. Vérifier l'authentification du domaine d'envoi dans Brevo (SPF/DKIM/DMARC)
   avant la mise en prod : un expéditeur non authentifié atterrit en spam
   chez la plupart des fournisseurs, indépendamment de la config applicative.

## OAuth Google


1. Google Cloud Console → Identifiants OAuth 2.0 : ajouter l'URI de
   redirection de **production**
   (`https://<domaine-prod>/auth/login/google/callback`) en plus de celle de
   dev — Google refuse toute redirection non listée.
2. `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, et
   `VITE_GOOGLE_REDIRECT_URI` alignée sur le domaine de prod (variable
   `VITE_*` : embarquée au build, donc spécifique à chaque environnement —
   Preview et Production doivent avoir des valeurs cohérentes avec leur
   propre domaine si Google Login doit fonctionner en Preview aussi).

## Upstash Redis (rate-limit, cache, verrous)

Optionnel mais recommandé en production : sans ces variables,
`src/lib/server/redis.ts` retombe sur un état en mémoire **par instance**
serverless, donc non partagé — rate-limit et verrous d'idempotence
deviennent inefficaces dès qu'il y a plus d'une instance active.


1. Créer une base Upstash Redis (REST API activée).
2. `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`.

## Upstash QStash (jobs asynchrones)

Optionnel : sans `QSTASH_TOKEN`, les jobs (facture, Sendcloud post-paiement,
relance panier, notification réassort, récompense parrainage) s'exécutent en
synchrone dans la requête qui les déclenche, comme avant l'introduction de la
queue — fonctionnel, mais alloue plus de temps de fonction par requête.


1. Upstash → QStash → récupérer `QSTASH_TOKEN`,
   `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY`.
2. Définir `APP_URL` (voir note plus haut) : QStash doit rappeler une URL
   publique stable, jamais `VERCEL_URL` d'un Preview éphémère.
3. Après le déploiement, enregistrer les schedules récurrents (idempotent,
   à relancer seulement si l'URL publique change) :

   ```bash
   APP_URL=https://<domaine-prod> QSTASH_TOKEN=... npm run jobs:register-cleanup-schedule
   APP_URL=https://<domaine-prod> QSTASH_TOKEN=... npm run jobs:register-cart-recovery-schedule
   ```

### Vercel Cron vs QStash — limite du plan Hobby

`vercel.json` déclare `/api/jobs/cart-recovery` toutes les 30 minutes
(`*/30 * * * *`). **Le plan Vercel Hobby limite les Cron Jobs à une exécution
par jour** : ce fichier tel quel fait échouer le déploiement sur un projet
Hobby (`Hobby accounts are limited to daily cron jobs`). `/api/jobs/cleanup`
(quotidien) reste compatible Hobby.

Deux options, à choisir selon le plan Vercel du projet :

* **Plan Pro/Enterprise** : aucun changement nécessaire, `*/30 * * * *`
  fonctionne tel quel.
* **Plan Hobby** : soit passer par QStash pour la relance panier (schedule
  ci-dessus, qui n'est pas soumis à cette limite) et retirer/espacer l'entrée
  `cart-recovery` de `vercel.json` (ou la passer à une fréquence quotidienne
  en filet de sécurité), soit upgrader le plan.

Chaque route de job accepte les deux déclencheurs (signature QStash **ou**
`Authorization: Bearer $CRON_SECRET` de Vercel Cron) — les deux mécanismes
peuvent cohabiter sans changement de code, seule la déclaration
`vercel.json` est contrainte par le plan.

## Sentry (observabilité, plan gratuit compatible)


1. Créer un projet Sentry (JavaScript/SvelteKit).
2. `SENTRY_DSN` (serveur, `src/hooks.server.ts`) et `PUBLIC_SENTRY_DSN`
   (navigateur, `src/hooks.client.ts`) — peuvent provenir du même projet.
3. Optionnel : `SENTRY_AUTH_TOKEN` / `SENTRY_ORG` / `SENTRY_PROJECT` pour
   l'upload des source maps en CI (désactivé par défaut dans
   `vite.config.ts`, à activer explicitement si besoin).
4. Sans DSN configuré, le SDK reste un no-op documenté (aucune erreur, aucun
   appel réseau) — safe de déployer sans, pour ajouter l'observabilité plus
   tard.

## TinyMCE (éditeur de blog admin)

`PUBLIC_TINYMCE_API_KEY` (clé gratuite TinyMCE Cloud) — nécessaire seulement
si le module blog est actif (`docs/blog/README.md`). Le script
`postinstall` copie déjà les assets TinyMCE self-hébergés
(`scripts/copy-tinymce.mjs`), aucune étape manuelle supplémentaire.

## CSP — passer de `reportOnly` à bloquant

La CSP (`svelte.config.js` → `kit.csp`) est actuellement en `reportOnly` :
elle journalise les violations sur `POST /api/csp-report` sans rien bloquer.
**Ne pas la basculer en bloquante à l'aveugle** : une politique mal calibrée
casse silencieusement Stripe Checkout ou l'éditeur TinyMCE, sans erreur
serveur visible.

Avant de la rendre bloquante (`reportOnly` → `directives` dans
`svelte.config.js`) :


1. Déployer en `reportOnly` (déjà le cas), observer `/api/csp-report`
   (logs applicatifs) sur un cycle complet : navigation catalogue, checkout
   jusqu'au paiement Stripe, éditeur TinyMCE (`/admin/blog`), setup 2FA (QR
   code `data:`, déjà couvert par `img-src`).
2. Ajouter toute directive manquante détectée par les rapports (nouveau
   fournisseur = nouveau domaine à whitelister, ex. si Cloudinary est
   remplacé par un autre CDN).
3. Basculer, redéployer, revérifier le même cycle sans blocage réel.

## Checklist post-déploiement


1. `npx prisma migrate deploy` exécuté contre la base de prod (voir section
   Neon) — vérifier `npx prisma migrate status`.
2. Toutes les variables d'environnement de la table ci-dessus renseignées
   sur Vercel (Production **et** Preview si utilisées).
3. Webhooks configurés côté fournisseurs :
   `https://<domaine-prod>/api/webhooks` (Stripe),
   `https://<domaine-prod>/api/webhooks/sendcloud` (Sendcloud),
   `https://<domaine-prod>/auth/login/google/callback` (Google, redirect URI).
4. Si QStash configuré : schedules enregistrés
   (`npm run jobs:register-cleanup-schedule`,
   `npm run jobs:register-cart-recovery-schedule`) avec `APP_URL` pointant le
   domaine de prod, pas un Preview.
5. Si QStash **non** configuré : plan Vercel compatible avec la fréquence des
   Cron Jobs de `vercel.json` (voir section dédiée) et `CRON_SECRET` défini.
6. Modules optionnels : chaque module active son propre flag dans
   `/admin/settings` (voir [docs/admin/README.md](../admin/README.md)) — les
   activer une fois les services tiers correspondants configurés, pas avant
   (ex. activer les alertes réassort seulement après avoir vérifié que le SMTP
   Brevo fonctionne, activer le programme de fidélité seulement après avoir
   vérifié Stripe).
7. Smoke test manuel : inscription + vérification e-mail, connexion Google,
   ajout panier → checkout → paiement test Stripe → réception facture,
   upload d'image produit (Cloudinary), création d'étiquette Sendcloud.
8. Sécurité du compte (aucune config supplémentaire, dépend seulement de
   SMTP + `APP_URL` déjà vérifiés ci-dessus) : se connecter depuis un
   second navigateur/appareil → e-mail « nouvelle connexion détectée » reçu
   avec un lien « Ce n'était pas moi » cliquable ; changer son mot de passe
   depuis `/auth/settings` → e-mail de confirmation reçu ; vérifier que
   `/auth/settings/sessions` liste bien la session et son historique.


