# Politique de sécurité

## Signaler une vulnérabilité

Si vous découvrez une faille de sécurité dans ce projet, merci de **ne pas**
ouvrir d'issue publique. Contactez directement le mainteneur (voir profil
GitHub du dépôt) avec :

- Une description de la vulnérabilité et de son impact potentiel.
- Les étapes pour la reproduire.
- Toute preuve de concept, si applicable.

Un accusé de réception est visé sous 5 jours ouvrés, avec un premier retour
sur la sévérité et le correctif envisagé sous 15 jours ouvrés.

## Périmètre

Ce dépôt est un boilerplate e-commerce (SvelteKit/Prisma/Stripe). Sont
notamment dans le périmètre : authentification (`src/lib/lucia/`), paiement
et webhooks (`src/lib/commerce/`, `src/routes/api/webhooks/`), et toute
route `/admin/**`. Voir [RESTE_A_FAIRE.md](./RESTE_A_FAIRE.md) pour
l'état de sécurité connu et les points déjà identifiés.

## Bonnes pratiques déjà en place

- Chiffrement AES-256-GCM (avec migration depuis un legacy AES-128-GCM,
  voir `src/lib/lucia/encryption.ts`).
- Rate limiting (Upstash Redis avec repli mémoire).
- CSP, en cours de bascule report-only → bloquant (voir `svelte.config.js`).
- Rotation des secrets documentée : [docs/secrets-rotation.md](./docs/secrets-rotation.md).
