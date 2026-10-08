# Reste à faire — Boilerplate-Ecommerce-1

Backlog actionnable, mis à jour au 08/10/2026. Ce document est désormais la
**seule** source de vérité pour « qu'est-ce qu'il reste à faire ? » — il
consolide et remplace `AUDIT_TECHNIQUE.md`, `AUDIT_FONCTIONNEL.md` et
`DIAGNOSTIC_FINAL.md` (retirés du dépôt ce jour : leurs constats étaient à
95 % clos, le détail historique reste consultable via `git log`/`git show
<hash>:AUDIT_TECHNIQUE.md`). Voir §8 pour le résumé de ce qui a été traité.

Pour les sujets **réglementaires** (RGPD, droit de la consommation,
fiscalité, accessibilité), voir `CONFORMITE_ECOMMERCE.md` et
`REGISTRE_TRAITEMENTS.md` — distincts de ce document, ce sont des registres
vivants, pas un backlog technique. Pour les **idées de nouvelles features**
(rien de cassé/manquant, de futures briques), voir `FEATURE_IDEAS.md`.

Chaque entrée précise **le niveau de preuve** : ce qui a été vérifié en
exécutant le code, ce qui est estimé, et ce qui n'a jamais été regardé.

**État de référence** (vérifié le 08/10/2026) : `npm run check` 0 erreur ·
`npx vitest run` 84 tests passés / 2 skippés · `npx eslint .` 0 erreur / 12
avertissements · 62 fichiers e2e Playwright · `npx knip` 2 fichiers
potentiellement inutilisés (voir §2.4).

---

## 1. Sécurité des dépendances

**Preuve** : `npm audit` réexécuté et trié ce jour.

Avant triage : 27 vulnérabilités (6 low, 3 moderate, 14 high, 4 critical) —
dérive depuis la dernière mesure (6, toutes low/moderate), due à des CVE
publiées depuis sur des paquets déjà présents (aucune dépendance ajoutée).
`npm audit fix` (non-breaking, pas de `--force`) appliqué : **27 → 14**,
toutes les vulnérabilités **production** corrigées sauf 3 _low_ déjà
connues et non exploitables ici (voir ci-dessous).

**Restent après triage (14), aucune n'affecte le build de production** :

| Paquet                             | Sévérité          | Portée                                   | Pourquoi non corrigé                                                                                                                                                                                                                                                                           |
| ---------------------------------- | ----------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cookie` (via `@sveltejs/kit`)     | low (×3)          | prod, mais non exploitable               | Faille exige un nom/chemin/domaine de cookie issu d'une entrée utilisateur — ici toutes constantes. Corrigée seulement par `@sveltejs/kit` 3.x, encore en prerelease.                                                                                                                          |
| `tinypool`/`@vitest/mocker`        | critical/moderate | **dev uniquement** (Vitest)              | Corrigé seulement par `vitest@5` (breaking, non tenté — même classe de risque que la dérive superforms/zod déjà documentée dans `/memories/repo/boilerplate-ecommerce-notes.md`).                                                                                                              |
| `braces` (via `chokidar-cli`)      | high              | **dev uniquement** (script `jobs:watch`) | Corrigé seulement par `chokidar-cli@1.2.0` (breaking).                                                                                                                                                                                                                                         |
| `shell-quote` (via `concurrently`) | critical          | **dev uniquement** (`npm run dev`)       | `npm audit` annonce un correctif « non-breaking » mais aucune version de `concurrently`, y compris la 10.x, ne référence un `shell-quote` patché (vérifié : `shell-quote@1.9.0` figé en dépendance directe de `concurrently@latest`) — le paquet amont n'a pas encore livré de correctif réel. |

⚠️ Ne jamais lancer `npm audit fix --force` à l'aveugle : il a proposé par
le passé de redescendre `@sveltejs/kit` vers une version `0.0.x`.

**Piège connu** : certaines dépendances sont épinglées **volontairement**
sans `^` (`sveltekit-superforms`, `prisma`, `@prisma/client`) — ne pas les
laisser dériver après une manipulation npm quelconque.

---

## 2. Dette technique de fond

### 2.1 Montants monétaires en `Float`

**Preuve** : `prisma/schema.prisma` (`Product.price`, `Order.total`,
`Transaction.amount`, `GiftCard.balance`, `PromoCode.value`…).

Pas de bug activable en l'état (`money2()` encadre les calculs), mais c'est
le type de fragilité qui se paie en écarts comptables difficiles à
reconstituer. Migration vers `Decimal` ou des entiers en centimes à
planifier — **effort élevé**, touche la quasi-totalité du code commerce.

### 2.2 `findPendingOrder` trop lourde

**Preuve** : appelée par `pendingOrderHandle` à **chaque page vue** d'un
visiteur connecté (hors `/admin` et `/api`), avec `include: { product: true,
variant: true, custom: true }`.

⚠️ **Tentative d'allègement abandonnée** (mesurée : référence ~80 % de
réussite, version allégée ~29 %). La donnée traverse une frontière typée
par un simple `as`, non vérifiée par le compilateur. Une reprise doit
d'abord **typer correctement cette frontière**, pas seulement réduire le
`select`.

### 2.3 Avertissements ESLint (12, confirmés ce jour)

- 9 × `@typescript-eslint/no-explicit-any` — tous dans `Table.svelte`
  (prop `icon`), justifiés : aucun type de composant Svelte natif n'accepte
  à la fois les icônes `lucide-svelte` (classes `SvelteComponentTyped`,
  API Svelte 4) et `@lucide/svelte` (composants fonction Svelte 5) sans
  passer par `any` — tenté, abandonné (voir `/memories/repo/boilerplate-ecommerce-notes.md`).
- 3 × `svelte/no-at-html-tags` — `auth/2fa/setup/+page.svelte`,
  `blog/[slug]/+page.svelte`, `StructuredData.svelte` (JSON-LD). Sans
  risque : le contenu blog est assaini par DOMPurify côté serveur avant
  stockage (vérifié), les deux autres n'affichent jamais de contenu
  utilisateur non maîtrisé.

### 2.4 Fichiers signalés « inutilisés » par `knip` (2, intentionnels)

- `src/lib/schema/products/customSchema.ts` — remplacé par un schéma Zod
  inline dans `prendingOrder.ts` (commit `592947f`) car il valide un
  `File` alors que la donnée réelle à ce stade est une URL déjà uploadée.
  Laissé en place avec un commentaire explicatif, pas supprimé : il
  resterait pertinent si une UI d'upload direct (plutôt qu'un flux
  pré-uploadé) était ajoutée un jour.
- `src/lib/utils/shippingMethodMap.ts` — jamais tranché, à vérifier
  individuellement avant suppression (pas de risque à le laisser).

### 2.5 Arbitrage en attente — détection « nouvel appareil »

**Preuve** : lecture du code, conséquence déduite du cycle de publication
des navigateurs.

`src/lib/prisma/loginEvent/loginEvent.ts` compare le `User-Agent` **exact**.
Celui de Chrome contient la version complète, mise à jour toutes les 4
semaines environ : chaque utilisateur reçoit une alerte de sécurité quasi
mensuelle pour sa propre machine (fatigue d'alerte). Le correctif apparent
(comparer sur l'étiquette `describeUserAgent()`) est **un piège** : « Chrome
sur Windows » est le profil le plus courant, un attaquant passerait pour un
appareil connu. Décision produit, pas technique — options : statu quo,
normaliser le numéro de build en gardant la version majeure, ou croiser
appareil **et** localisation approximative.

---

## 3. Couverture e2e — trous identifiés

Audit de couverture action-par-action réalisé le 29-30/09. Statut mis à
jour ce jour (plusieurs items fermés depuis) :

| #   | Trou                                                                                                                                         | Risque    | Statut                                                                                                                                              |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `auth/reset-password/2fa` (reset de mdp sur compte 2FA actif) jamais testé bout en bout                                                      | 🔴 élevé  | ✅ **Fermé** — `e2e/auth/reset-password-2fa.spec.ts` (commit `d58788f`)                                                                             |
| 2   | `admin/returns` → `approve`, chemin de **succès** (remboursement Stripe réel) jamais vérifié                                                 | 🔴 élevé  | ⬜ Ouvert — seul l'échec est testé aujourd'hui                                                                                                      |
| 3   | `auth/settings/saved-payments` → `attach`/`setup-intent` (enregistrement carte) jamais exercé                                                | 🟡 moyen  | ⬜ Ouvert                                                                                                                                           |
| 4   | Module blog admin (création/édition d'article, taxonomies blog) — zéro couverture                                                            | 🟡 moyen  | ⬜ Ouvert                                                                                                                                           |
| 5   | `admin/products/(edit)/create` → `createProduct` — testé seulement par un spec `skip` (Cloudinary réel requis), jamais exécuté en CI         | 🟡 moyen  | ⬜ Ouvert                                                                                                                                           |
| 6   | 4 routes cron (`cleanup`, `loyalty-check`, `stock-alerts`, `invoice-email`) — authentification HTTP directe (secret/signature) jamais testée | 🟡 moyen  | 🟡 **Partiel** — `cleanup` fermé (`e2e/commerce/cleanup.spec.ts`, commit `b7cbbbb`) ; `loyalty-check`/`stock-alerts`/`invoice-email` encore ouverts |
| 7   | `admin/promo/create` → `createPromo` (argent) jamais testée par e2e                                                                          | 🟡 moyen  | ⬜ Ouvert                                                                                                                                           |
| 8   | `auth/settings` → `marketingEmailsOptIn` (RGPD opt-in) — une inversion de ce champ ne serait détectée par rien                               | 🟡 moyen  | ⬜ Ouvert                                                                                                                                           |
| 9   | `admin/products` → `createVariant`, `updateTaxonomy`/`deleteTaxonomyValue` — mutations catalogue jamais exercées                             | 🟢 faible | ⬜ Ouvert                                                                                                                                           |

### 3.1 Instabilité e2e résiduelle — surveillance, pas de chantier

Une première estimation annonçait « 1 échec sur 3 » sur
`e2e/commerce/cart.spec.ts` — mesure faussée par une bissection avec
sources éditées pendant l'exécution (HMR, serveurs résiduels). Mesures
propres : `cart.spec.ts` 3/3, suite complète sans retry. L'instabilité est
**réelle mais rare** (2 flakes isolés observés sur tout l'historique :
`checkout` IDOR, `seo` sitemap) — **un échec de ces specs doit être traité
comme une vraie régression**, pas balayé comme du bruit connu.
`e2e/support/fixtures.ts` joint déjà un « journal navigateur » (exceptions
JS, erreurs console, HTTP ≥ 400) au rapport en cas d'échec.

**Règle de méthode** : ne jamais éditer de fichier source pendant qu'une
suite e2e tourne, repartir d'un serveur propre avant toute comparaison A/B.

---

## 4. Arbitrages produit en attente — pas à moi de trancher

| #   | Décision                                                                                     | Source                       |
| --- | -------------------------------------------------------------------------------------------- | ---------------------------- |
| 1   | Arbitrage détection « nouvel appareil » (§2.5)                                               | ce document §2.5             |
| 2   | Taux de TVA réel à saisir dans `/admin/tva` (20 % attendu, à confirmer par expert-comptable) | `CONFORMITE_ECOMMERCE.md` §4 |
| 3   | Identité légale de l'entreprise à saisir dans `/admin/identite`                              | `CONFORMITE_ECOMMERCE.md` §3 |
| 4   | Désignation d'un médiateur de la consommation réel                                           | `CONFORMITE_ECOMMERCE.md` §2 |
| 5   | Durées de conservation `FraudBlock`/`AdminAuditLog` à trancher                               | `REGISTRE_TRAITEMENTS.md`    |
| 6   | Signature du registre RGPD art. 30 par le responsable de traitement réel                     | `REGISTRE_TRAITEMENTS.md`    |
| 7   | Titrage/poinçon métal précieux — saisie de données fournisseur                               | `CONFORMITE_ECOMMERCE.md` §6 |

## 5. Actions d'infrastructure — accès admin requis, hors de portée d'un agent

| #   | Action                                                                                          |
| --- | ----------------------------------------------------------------------------------------------- |
| 1   | Activer « Dependabot alerts » (Settings → Code security and analysis)                           |
| 2   | Décider d'un stockage de secrets chiffré au repos (Vault/1Password/Doppler) si l'équipe grandit |

---

## 6. À ne pas refaire — décisions déjà tranchées

| Piste                                                                 | Verdict      | Raison                                                                                                                     |
| --------------------------------------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `multipleSubmits: 'allow'` sur les formulaires 2FA/checkout/gift-card | ❌           | Casse le parcours (session réémise, double session Stripe, double carte cadeau — cf. `src/lib/invariants.test.ts` règle 3) |
| Alléger `findPendingOrder` (§2.2)                                     | ❌ en l'état | Régression mesurée (80 % → 29 %)                                                                                           |
| Rate limiting comme cause d'instabilité e2e                           | ❌ infirmé   | Zéro trace de quota dans les journaux ; fixtures isolées par `X-Forwarded-For`                                             |
| Règle lint anti-prix-TTC-en-dur dans les tests e2e                    | ❌           | Indistinguable statiquement d'un prix HT légitime ; Vitest ne scanne que `src/**`                                          |
| Masquer appareil/localisation sur « Ce n'était pas moi »              | ❌           | C'est précisément ce qui permet à l'utilisateur de juger                                                                   |
| Ré-implémenter une vraie PWA (service worker + cache offline)         | ❌           | Jamais demandée comme fonctionnalité produit ; scaffolding morte déjà retirée                                              |
| Supprimer en masse les fichiers/dépendances signalés par `knip`       | ❌           | Plusieurs sont des faux positifs transitifs — vérification individuelle obligatoire (voir §2.4)                            |

---

## 7. Garde-fous en place

`src/lib/invariants.test.ts` lit les sources pour interdire des classes de
bugs que le typage ne peut pas exprimer. **Y ajouter une règle dès qu'un
correctif repose sur « il ne faut pas oublier de… »** plutôt que sur une
contrainte de compilation. Détail des 4 règles actuelles dans
`/memories/repo/architecture.md`.

---

## 8. Historique des audits (résumé, détail dans `git log`)

Ce dépôt a traversé plusieurs vagues d'audit consécutives entre
2026-09-14 et 2026-09-30, consolidées dans ce document le 08/10/2026 (les
fichiers sources `AUDIT_TECHNIQUE.md`, `AUDIT_FONCTIONNEL.md` et
`DIAGNOSTIC_FINAL.md` sont retirés, consultables via `git log --
AUDIT_TECHNIQUE.md` puis `git show <hash>:AUDIT_TECHNIQUE.md`). Résultats :

- **14 bugs métier réels trouvés et corrigés** (`AUDIT_FONCTIONNEL.md`,
  toutes closes), dont deux avec de l'argent réel en jeu (carte
  cadeau/promo consommés avant paiement confirmé, décrément de solde non
  atomique).
- **1 faille XSS réelle corrigée** (`{@html}` non échappé dans `Table`).
- **Dette lint/CI résorbée** : `svelte-check` 132→0 erreurs, ESLint
  ~4900→12 avertissements (après exclusion du vendor `tinymce`), prettier
  383→0 fichiers non formatés, CI bloquante sur type-check + 3 règles
  ESLint de réactivité, `knip` en CI, couverture Vitest mesurée.
- **Scan de vulnérabilités remplacé** : `npm audit` cassé silencieusement
  en CI → OSV-Scanner + Dependabot, complémentaires à `npm audit` ponctuel
  (voir §1).
- **Conformité réglementaire mappée obligation par obligation** avec
  preuve de code (`CONFORMITE_ECOMMERCE.md`), registre RGPD art. 30 rédigé
  (`REGISTRE_TRAITEMENTS.md`), plusieurs vrais bugs trouvés au passage
  (prix HT affichés au lieu de TTC, suppression de commandes au lieu
  d'anonymisation, SIRET absent des factures, doublons `<meta>` SEO).
- **Documentation module ↔ code resynchronisée** (`docs/auth`,
  `docs/admin`, `docs/commerce`, `docs/products`, `docs/promo` —
  commit `330f479`).
- **6 fichiers morts confirmés supprimés** (commit `72ca0ad`).

Verdict global (inchangé depuis le dernier diagnostic) : ce n'est pas un
starter — c'est un socle qui a survécu à plusieurs vagues d'audit
consécutives et en est ressorti plus solide à chaque fois. Ce qui reste
(ce document) n'est plus du « risque caché », mais de la dette de test
ciblée (§3), un chantier structurant différé (§2.1) et des décisions qui
appartiennent à l'humain (§4-5).
