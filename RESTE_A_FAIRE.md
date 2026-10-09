# État du projet & backlog — Boilerplate-Ecommerce-1

Document unique, mis à jour au 08/10/2026, qui consolide **tout** ce qui
concerne l'état du projet au-delà du code lui-même : backlog technique,
idées de futures features, conformité réglementaire, registre RGPD. Avant
ce jour, cette information était répartie sur 6 fichiers séparés
(`AUDIT_TECHNIQUE.md`, `AUDIT_FONCTIONNEL.md`, `DIAGNOSTIC_FINAL.md`,
`FEATURE_IDEAS.md`, `CONFORMITE_ECOMMERCE.md`, `REGISTRE_TRAITEMENTS.md`)
— les 3 premiers étaient à 95 % historique/résolu, les 3 derniers se
chevauchaient (une idée de feature qui rejoint une obligation légale, une
décision produit qui apparaît à la fois dans le backlog technique et la
conformité). Tout l'historique détaillé reste consultable via `git log`/
`git show <hash>:<nom-de-fichier>`.

**Ceci n'est pas un avis juridique** (Partie C) : à faire valider par un
avocat/expert-comptable avant toute mise en production réelle.

**État de référence** (vérifié le 08/10/2026) : `npm run check` 0 erreur ·
`npx vitest run` 94 tests passés / 2 skippés · `npx eslint .` 0 erreur / 12
avertissements · 64 fichiers e2e Playwright · `npx knip` 2 fichiers
potentiellement inutilisés (voir [A.2.4](#a24-fichiers-signal%C3%A9s-inutilis%C3%A9s-par-knip-2-intentionnels)).

## Priorités — hiérarchie de criticité (code, logique, tests, doc)

Portée volontairement restreinte à ce qui touche le code, la logique
métier, les tests et la documentation technique (Partie A). Les
arbitrages légaux/business/RGPD (identité de l'entreprise, TVA, médiateur
de la consommation, titrage métaux précieux, signature du registre RGPD…)
relèvent de la mise en production et sont déjà couverts par un document
dédié — ils ne sont pas repris ici.

### 🔴 Critique — code sensible à l'argent/la sécurité, zéro filet de test

Plus aucun item ouvert dans cette catégorie.

📌 _Décision_ — `admin/returns` → `approve`, chemin de **succès** (remboursement Stripe réel) : reste **volontairement non testé en e2e** (limitation technique de Stripe Checkout, pas un oubli) — voir [A.3 #2](#a3-couverture-e2e--trous-identifi%C3%A9s) et la justification détaillée en [A.3.2](#a32-admin-returns--succès-remboursement-stripe--limitation-acceptée-pas-un-chantier).

✅ _Fermé_ — `admin/promo/create` testé par e2e, bug « actif par défaut » corrigé au passage (commit `7662986`), voir [A.3 #7](#a3-couverture-e2e--trous-identifi%C3%A9s).

✅ _Fermé_ — garde d'authentification des routes cron `loyalty-check`/`stock-alerts`/`invoice-email` (commit `df7c32e`), voir [A.3 #6](#a3-couverture-e2e--trous-identifi%C3%A9s).

### 🟠 Élevé — dette/logique à trancher, risque de régression ou de fragilité

Plus aucun item ouvert dans cette catégorie.

✅ _Fermé_ — `findPendingOrder` : frontière `as` typée correctement (commit `9722f55`), voir [A.2.2](#a22-findpendingorder-trop-lourde).

✅ _Fermé_ — détection « nouvel appareil » normalisée sur OS + navigateur + version majeure (commit `1f45183`), voir [A.2.5](#a25-arbitrage-en-attente--d%C3%A9tection-nouvel-appareil).

✅ _Fermé_ — `saved-payments` `?/attach` testé via un vrai `PaymentMethod` Stripe test-mode (`pm_card_visa`, commit `4277350`), voir [A.3 #3](#a3-couverture-e2e--trous-identifi%C3%A9s).

✅ _Fermé_ — blog admin `?/createPost` testé via POST direct, sans TinyMCE (commit `2f95349`), voir [A.3 #4](#a3-couverture-e2e--trous-identifi%C3%A9s).

✅ _Fermé_ — `marketingEmailsOptIn` testé (anonyme, valeur par défaut, bascule, revert — commit `9bffbcd`), voir [A.3 #8](#a3-couverture-e2e--trous-identifi%C3%A9s).

✅ _Fermé_ — `createProduct` couvert par un test unitaire Vitest, Cloudinary et Prisma stubés (commit `17cf87d`), voir [A.3 #5](#a3-couverture-e2e--trous-identifi%C3%A9s).

### 🟡 Moyen — dette réelle, pas de risque immédiat

| #   | Sujet                                                               | Détail                                                                                                                        |
| --- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 1   | Migration des montants `Float` → `Decimal`/centimes                 | Gros chantier, aucun bug actif aujourd'hui (`money2()` encadre les calculs) — [A.2.1](#a21-montants-mon%C3%A9taires-en-float) |
| 2   | 14 vulnérabilités npm restantes (dev-only/non exploitables en prod) | À resurveiller périodiquement, pas d'action immédiate — [A.1](#a1-s%C3%A9curit%C3%A9-des-d%C3%A9pendances)                    |

✅ _Fermé_ — `createVariant` (formulaire admin) et `deleteTaxonomyValue` (suppression explicite d'une valeur) testés (commits `6a5c25c`, `ee3a2bc`), voir [A.3 #9](#a3-couverture-e2e--trous-identifi%C3%A9s).

### 🟢 Faible — déjà tranché, aucune action attendue

- Avertissements ESLint (12) — justifiés (icônes `Table.svelte`, `@html` maîtrisé) — [A.2.3](#a23-avertissements-eslint-12-confirm%C3%A9s-le-08102026).
- Fichiers signalés par `knip` (2) — conservés volontairement, raison documentée — [A.2.4](#a24-fichiers-signal%C3%A9s-inutilis%C3%A9s-par-knip-2-intentionnels).
- Aucune dette documentaire identifiée dans le code/tests actuellement (garde-fous `A.7` et historique `A.8` à jour).

## Sommaire

- [Priorités — hiérarchie de criticité (code, logique, tests, doc)](#priorit%C3%A9s--hi%C3%A9rarchie-de-criticit%C3%A9-code-logique-tests-doc)
- [Partie A — Reste à faire (dette technique)](#partie-a--reste-%C3%A0-faire-dette-technique)
  - [A.1 Sécurité des dépendances](#a1-s%C3%A9curit%C3%A9-des-d%C3%A9pendances)
  - [A.2 Dette technique de fond](#a2-dette-technique-de-fond)
  - [A.3 Couverture e2e](#a3-couverture-e2e--trous-identifi%C3%A9s)
  - [A.4 Arbitrages produit en attente](#a4-arbitrages-produit-en-attente--pas-%C3%A0-moi-de-trancher)
  - [A.5 Actions d'infrastructure](#a5-actions-dinfrastructure--acc%C3%A8s-admin-requis)
  - [A.6 À ne pas refaire](#a6-%C3%A0-ne-pas-refaire--d%C3%A9cisions-d%C3%A9j%C3%A0-tranch%C3%A9es)
  - [A.7 Garde-fous en place](#a7-garde-fous-en-place)
  - [A.8 Historique des audits](#a8-historique-des-audits-r%C3%A9sum%C3%A9-d%C3%A9tail-dans-git-log)
- [Partie B — Idées de features futures](#partie-b--id%C3%A9es-de-features-futures)
- [Partie C — Conformité réglementaire](#partie-c--conformit%C3%A9-r%C3%A9glementaire-e-commerce)
  - [C.1 RGPD / CNIL](#c1-protection-des-donn%C3%A9es-personnelles-rgpd--cnil)
  - [C.2 Droit de la consommation](#c2-droit-de-la-consommation--vente-%C3%A0-distance)
  - [C.3 Mentions légales (LCEN)](#c3-mentions-l%C3%A9gales--identification-lcen)
  - [C.4 Facturation, prix & fiscalité](#c4-facturation-prix--fiscalit%C3%A9)
  - [C.5 Paiement en ligne](#c5-paiement-en-ligne)
  - [C.6 Métaux précieux & diamants](#c6-sp%C3%A9cifique-m%C3%A9taux-pr%C3%A9cieux--diamants)
  - [C.7 Accessibilité numérique](#c7-accessibilit%C3%A9-num%C3%A9rique)
- [Partie D — Registre des traitements (RGPD art. 30)](#partie-d--registre-des-traitements-rgpd-art-30)

---

# Partie A — Reste à faire (dette technique)

## A.1 Sécurité des dépendances

**Preuve** : `npm audit` réexécuté et trié le 08/10/2026.

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
laisser dériver après une manipulation npm quelconque. **Autre piège
vérifié le 08/10/2026** : un `npm audit fix` peut bumper en transitif des
outils de lint (`typescript-eslint` 8.41→8.71 dans ce dépôt) et faire
apparaître de **nouvelles erreurs ESLint bloquantes** sur du code non
touché — toujours relancer `npx eslint .` (pas seulement `npm run check`/vitest) après un audit fix.

## A.2 Dette technique de fond

### A.2.1 Montants monétaires en `Float`

Pas de bug activable en l'état (`money2()`, `src/lib/server/invoice/totals.ts`,
encadre les calculs d'arrondi), mais c'est le type de fragilité qui se paie
en écarts comptables difficiles à reconstituer (`Float` = IEEE 754, pas de
garantie de représentation exacte des centimes). Inventaire et
recommandation ci-dessous — **pas de migration mécanique dans cette
passe**, chantier isolé qui requiert un accord explicite avant de commencer
(voir note de fin de section).

**Inventaire exhaustif des champs `Float` (`prisma/schema.prisma`, 35
occurrences, 08/10/2026)** :

Champs monétaires (candidats réels à la migration) :

| Modèle           | Champs                                                                                              |
| ---------------- | --------------------------------------------------------------------------------------------------- |
| `Order`          | `subtotal`, `tax`, `total`, `discountAmount`, `giftCardAmount`, `shippingCost`                      |
| `OrderItem`      | `price`                                                                                             |
| `ProductVariant` | `price`                                                                                             |
| `Product`        | `price`, `compareAtPrice`                                                                           |
| `Transaction`    | `amount`, `disputeAmount`, `shippingCost`, `subtotalHt`, `taxAmount`, `discountAmount`              |
| `PromoCode`      | `value` (⚠️ double sens : `FIXED` = montant €, `PERCENTAGE` = ratio — cf. `PromoType`), `minAmount` |
| `GiftCard`       | `initialValue`, `balance`                                                                           |
| `WishlistItem`   | `lastNotifiedPrice`                                                                                 |

Champs `Float` hors périmètre monétaire (dimensions physiques, taux) —
**volontairement exclus** de la migration candidate, le risque d'erreur
d'arrondi y est sans impact comptable :

| Modèle          | Champs                                                                                  | Nature                               |
| --------------- | --------------------------------------------------------------------------------------- | ------------------------------------ |
| `Product`       | `weight`, `length`, `width`, `height`                                                   | dimensions colis (kg/cm)             |
| `Transaction`   | `package_length`, `package_width`, `package_height`, `package_weight`, `package_volume` | dimensions colis Sendcloud           |
| `Taxonomy`      | `numberMin`, `numberMax`                                                                | bornes de saisie taxonomie générique |
| `Transaction`   | `taxRate`                                                                               | taux TVA figé à la facture (%)       |
| `StoreSettings` | `vatRate`                                                                               | taux TVA courant (fraction)          |

**Ampleur mesurée** : recherche des usages directs (`.price`, `.total`,
`.amount`, `.balance`, `.discountAmount`, `.initialValue`…) → **~320
occurrences dans 108 fichiers** de `src/` (composants Svelte, actions de
formulaire, jobs planifiés, webhooks Stripe/Sendcloud, PDF facture/avoir,
export comptable, store panier côté client). Confirme le constat déjà
noté : ce n'est pas un changement localisé, ça traverse la quasi-totalité
du code commerce (checkout, panier, factures, exports, admin ventes,
cartes cadeaux, promo).

**Recommandation technique** : `Decimal` Prisma (`decimal.js` en JS) plutôt
que des entiers en centimes.

- Avantage : changement de schéma localisé (type de colonne), pas de
  renommage de champs ni de facteur ×100/÷100 à injecter partout.
- Coût : le client Prisma renvoie des objets `Decimal` (pas des `number`)
  partout où ces champs sont lus — impact en cascade :
  - **Arithmétique** : `money2()` et tout calcul direct (`cartStore.ts`,
    `totals.ts`, `checkout.ts`, `prendingOrder.ts`…) doivent utiliser les
    méthodes `Decimal` (`.plus()`, `.times()`, `.toFixed(2)`) au lieu des
    opérateurs natifs `+`/`*`.
  - **Sérialisation** : tout retour JSON (actions SvelteKit, `+page.server.ts`
    `load()`, API routes) doit convertir explicitement en `number`/`string`
    (`.toNumber()`) — un `Decimal` non converti casse la sérialisation
    SvelteKit par défaut.
  - **Validation Zod** : les schémas (`productSchema.ts`, `promoSchema.ts`,
    `giftCardSchema.ts`…) utilisent `z.coerce.number()` pour les champs
    monétaires côté formulaire (texte → number) — ça reste correct en
    entrée (l'utilisateur saisit toujours un nombre), seule la sortie
    Prisma change de type.
  - **Stripe** : les montants envoyés à l'API Stripe sont déjà des entiers
    en centimes (`Math.round(amount * 100)`, ex. `admin/returns/+page.server.ts`
    ligne 95) — compatible avec `Decimal`, juste remplacer `amount * 100` par
    `amount.times(100).toNumber()`.
  - **Tests** : tous les tests unitaires/e2e qui comparent un montant à un
    `number` littéral (`expect(order.total).toBe(42.5)`) doivent comparer
    au résultat `.toNumber()` ou utiliser un helper de comparaison dédié.
- Alternative entiers-centimes écartée en premier choix : demande de
  renommer `price` → `priceCents` (ou equivalent) partout — change la
  signature de beaucoup plus de fonctions/schémas que `Decimal`, pour un
  gain de simplicité marginal vu que Stripe impose déjà cette conversion
  localement aux points de sortie.

📌 **Point de validation avant toute mécanique** : ce chantier n'est **pas
lancé** dans cette passe. Avant de commencer la migration réelle (schéma +
tous les fichiers consommateurs + suite complète e2e commerce), il faut un
accord explicite de l'utilisateur — ça touche l'affichage des prix dans
toute l'application et les écritures comptables (factures, avoirs,
exports), pas un détail technique isolé.

### A.2.2 `findPendingOrder` trop lourde

**Preuve** : appelée par `pendingOrderHandle` à **chaque page vue** d'un
visiteur connecté (hors `/admin` et `/api`), avec `include: { product: true, variant: true, custom: true }`.

⚠️ **Tentative d'allègement abandonnée** (mesurée : référence \~80 % de
réussite, version allégée \~29 %). La donnée traversait une frontière
typée par un simple `as`, non vérifiée par le compilateur.

✅ **Frontière typée correctement** (commit `9722f55`) : `App.Locals.pendingOrder`
dans `src/app.d.ts` utilise désormais `Awaited<ReturnType<typeof findPendingOrder>>`
(import `type` top-level, pas de type-query inline dans `declare global` —
voir piège documenté dans `/memories/repo/`), les deux casts `as` dans
`checkout/+page.server.ts` et `+layout.server.ts` sont supprimés. Validé
par `npm run check` (0 erreur) et 4/4 e2e commerce (`cart`, `checkout`,
`quantity`, `fraud-detection`). Une **reprise de l'allègement du `select`**
reste à faire séparément, mais peut maintenant s'appuyer sur un
compilateur qui vérifiera réellement la frontière.

### A.2.3 Avertissements ESLint (12, confirmés le 08/10/2026)

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

### A.2.4 Fichiers signalés « inutilisés » par `knip` (2, intentionnels)

- `src/lib/schema/products/customSchema.ts` — remplacé par un schéma Zod
  inline dans `prendingOrder.ts` (commit `592947f`) car il valide un
  `File` alors que la donnée réelle à ce stade est une URL déjà uploadée.
  Laissé en place avec un commentaire explicatif, pas supprimé : il
  resterait pertinent si une UI d'upload direct (plutôt qu'un flux
  pré-uploadé) était ajoutée un jour.
- `src/lib/utils/shippingMethodMap.ts` — jamais tranché, à vérifier
  individuellement avant suppression (pas de risque à le laisser).

### A.2.5 Arbitrage en attente — détection « nouvel appareil »

**Preuve** : lecture du code, conséquence déduite du cycle de publication
des navigateurs.

`src/lib/prisma/loginEvent/loginEvent.ts` comparait le `User-Agent`
**exact**. Celui de Chrome contient la version complète, mise à jour toutes
les 4 semaines environ : chaque utilisateur recevait une alerte de
sécurité quasi mensuelle pour sa propre machine (fatigue d'alerte). Le
correctif apparent (comparer sur l'étiquette `describeUserAgent()`) était
**un piège** : « Chrome sur Windows » est le profil le plus courant, un
attaquant passerait pour un appareil connu.

✅ **Tranché par l'utilisateur et implémenté** (commit `1f45183`) :
normalisation sur OS + navigateur + **version majeure** uniquement
(`normalizeDeviceFingerprint()`, `src/lib/lucia/deviceLabel.ts`), ni statu
quo ni croisement de localisation. Un bump de version mineure/build ne
déclenche plus d'alerte ; un changement d'OS ou de navigateur, si. Tests
unitaires étendus (`loginEvent.test.ts`) et `e2e/auth/new-device-alert.spec.ts`
revérifié, toujours vert.

## A.3 Couverture e2e — trous identifiés

Audit de couverture action-par-action réalisé le 29-30/09. Statut mis à
jour le 08/10/2026 (plusieurs items fermés depuis) :

| #   | Trou                                                                                                                                         | Risque    | Statut                                                                                                                                                                                                                                                                                                                                                                                         |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `auth/reset-password/2fa` (reset de mdp sur compte 2FA actif) jamais testé bout en bout                                                      | 🔴 élevé  | ✅ **Fermé** — `e2e/auth/reset-password-2fa.spec.ts` (commit `d58788f`)                                                                                                                                                                                                                                                                                                                        |
| 2   | `admin/returns` → `approve`, chemin de **succès** (remboursement Stripe réel) jamais vérifié                                                 | 🔴 élevé  | 📌 Accepté — limitation technique, voir [A.3.2](#a32-admin-returns--succès-remboursement-stripe--limitation-acceptée-pas-un-chantier)                                                                                                                                                                                                                                                          |
| 3   | `auth/settings/saved-payments` → `attach`/`setup-intent` (enregistrement carte) jamais exercé                                                | 🟡 moyen  | ✅ **Fermé** — `e2e/commerce/saved-payments.spec.ts`, test « ajout d'une carte (?/attach) via un PaymentMethod Stripe réel » (commit `4277350`) : `pm_card_visa` (jeton de test Stripe réutilisable) se résout en un vrai `PaymentMethod`, sans Stripe Elements ni navigateur Stripe.js (`?/attach` ne fait jamais `confirmCardSetup` côté serveur)                                            |
| 4   | Module blog admin (création/édition d'article, taxonomies blog) — zéro couverture                                                            | 🟡 moyen  | ✅ **Fermé** — `e2e/blog/admin.spec.ts`, test « création (?/createPost) : slug unique, taxonomies et statut publié » (commit `2f95349`) : POST direct vers l'action, sans piloter TinyMCE — l'édition reste testée via Prisma direct, non couverte par cette fermeture                                                                                                                         |
| 5   | `admin/products/(edit)/create` → `createProduct` — testé seulement par un spec `skip` (Cloudinary réel requis), jamais exécuté en CI         | 🟡 moyen  | ✅ **Fermé** — test unitaire Vitest (`src/routes/admin/products/(edit)/create/create-product.test.ts`, commit `17cf87d`) : Cloudinary et Prisma stubés, couvre la garde admin (403), le slug, la liaison des taxonomies, le rejet prix barré ≤ prix et l'échec d'upload (500) — pas un e2e, mais exécuté en CI contrairement au spec `skip`                                                    |
| 6   | 4 routes cron (`cleanup`, `loyalty-check`, `stock-alerts`, `invoice-email`) — authentification HTTP directe (secret/signature) jamais testée | 🟡 moyen  | ✅ **Fermé** — `cleanup` (`e2e/commerce/cleanup.spec.ts`, commit `b7cbbbb`) ; `loyalty-check`/`stock-alerts`/`invoice-email` (`e2e/commerce/cron-auth.spec.ts`, commit `df7c32e`, garde 401 uniquement — pas de repli `CRON_SECRET` sur ces 3 routes, QStash non configuré en test)                                                                                                            |
| 7   | `admin/promo/create` → `createPromo` (argent) jamais testée par e2e                                                                          | 🟡 moyen  | ✅ **Fermé** — `e2e/promo/admin.spec.ts` (commit `7662986`). A révélé un vrai bug : `active` restait toujours `false` à la création malgré le commentaire « actif par défaut » (`superValidate()` initialise un booléen requis non fourni à `false`, pas `undefined` — le test de garde du composant ne se déclenchait jamais), corrigé via `active: z.boolean().default(true)` dans le schéma |
| 8   | `auth/settings` → `marketingEmailsOptIn` (RGPD opt-in) — une inversion de ce champ ne serait détectée par rien                               | 🟡 moyen  | ✅ **Fermé** — `e2e/auth/settings.spec.ts` (commit `9bffbcd`) : anonyme redirigé, valeur par défaut `false`, bascule puis retour, vérifiés en base                                                                                                                                                                                                                                             |
| 9   | `admin/products` → `createVariant`, `updateTaxonomy`/`deleteTaxonomyValue` — mutations catalogue jamais exercées                             | 🟢 faible | ✅ **Fermé** — `createVariant` via formulaire admin (`e2e/products/variants.spec.ts`, commit `6a5c25c`) ; `deleteTaxonomyValue` isolée de la suppression en cascade (`e2e/products/taxonomies.spec.ts`, commit `ee3a2bc`). `updateTaxonomy` restait déjà couvert (renommage de valeur, étape 5)                                                                                                |

### A.3.1 Instabilité e2e résiduelle — surveillance, pas de chantier

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

### A.3.2 `admin/returns` → succès remboursement Stripe : limitation acceptée, pas un chantier

**Recherche menée le 08/10/2026** : la route `approve` appelle réellement
l'API Stripe (`checkout.sessions.retrieve` puis `refunds.create`) sur un
`stripePaymentId` qui, en production, référence une vraie Checkout Session
créée au moment de l'achat. Pour tester le chemin de succès en e2e, il
faudrait disposer d'une session Stripe test-mode dont le paiement a
réellement abouti.

Or Stripe ne fournit aucune API pour faire aboutir une Checkout Session
sans interaction navigateur — seule la page hébergée (saisie carte) le
permet. Vérifié concrètement : la page est bien accessible depuis cet
environnement, mais le formulaire carte est éclaté dans plusieurs iframes
Stripe.js dont les noms sont régénérés aléatoirement à chaque session,
rendant toute automatisation Playwright intrinsèquement fragile.

Alternative écartée : migrer le checkout de Stripe Checkout (redirection
hébergée) vers Stripe Elements (carte embarquée, confirmable par API) —
rejetée car ce serait réécrire le tunnel de paiement de production
uniquement pour satisfaire un test, à l'inverse de l'ordre normal des
priorités.

**Décision** : le chemin de succès reste couvert uniquement par relecture
de code et vérification manuelle ponctuelle en sandbox Stripe test-mode
avant toute modification de cette route. Le chemin d'échec, lui, reste
testé automatiquement (`e2e/commerce/returns.spec.ts`, test « approbation
gère un remboursement Stripe impossible sans planter »).

## A.4 Arbitrages produit en attente — pas à moi de trancher

| #   | Décision                                                                                     | Source                                                                |
| --- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 1   | Taux de TVA réel à saisir dans `/admin/tva` (20 % attendu, à confirmer par expert-comptable) | [Partie C.4](#c4-facturation-prix--fiscalit%C3%A9)                    |
| 2   | Identité légale de l'entreprise à saisir dans `/admin/identite`                              | [Partie C.3](#c3-mentions-l%C3%A9gales--identification-lcen)          |
| 3   | Désignation d'un médiateur de la consommation réel                                           | [Partie C.2](#c2-droit-de-la-consommation--vente-%C3%A0-distance)     |
| 4   | Durées de conservation `FraudBlock`/`AdminAuditLog` à trancher                               | [Partie D](#partie-d--registre-des-traitements-rgpd-art-30)           |
| 5   | Signature du registre RGPD art. 30 par le responsable de traitement réel                     | [Partie D](#partie-d--registre-des-traitements-rgpd-art-30)           |
| 6   | Titrage/poinçon métal précieux — saisie de données fournisseur                               | [Partie C.6](#c6-sp%C3%A9cifique-m%C3%A9taux-pr%C3%A9cieux--diamants) |

✅ _Tranché_ — Arbitrage détection « nouvel appareil » : voir [A.2.5](#a25-arbitrage-en-attente--d%C3%A9tection-nouvel-appareil).

## A.5 Actions d'infrastructure — accès admin requis

| #   | Action                                                                                          |
| --- | ----------------------------------------------------------------------------------------------- |
| 1   | Activer « Dependabot alerts » (Settings → Code security and analysis)                           |
| 2   | Décider d'un stockage de secrets chiffré au repos (Vault/1Password/Doppler) si l'équipe grandit |

## A.6 À ne pas refaire — décisions déjà tranchées

| Piste                                                                   | Verdict      | Raison                                                                                                                                                                   |
| ----------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `multipleSubmits: 'allow'` sur les formulaires 2FA/checkout/gift-card   | ❌           | Casse le parcours (session réémise, double session Stripe, double carte cadeau — cf. `src/lib/invariants.test.ts` règle 3)                                               |
| Alléger `findPendingOrder` ([A.2.2](#a22-findpendingorder-trop-lourde)) | ❌ en l'état | Régression mesurée (80 % → 29 %)                                                                                                                                         |
| Rate limiting comme cause d'instabilité e2e                             | ❌ infirmé   | Zéro trace de quota dans les journaux ; fixtures isolées par `X-Forwarded-For`                                                                                           |
| Règle lint anti-prix-TTC-en-dur dans les tests e2e                      | ❌           | Indistinguable statiquement d'un prix HT légitime ; Vitest ne scanne que `src/**`                                                                                        |
| Masquer appareil/localisation sur « Ce n'était pas moi »                | ❌           | C'est précisément ce qui permet à l'utilisateur de juger                                                                                                                 |
| Ré-implémenter une vraie PWA (service worker + cache offline)           | ❌           | Jamais demandée comme fonctionnalité produit ; scaffolding morte déjà retirée                                                                                            |
| Supprimer en masse les fichiers/dépendances signalés par `knip`         | ❌           | Plusieurs sont des faux positifs transitifs — vérification individuelle obligatoire (voir [A.2.4](#a24-fichiers-signal%C3%A9s-inutilis%C3%A9s-par-knip-2-intentionnels)) |

## A.7 Garde-fous en place

`src/lib/invariants.test.ts` lit les sources pour interdire des classes de
bugs que le typage ne peut pas exprimer. **Y ajouter une règle dès qu'un
correctif repose sur « il ne faut pas oublier de… »** plutôt que sur une
contrainte de compilation. Détail des 4 règles actuelles dans
`/memories/repo/architecture.md`.

## A.8 Historique des audits (résumé, détail dans `git log`)

Ce dépôt a traversé plusieurs vagues d'audit consécutives entre
2026-09-14 et 2026-09-30, consolidées dans ce document le 08/10/2026 (les
fichiers sources `AUDIT_TECHNIQUE.md`, `AUDIT_FONCTIONNEL.md` et
`DIAGNOSTIC_FINAL.md` sont retirés, consultables via `git log -- AUDIT_TECHNIQUE.md` puis `git show <hash>:AUDIT_TECHNIQUE.md`). Résultats :

- **14 bugs métier réels trouvés et corrigés**, dont deux avec de l'argent
  réel en jeu (carte cadeau/promo consommés avant paiement confirmé,
  décrément de solde non atomique).
- **1 faille XSS réelle corrigée** (`{@html}` non échappé dans `Table`).
- **Dette lint/CI résorbée** : `svelte-check` 132→0 erreurs, ESLint
  \~4900→12 avertissements (après exclusion du vendor `tinymce`), prettier
  383→0 fichiers non formatés, CI bloquante sur type-check + 3 règles
  ESLint de réactivité, `knip` en CI, couverture Vitest mesurée.
- **Scan de vulnérabilités remplacé** : `npm audit` cassé silencieusement
  en CI → OSV-Scanner + Dependabot, complémentaires à `npm audit` ponctuel
  (voir [A.1](#a1-s%C3%A9curit%C3%A9-des-d%C3%A9pendances)).
- **Conformité réglementaire mappée obligation par obligation** avec
  preuve de code (Partie C), registre RGPD art. 30 rédigé (Partie D),
  plusieurs vrais bugs trouvés au passage (prix HT affichés au lieu de
  TTC, suppression de commandes au lieu d'anonymisation, SIRET absent des
  factures, doublons `<meta>` SEO).
- **Documentation module ↔ code resynchronisée** (`docs/auth`,
  `docs/admin`, `docs/commerce`, `docs/products`, `docs/promo` —
  commit `330f479`).
- **6 fichiers morts confirmés supprimés** (commit `72ca0ad`).
- **Régression ESLint du 08/10/2026 corrigée** (commit `ea72d7e`) : voir
  [A.1](#a1-s%C3%A9curit%C3%A9-des-d%C3%A9pendances).

Verdict global : ce n'est pas un starter — c'est un socle qui a survécu à
plusieurs vagues d'audit consécutives et en est ressorti plus solide à
chaque fois. Ce qui reste dans cette Partie A n'est plus du « risque
caché », mais de la dette de test ciblée ([A.3](#a3-couverture-e2e--trous-identifi%C3%A9s)),
un chantier structurant différé ([A.2.1](#a21-montants-mon%C3%A9taires-en-float))
et des décisions qui appartiennent à l'humain ([A.4](#a4-arbitrages-produit-en-attente--pas-%C3%A0-moi-de-trancher)-[A.5](#a5-actions-dinfrastructure--acc%C3%A8s-admin-requis)).

---

# Partie B — Idées de features futures

Propositions d'amélioration pour aller au-delà des modules déjà en place
(wishlist, cross-sell, retours/SAV, moyens de paiement enregistrés,
fidélité, cartes cadeaux, variantes produit, questions produit, suivi de
commande, détection de fraude, relance des produits consultés jamais
achetés). Rien de cassé ou de manquant ici — ce sont des pistes
d'extension, pas du backlog technique (Partie A).

**Chaque idée précise sur quelle brique existante elle s'appuie** (Stripe,
QStash, `StoreSettings` pour le flag on/off, jobs post-paiement...) pour
rester dans l'esprit du dépôt.

⭐ = coup de cœur / meilleur ratio effort-impact.

### Commerce & paiement

- **Upsell post-achat en un clic** — sur la page de remerciement, une offre complémentaire ajoutable sans ressaisir la carte (PaymentIntent off-session Stripe sur le moyen de paiement déjà utilisé). Se branche naturellement sur le module Moyens de paiement enregistrés.
- **Abonnements / réachat automatique** — pour les produits consommables,
  Stripe Subscriptions avec pause/annulation depuis `/auth/settings`.
  Revenu récurrent, forte rétention.
- **Devis B2B avec tarifs dégressifs** — paliers de prix par quantité,
  validation manuelle admin avant paiement (flux « devis » avant
  « commande »). Ouvre un segment pro sans casser le tunnel B2C existant.
- **Assurance transport / valeur déclarée** — option payante au checkout
  pour les envois de valeur (bijoux), ajoutée au calcul du colis Sendcloud
  existant (`packageEstimate.ts`) plutôt qu'un nouveau service : une ligne
  de plus dans `shippingCost`, une case à cocher avant `createCheckoutSession`.
- **Reprise / rachat bijoux d'occasion (trade-in)** — un client soumet une
  estampille photo + description depuis son compte, un admin évalue et émet
  un crédit (`GiftCard`, même génération de code que l'admin cartes
  cadeaux) utilisable en réduction sur un nouvel achat — flux calqué sur
  « Créditer le compte » des retours/SAV, pas une nouvelle mécanique
  financière à inventer.

### Fidélité & croissance

- **Paliers de fidélité multiples (bronze / argent / or)** au lieu d'un
  seuil unique par code — chaque palier débloque un avantage cumulatif
  (réduction permanente, livraison offerte). Évolution naturelle de
  `LoyaltyAward` / `loyaltyThreshold`.
- **Cagnotte cadeau collaborative** — plusieurs proches contribuent à une
  cagnotte pour un produit précis (anniversaire, mariage), lien de
  partage public, jauge de progression, conversion automatique en gift
  card une fois l'objectif atteint.
- **Programme VIP payant** (façon Prime) — abonnement Stripe donnant accès
  à la livraison offerte illimitée et à des remises exclusives.
- **Programme d'affiliation** — dashboard de commissions pour des
  partenaires externes, lien traqué, versement automatique (Stripe
  Connect). Plus lourd que le parrainage mais ouvre un canal d'acquisition
  externe.
- **Code promo anniversaire d'inscription** — un e-mail avec un code à
  usage unique envoyé chaque année à la date de création du compte
  (`User.createdAt`), même mécanique de génération que la relance panier
  (code jetable, expiration courte) et même patron de job périodique
  quotidien (QStash Schedule) que `cartRecovery`/`reviewReminder`.

### Produits & découverte

- **Configurateur bijou (gravure, taille de bague, métal)** ⭐ — le modèle
  `Custom` et le flux « commande sur-mesure » (`hasCustomItems`,
  `shippingOption: 'no_shipping'`) existent déjà pour des pièces uniques ;
  ce module structure la saisie (options prédéfinies par produit plutôt
  qu'un champ libre) et affiche le récapitulatif de personnalisation sur la
  fiche produit, la facture et le bordereau admin. Étend un flux déjà
  câblé de bout en bout plutôt que d'en créer un nouveau.
- **Wishlist partageable publiquement** — lien en lecture seule vers une
  liste de cadeaux, extension directe du module Wishlist existant.
- **Recherche visuelle** — upload d'une photo pour retrouver des produits
  similaires (plus exploratoire, nécessite un service d'embeddings
  externe).
- **Certificat d'authenticité / traçabilité pierre** — un PDF généré par
  produit (origine, certification, numéro de série), même génération PDF
  que les factures/bordereaux déjà en place, téléchargeable depuis
  `/auth/settings/factures/[id]` une fois la commande payée. Rejoint une
  vraie obligation de transparence pour les diamants, voir
  [C.6](#c6-sp%C3%A9cifique-m%C3%A9taux-pr%C3%A9cieux--diamants).

### Logistique & retrait

- **Click & collect avec créneaux** — sélection d'un point de retrait et
  d'un créneau horaire, en alternative à la livraison Sendcloud déjà
  intégrée.
- **Score éco / compensation carbone** — estimation d'empreinte carbone
  par commande (poids + distance transporteur) et option de compensation
  au checkout (petit don reversé à une association).

### Admin & ops

- **A/B testing de prix et promotions** — cohortes aléatoires par
  utilisateur pour mesurer l'impact conversion d'une remise ou d'un prix,
  au-dessus du module Promo existant.
- **Export FEC réglementaire complet** — `accountingExport.ts` produit déjà
  un CSV mensuel inspiré de la nomenclature FEC (colonnes proches,
  `JournalCode`/`EcritureDate`/`CompteNum`...) mais volontairement
  incomplet (une seule écriture par transaction, pas de contrepartie
  débit/crédit équilibrée) — le finaliser en véritable FEC opposable
  couvrirait un vrai besoin de conformité comptable française.
- **Vérification renforcée (KYC léger) pour les grosses commandes** ⭐ —
  extension directe de la détection de fraude déjà en place
  (`$lib/server/fraud.ts`) : au-delà d'un montant seuil, exige une pièce
  d'identité uploadée avant validation admin manuelle, plutôt qu'un simple
  score automatique. Réutilise le stockage d'images déjà en place
  (Cloudinary) et le flux d'approbation manuelle des retours/SAV comme
  patron d'interface admin.

### Support & confiance client

- **Chat support en direct** — file d'attente admin (WebSocket), en
  complément du module Contact (asynchrone) déjà en place.
- **Vérification d'âge pour produits réglementés** — blocage de commande
  selon la date de naissance déclarée, pour les catalogues concernés
  (alcool, etc.).
- **NPS post-livraison** — question de satisfaction courte envoyée après
  livraison confirmée, distincte des avis produit (`Review`), pour piloter
  la relation client dans le temps.
- **Badge « achat vérifié » sur les avis** — un avis (`Review`) n'affiche
  le badge que si son auteur a une commande payée pour ce produit
  (`OrderItem`/`Order.status IN (PAID, SHIPPED)`, même filtre que les
  modules de relance déjà en place) — aucun nouveau champ nécessaire,
  seulement une vérification au moment de l'affichage.

Pas encore priorisé collectivement : à trier par coup de cœur / effort une
fois qu'on choisit la prochaine à implémenter.

---

# Partie C — Conformité réglementaire e-commerce

Bilan des obligations légales applicables à une boutique en ligne
France/UE (vente B2C, bijouterie/joaillerie), comparé à l'état réel
constaté dans ce dépôt. **Ceci n'est pas un avis juridique** — à faire
valider par un avocat/expert-comptable avant toute mise en production
réelle. Objectif : une liste de vérification de départ, pas un audit
juridique complet.

**Méthode** : chaque ligne a été vérifiée en lisant le code (routes,
schéma Prisma, `checkout.ts`) — pas une liste générique copiée d'ailleurs.

### Résumé exécutif

Les points ci-dessous sont **traités côté code** (voir détail dans les
sections correspondantes plus bas, marquées ✅ mise à jour) :

1. **Pages légales créées** — `/mentions-legales`, `/cgv`,
   `/confidentialite` + pied de page + bannière cookies + case CGV
   obligatoire au checkout. Les champs d'identité de l'entreprise (SIRET,
   adresse, capital social...) sont désormais **saisissables depuis**
   `/admin/identite` (`StoreSettings.company*`) et affichés
   dynamiquement sur `/mentions-legales` et les factures/avoirs — restent
   `[À COMPLÉTER]` tant que personne ne les a saisis, je ne peux pas les
   inventer à la place de l'entreprise, voir [C.3](#c3-mentions-l%C3%A9gales--identification-lcen).
2. **Taux de TVA configurable** — remplace l'ancienne constante figée à
   5,5 % : `StoreSettings.vatRate`, modifiable depuis `/admin/tva`.
   Le taux par défaut reste 5,5 % (comportement inchangé tant qu'un admin
   ne le modifie pas explicitement) — **le taux réellement applicable
   (20 % attendu pour la bijouterie) reste à confirmer par un
   expert-comptable et à saisir en admin**, ce n'était pas à moi de
   trancher.
3. **Rétractation légale distinguée du SAV** — `ReturnRequest.kind`
   (`WITHDRAWAL`/`WARRANTY`), formulaire client avec le bon texte légal,
   masqué sur les commandes sur-mesure (exclusion légale), remboursement
   déjà intégral (frais de port inclus) dans les deux cas.

✅ Migration Prisma (`prisma/migrations/20260924140000_add_vat_rate_and_return_kind`)
appliquée à la base.

Pour situer par rapport à la Partie A : la purge RGPD automatisée déjà en
place (`$lib/server/jobs/cleanup.ts` — sessions expirées, tokens, paniers
abandonnés) couvre le principe de minimisation des données (RGPD
art. 5.1.e), **distinct** du droit à l'effacement sur demande d'une
personne (art. 17) — désormais traité lui aussi, voir [C.1](#c1-protection-des-donn%C3%A9es-personnelles-rgpd--cnil).

**RGPD** : les droits à la portabilité (art. 20) et à l'effacement
(art. 17) sont en self-service depuis `/auth/settings/donnees` — export
JSON complet, suppression par **anonymisation** (jamais une suppression
physique du compte : `Order`/`Transaction` restent conservés, obligation
comptable). Au passage, un vrai bug a été trouvé et corrigé dans le flux
admin existant (`/admin/users?/deleteUser`) : il supprimait purement et
simplement les commandes du compte avant suppression, contredisant le
commentaire du schéma qui exige leur conservation — les deux flux
partagent désormais la même fonction correcte
(`$lib/prisma/user/anonymizeUser.ts`).

**Consommation, mentions, fiscal** :

- `/cgu` créée (contenu utilisateur : avis, questions produit,
  commentaires blog), liée depuis le pied de page.
- Garantie légale de conformité + vices cachés : déjà correctement
  couverte par `/cgv` section 6, acceptée avant commande via la case
  CGV.
- Médiateur de la consommation : section dédiée déjà présente dans
  `/mentions-legales` avec deux médiateurs de référence ; reste une
  vraie désignation contractuelle à faire par un humain, je ne peux pas
  la fabriquer.
- **Vrai bug trouvé et corrigé** : le catalogue, la fiche produit
  (+ ventes croisées, récemment consultés) et la liste d'envies
  affichaient `Product.price` (HT, stocké tel quel en base) directement
  au consommateur, sans conversion TVA — alors que le panier/checkout
  appliquent bien la TVA séparément. Contraire à l'Arrêté du 3 déc. 1987
  (prix annoncé au consommateur = TTC). Corrigé par une conversion à
  l'affichage uniquement (`toTTC()`, `$lib/utils/price.ts`) ; le prix HT
  transmis au panier reste inchangé pour ne pas casser le calcul
  panier/commande. Le filtre de prix du catalogue (curseur, bornes) a
  été converti en cohérence.
- Facture PDF : le SIRET vendeur était totalement absent du modèle et du
  template (seul le n° de TVA existait, en placeholder d'environnement)
  — ajouté (`InvoiceCompany.siret`, `INVOICE_COMPANY_SIRET`), même
  logique de surcharge par variable d'environnement que les autres
  champs vendeur.
- Titrage/poinçon métal précieux : pas un manque de code — le système
  générique de taxonomies (`/admin/products/taxonomies`) permet déjà de
  créer ce champ et de le remplir par produit, reste une tâche de saisie
  de données réelles.

**Registre des traitements, délai de livraison** :

- Partie D (ce document) — brouillon de registre RGPD art. 30, 12
  traitements identifiés en lisant le code (comptes, commandes, livraison,
  marketing, fraude, avis, fidélité, self-service RGPD, audit admin,
  contact). Fait apparaître un sous-traitant absent de l'audit initial,
  **Sentry** (suivi d'erreurs, ajouté à `/confidentialite`), et un vestige
  de configuration inutilisé, **Contentful** (clés présentes en
  environnement/CI mais aucun usage dans le code) — retiré (`.env.example`,
  `.env.test.example`, CI). Deux durées de conservation non explicites
  relevées (`FraudBlock`, `AdminAuditLog`, aucune purge automatique
  identifiée) et un point d'attention sur le blocage automatique de fraude
  (décision automatisée, art. 22 RGPD à vérifier si ce module est activé
  en production).
- Délai de livraison engagé (Code conso. L216-1) : même principe que le
  taux de TVA — `StoreSettings.estimatedDelivery{Min,Max}Days`,
  configurable depuis `/admin/livraison`, `null` par défaut (rien affiché
  tant que l'admin n'a pas saisi une vraie estimation), affiché au
  checkout avant validation de commande une fois renseigné.

**Identité de l'entreprise** : raison sociale, forme juridique, capital
social, adresse du siège, SIRET, n° de TVA intracommunautaire, directeur
de publication, téléphone et e-mail sont désormais saisissables depuis
`/admin/identite` (page dédiée, retirée de `/admin/settings`,
`StoreSettings.company*`) au lieu d'être figés en `[À COMPLÉTER]` dans le
code ou pilotés uniquement par des variables d'environnement
(`INVOICE_COMPANY_*`, conservées comme repli). Reste, comme avant, une
saisie humaine — le code ne peut toujours pas deviner l'identité réelle
de l'entreprise.

Vérifié : chaque endroit du site qui affiche cette identité la lit bien
depuis cette même source (`getCompanyIdentity()`/`getInvoiceCompany()`),
sans copie figée qui pourrait diverger — `/mentions-legales` (placeholder
tant qu'un champ n'est pas rempli), pied de page (`Footer.svelte`, nom
affiché dans le copyright, replie sur le nom de marque tant que la raison
sociale n'est pas saisie), factures/avoirs PDF, aperçu HTML de facture et
e-mails de facture/avoir. `/cgv` et `/confidentialite` ne dupliquent rien,
ils renvoient vers `/mentions-legales`.

**SEO** : `src/lib/seo.config.ts` contenait des métadonnées génériques
d'un ancien boilerplate (« studio web, agence web, identité visuelle... »)
sans rapport avec la bijouterie — réécrit pour décrire la vraie activité.
`/products` et `/blog` n'avaient aucune balise SEO du tout (`<SEO>` jamais
monté) : ajoutées.

En creusant plus loin pour une gestion SEO plus solide (audit dédié) :

- **Vrai bug trouvé** : `src/app.html` portait sa propre copie statique
  complète (description, mots-clés, robots, Open Graph, Twitter,
  canonical) — avec le même texte « studio web » resté du boilerplate,
  raté lors du premier nettoyage. Cette copie statique coexistait sur
  **chaque page du site** avec les balises dynamiques de `SEO.svelte`,
  produisant des balises `<meta>` en double (confirmé par un test e2e :
  `/auth/login` affichait à la fois `noindex` et `index, follow`). Retiré
  entièrement de `app.html` — `SEO.svelte`, monté sur chaque page/layout,
  est désormais la seule source.
- **Sitemap** : `/products/[slug]` n'apparaissait jamais dans
  `/sitemap.xml` (seul le blog était requêté) — corrigé. `lastmod`
  retiré des pages statiques (valait `new Date()`, donc chaque page se
  déclarait modifiée à l'instant **à chaque requête**).
- **Zones privées** : aucune page n'envoyait `noindex` — `/admin/*` et
  `/auth/*` (y compris `/auth/settings/*`) sont désormais en `noindex`
  posé une seule fois au niveau du layout (`+layout.svelte`), pas page par
  page, pour couvrir automatiquement toute sous-page future. `/checkout`,
  `/checkout/success` et `/suivi-commande` (transactionnels, aucune valeur
  SEO) également passés en `noindex`.
- **Articles de blog** (`/blog/[slug]`) : aucun SEO propre à l'article
  (titre/description génériques du site) — corrigé, avec JSON-LD
  `Article` (`image` incluse, pas de champ `excerpt` en base : description
  dérivée du contenu HTML, tronquée).
- **Fil d'Ariane** (`BreadcrumbList`) : prévu dans le composant mais
  jamais utilisé — ajouté sur les fiches produit et les articles de blog.
- **Images Open Graph** : aucune des images référencées n'existait
  réellement dans `static/` (404 sur les partages sociaux, sauf la fiche
  produit qui utilise la vraie photo). Une vraie photo de bijou ou un
  logo ne peuvent pas être inventés — mais une carte de marque
  typographique, si. `scripts/generate-og-image.mjs` (Playwright, déjà
  une dépendance e2e, pas de package ajouté) génère
  `static/og-default.jpg` (1200×630) : fond sombre, nom de marque dans le
  même traitement que le logo de chargement du site (`Loader.svelte`),
  accent doré. Toutes les pages sans photo dédiée y pointent tant que
  l'entreprise n'a pas fourni de vrai logo (voir point suivant).
- `robots.txt` ne bloque que `/api/` : volontaire, un `Disallow` sur une
  page en `noindex` empêcherait Google de crawler la page et donc de
  voir la balise `noindex` elle-même.
- Reste hors périmètre : SEO propre à chaque sous-page admin/compte
  (au-delà du `noindex` uniforme) ; images sans `width`/`height`
  (catalogue, fiche produit) — vrai sujet de _Cumulative Layout Shift_,
  mais non corrigeable au jugé (`optimizedImageUrl` ne fixe que la
  largeur, la hauteur dépend du ratio source) : décision de design, pas
  un correctif technique.
- **Écarté après vérification** — `rel=prev/next` sur la pagination :
  Google a officiellement annoncé en 2019 ne plus utiliser ces balises
  pour l'indexation, aucun effet sur le référencement.

**Logo de l'entreprise** : `/admin/identite` permet désormais d'envoyer un
vrai logo (PNG/JPEG, même mécanisme d'upload Cloudinary que les images
produit — `StoreSettings.companyLogoUrl`, `null` par défaut, jamais de
logo inventé). Utilisé à trois endroits : JSON-LD `Organization`
(`SEO.svelte`, remplace une référence `/logo.png` qui n'a jamais existé),
en-tête des factures/avoirs PDF (le logo est récupéré et incrusté au
moment de la génération, `fetchLogoForPdf` — best-effort, une facture se
génère toujours même si l'image est injoignable) et affiché sur
`/mentions-legales`. Ne remplace pas `og-default.jpg` : une carte
1200×630 composée automatiquement à partir d'un logo carré risquerait
d'être mal cadrée, contrairement à la carte typographique dédiée
ci-dessus.

**Navigation admin** : le taux de TVA et le délai de livraison, jusque-là
deux formulaires empilés en haut de la page « Modules e-commerce »
(`/admin/settings`), ont chacun leur propre page (`/admin/tva`,
`/admin/livraison`) avec une entrée dédiée dans la navigation admin —
même principe que l'identité de l'entreprise (`/admin/identite`, voir
[C.3](#c3-mentions-l%C3%A9gales--identification-lcen)). `/admin/settings` ne
porte plus que les interrupteurs de modules.

## C.1 Protection des données personnelles (RGPD + CNIL)

| Obligation                       | Base légale                    | État constaté                 | Piste                                                                                                                                                                                                                                                                                                                                                                           |
| -------------------------------- | ------------------------------ | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Politique de confidentialité     | RGPD art. 13-14                | ✅ `/confidentialite`         | Distincte des CGV                                                                                                                                                                                                                                                                                                                                                               |
| Bannière cookies/traceurs        | Directive ePrivacy, reco. CNIL | ✅ `CookieNotice.svelte`      | Information (aucun traceur non essentiel actif) plutôt qu'un consentement, cohérent avec l'état réel du site                                                                                                                                                                                                                                                                    |
| Consentement marketing opt-in    | RGPD art. 6                    | ✅ En place                   | `User.marketingEmailsOptIn`, défaut `false`, déjà bien distingué des e-mails transactionnels                                                                                                                                                                                                                                                                                    |
| Sécurité technique des données   | RGPD art. 32                   | ✅ En place                   | Argon2id, TOTP/recovery chiffrés AES, 2FA — bon niveau technique                                                                                                                                                                                                                                                                                                                |
| Minimisation / purge automatique | RGPD art. 5.1.e                | ✅ En place                   | `cleanup.ts` — sessions, tokens, paniers `PENDING` abandonnés                                                                                                                                                                                                                                                                                                                   |
| Droit d'accès et rectification   | RGPD art. 15-16                | 🟡 Partiel                    | Rectification via `/auth/settings` déjà possible ; pas de vue « toutes mes données »                                                                                                                                                                                                                                                                                            |
| Droit à la portabilité           | RGPD art. 20                   | ✅ `/auth/settings/donnees`   | Export JSON complet (profil, adresses, commandes, factures, avis, questions, liste d'envies, retours, fidélité)                                                                                                                                                                                                                                                                 |
| Droit à l'effacement sur demande | RGPD art. 17                   | ✅ Anonymisation self-service | `anonymizeUser()` — jamais de suppression physique du compte, `Order`/`Transaction` conservés (obligation comptable) ; même fonction réutilisée par l'admin (bug de perte de données corrigé au passage)                                                                                                                                                                        |
| Registre des traitements         | RGPD art. 30                   | 🟡 Brouillon rédigé           | [Partie D](#partie-d--registre-des-traitements-rgpd-art-30) — 12 traitements identifiés en lisant le code, sous-traitants recensés (dont Sentry, absent de l'audit initial ; Contentful, vestige inutilisé, retiré) ; reste à signer avec l'identité réelle du responsable de traitement, et à trancher 2 durées de conservation non explicites (`FraudBlock`, `AdminAuditLog`) |

## C.2 Droit de la consommation & vente à distance

| Obligation                                   | Base légale                                    | État constaté             | Piste                                                                                                                                                                                                                                                            |
| -------------------------------------------- | ---------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CGV                                          | Code com. L441-1, Code conso. L111-1           | ✅ `/cgv` + case à cocher | Case obligatoire dans l'action `checkout`, revalidée côté serveur                                                                                                                                                                                                |
| Droit de rétractation (14 j)                 | Code conso. L221-18 à L221-28                  | ✅ `ReturnRequest.kind`   | `WITHDRAWAL` vs `WARRANTY`, sans motif requis pour une rétractation, remboursement déjà intégral (frais de port inclus) dans les deux cas                                                                                                                        |
| Exclusion pour biens personnalisés           | Code conso. L221-28, 3°                        | ✅ Appliqué               | Option masquée côté client ET revérifiée côté serveur si `Transaction.shippingOption === 'no_shipping'`                                                                                                                                                          |
| Garantie légale de conformité + vices cachés | Code conso. L217-3 s., Code civil art. 1641 s. | ✅ `/cgv` section 6       | Mention déjà présente (conformité + vices cachés), acceptée avant validation de commande via la case CGV                                                                                                                                                         |
| Médiateur de la consommation                 | Code conso. L616-1 s.                          | 🟡 Partiel                | Section dédiée dans `/mentions-legales` + renvoi dans `/cgv` ; reste à désigner et contractualiser un médiateur réel (décision métier, deux options de référence déjà listées)                                                                                   |
| Délai de livraison engagé                    | Code conso. L216-1 s.                          | ✅ Configurable           | `StoreSettings.estimatedDelivery{Min,Max}Days`, modifiable depuis `/admin/livraison` (même principe que le taux de TVA : `null` par défaut, rien affiché tant que l'admin n'a pas saisi une vraie estimation) — affiché au checkout avant validation de commande |

## C.3 Mentions légales & identification (LCEN)

| Obligation                | Base légale       | État constaté           | Piste                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------- | ----------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Page « Mentions légales » | LCEN art. 6-III-1 | 🟡 Saisissable en admin | Raison sociale, forme juridique, capital social, adresse, SIRET, TVA intracommunautaire, directeur de publication : configurables depuis `/admin/identite` (`StoreSettings.company*`), affichés dynamiquement sur `/mentions-legales` et sur les factures/avoirs — reste `[À COMPLÉTER]` tant que personne ne les a saisis, ce qui reste une décision humaine |
| CGU                       | Bonne pratique    | ✅ `/cgu`               | Couvre le contenu utilisateur (avis, questions produit, commentaires blog) et la responsabilité associée                                                                                                                                                                                                                                                      |

## C.4 Facturation, prix & fiscalité

| Obligation                    | Base légale                             | État constaté           | Piste                                                                                                                                                                                                                                                                                                  |
| ----------------------------- | --------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Taux de TVA correct           | CGI art. 278 s.                         | 🟡 Configurable         | `StoreSettings.vatRate`, modifiable depuis `/admin/tva` — reste à saisir le bon taux (20 % attendu), décision volontairement laissée à un humain                                                                                                                                                       |
| Mentions obligatoires facture | Code com. L441-9, CGI art. 242 nonies A | ✅ SIRET + TVA affichés | `InvoiceCompany.siret`/`.vat` imprimés sur le PDF facture/avoir et l'aperçu HTML — priorité à l'identité saisie depuis `/admin/identite` ([C.3](#c3-mentions-l%C3%A9gales--identification-lcen)), repli sur `INVOICE_COMPANY_*` (env) puis sur un placeholder manifestement fictif si rien n'est saisi |
| Affichage des prix TTC        | Arrêté du 3 déc. 1987                   | ✅ Corrigé              | Catalogue, fiche produit (+ ventes croisées, récemment consultés), liste d'envies affichaient le prix HT stocké sans conversion — désormais convertis en TTC à l'affichage (`toTTC()`, `$lib/utils/price.ts`) ; panier/commande restent inchangés (HT + TVA déjà détaillés séparément, conforme)       |
| Guichet unique TVA (OSS)      | CGI art. 298 sexdecies-G                | ❌ Manquant             | Pertinent seulement au-delà de 10 000 €/an de ventes hors France vers l'UE                                                                                                                                                                                                                             |

## C.5 Paiement en ligne

| Obligation                   | Base légale                   | État constaté | Piste                                                                   |
| ---------------------------- | ----------------------------- | ------------- | ----------------------------------------------------------------------- |
| PCI-DSS                      | Norme sectorielle obligatoire | ✅ En place   | Stripe Checkout hébergé, aucune donnée carte ne transite par le serveur |
| Authentification forte (SCA) | DSP2                          | ✅ En place   | Gérée nativement par Stripe Checkout (3D Secure)                        |

## C.6 Spécifique métaux précieux & diamants

| Obligation                         | Base légale                                 | État constaté  | Piste                                                                                                                                                                                                                                                                                  |
| ---------------------------------- | ------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Titrage/poinçon métal précieux     | CGI art. 521 s.                             | 🟡 Infra dispo | Aucun champ dédié, mais le système générique de taxonomies (`/admin/products/taxonomies`, type `NUMBER` + unité) permet déjà de créer une taxonomie « Titrage » et de saisir une valeur par produit — reste une tâche de saisie de données réelles (fournisseur), pas de développement |
| Traçabilité/certification diamants | Processus de Kimberley, normes sectorielles | 🟡 Partiel     | Rejoint l'idée « certificat d'authenticité » de la [Partie B](#partie-b--id%C3%A9es-de-features-futures) — ici adossée à une vraie obligation de transparence, pas qu'un argument marketing                                                                                            |

## C.7 Accessibilité numérique

| Obligation | Base légale                       | État constaté       | Piste                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------- | --------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| RGAA       | Loi n°2005-102, décret n°2019-768 | 🟡 Audit léger fait | Pas un audit de certification (nécessite un expert RGAA si le seuil de CA applicable est atteint), mais un passage ciblé sur les pages clientes (catalogue, fiche produit, checkout, compte, pages légales) : `lang="fr"` déjà présent, alt text déjà correct partout, aucun `<div onclick>` au clavier-inaccessible détecté. Corrigé : champ de recherche catalogue sans nom accessible, boutons icône seule sans `aria-label` (panier, retirer un article du panier x2, moyens de paiement enregistrés, interrupteurs mode sombre/plein écran), `aria-label` en anglais sur la page adresses (incohérent avec le reste du site en français), lien « Aller au contenu » ajouté (absent auparavant). **Reste à vérifier manuellement** : contraste des couleurs (`text-muted-foreground` très utilisé pour le texte secondaire, à mesurer dans un navigateur en clair et sombre) — pas calculable sans rendu réel. |

Pas encore priorisé collectivement : à faire confirmer point par point avec
un avocat/expert-comptable avant d'attaquer l'implémentation, en commençant
par le résumé exécutif ci-dessus.

---

# Partie D — Registre des traitements (RGPD art. 30)

Brouillon de registre des activités de traitement, construit en lisant le
code (schéma Prisma, jobs serveur, variables d'environnement) plutôt que
recopié d'un modèle générique. **Ceci n'est pas le registre officiel** —
un registre au sens de l'article 30 doit être tenu et signé par le
responsable de traitement (ou son DPO), avec son identité réelle. Cette
partie sert de matière première technique pour le construire, pas de
substitut.

### Responsable du traitement

⚠️ À compléter avec l'identité réelle de l'entreprise — voir
[C.3](#c3-mentions-l%C3%A9gales--identification-lcen) (mêmes informations que
les mentions légales : raison sociale, adresse, SIRET, représentant
légal). Délégué à la protection des données (DPO) : à désigner si
l'obligation s'applique (traitement à grande échelle de données
sensibles, ou suivi régulier et systématique à grande échelle — à évaluer
selon le volume réel d'activité).

### Méthode

Chaque traitement ci-dessous a été identifié en lisant le schéma Prisma et
le code serveur associé (pas une liste théorique). La colonne « Durée de
conservation » indique soit une durée explicite trouvée dans le code, soit
« non explicite dans le code » quand aucune purge n'existe — ce deuxième
cas est en lui-même une chose à trancher (voir « Points ouverts » en bas
de cette partie), pas juste une case à cocher.

## D.1 Comptes clients et authentification

| Champ                          | Détail                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Finalité                       | Création et gestion du compte client, connexion, sécurité (2FA)                                                                                                                                                                                                                                                                                                                                                                    |
| Base légale                    | Exécution du contrat (art. 6.1.b) pour le compte ; intérêt légitime (art. 6.1.f) pour la sécurité (sessions, 2FA)                                                                                                                                                                                                                                                                                                                  |
| Données                        | `User` (email, username, name, picture), `passwordHash` (Argon2id), `recoveryCode`/`totpKey` (chiffrés AES), `googleId`, `Session` (dont `userAgent`, `ipAddress`, `city`/`country` approximatifs — ajoutés pour l'auto-service « Sessions actives », `/auth/settings/sessions`), `LoginEvent` (historique des connexions, mêmes colonnes appareil/localisation — voir D.1bis), `EmailVerificationRequest`, `PasswordResetSession` |
| Personnes concernées           | Clients                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Destinataires / sous-traitants | Google (connexion OAuth, si utilisée) ; Vercel (en-têtes de géolocalisation `x-vercel-ip-*`, dérivés de l'IP côté edge, jamais un service de géolocalisation tiers séparé)                                                                                                                                                                                                                                                         |
| Durée de conservation          | Sessions et jetons expirés purgés automatiquement (`$lib/server/jobs/cleanup.ts`) — l'IP/ville/pays d'une session ont donc la même durée de vie qu'elle (30 jours glissants au plus) ; `LoginEvent` conservé 90 jours (même job), plus long que la session car c'est un journal de sécurité, voir D.1bis ; le compte lui-même n'a pas de purge automatique — suppression uniquement sur demande (self-service ou admin, voir D.8)  |

### D.1bis Historique des connexions et alerte « nouvel appareil »

| Champ                          | Détail                                                                                                                                                                                                                                                                                         |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Finalité                       | Détecter et signaler au client une connexion depuis un appareil inconnu (sécurité du compte) ; conserver un historique consultable après expiration des sessions                                                                                                                               |
| Base légale                    | Intérêt légitime (art. 6.1.f) — sécurité du compte                                                                                                                                                                                                                                             |
| Données                        | `LoginEvent` (userAgent, ipAddress, city, country, méthode de connexion, indicateur « nouvel appareil ») — jamais créé pour une simple réémission de session (validation 2FA, changement de mot de passe), seulement pour une authentification réelle (`$lib/prisma/loginEvent/loginEvent.ts`) |
| Personnes concernées           | Clients                                                                                                                                                                                                                                                                                        |
| Destinataires / sous-traitants | Aucun (l'alerte part par SMTP, déjà listé en D.6, vers le client lui-même)                                                                                                                                                                                                                     |
| Durée de conservation          | **90 jours, explicite dans le code** (`LOGIN_EVENT_RETENTION_DAYS`, `$lib/server/jobs/cleanup.ts`) — plus long que la session qu'il documente (justifié : un journal de sécurité doit survivre à l'expiration de ce qu'il journalise), pas indéfini                                            |

## D.2 Commandes, factures et paiement

| Champ                          | Détail                                                                                                                                                                                                                                                                       |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Finalité                       | Traitement des commandes, facturation, comptabilité                                                                                                                                                                                                                          |
| Base légale                    | Exécution du contrat (art. 6.1.b) ; obligation légale comptable (art. 6.1.c, Code de commerce L123-22)                                                                                                                                                                       |
| Données                        | `Order`, `OrderItem`, `Transaction` (adresses figées à la commande, montants, numéro de facture)                                                                                                                                                                             |
| Personnes concernées           | Clients                                                                                                                                                                                                                                                                      |
| Destinataires / sous-traitants | **Stripe** (paiement — `stripeCustomerId`, `stripePaymentIntentId` ; aucune donnée de carte bancaire stockée par l'application)                                                                                                                                              |
| Durée de conservation          | **10 ans, explicite dans le code** (obligation comptable, Code de commerce L123-22) — `Order`/`Transaction` ne sont jamais supprimées ni anonymisées, y compris après suppression du compte client (voir D.8). Commandes en attente abandonnées : supprimées après 30 jours. |

## D.3 Retours et avoirs

| Champ                          | Détail                                                                                                |
| ------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Finalité                       | Traitement des rétractations légales et des retours SAV                                               |
| Base légale                    | Obligation légale (droit de rétractation, Code conso. L221-18 à L221-28) ; exécution du contrat (SAV) |
| Données                        | `ReturnRequest`, `CreditNoteCounter`                                                                  |
| Personnes concernées           | Clients                                                                                               |
| Destinataires / sous-traitants | Stripe (remboursement), Sendcloud (étiquette de retour)                                               |
| Durée de conservation          | Non explicite en tant que telle — rattachée à `Transaction`, conservée 10 ans par ricochet            |

## D.4 Export comptable

| Champ                          | Détail                                                                          |
| ------------------------------ | ------------------------------------------------------------------------------- |
| Finalité                       | Export mensuel des transactions payées pour la comptabilité                     |
| Base légale                    | Obligation légale comptable                                                     |
| Données                        | `AccountingExportLog`, export CSV des transactions                              |
| Personnes concernées           | Clients (via les transactions exportées)                                        |
| Destinataires / sous-traitants | Destinataire interne par e-mail (adresse comptable configurée), SMTP (voir D.6) |
| Durée de conservation          | Non explicite dans le code pour le log d'export lui-même                        |

## D.5 Livraison

| Champ                          | Détail                                                              |
| ------------------------------ | ------------------------------------------------------------------- |
| Finalité                       | Création des étiquettes d'expédition, suivi de livraison            |
| Base légale                    | Exécution du contrat                                                |
| Données                        | Adresse de livraison (`Order`/`Transaction`), point relais éventuel |
| Personnes concernées           | Clients                                                             |
| Destinataires / sous-traitants | **Sendcloud** (création colis, tracking, webhooks de statut)        |
| Durée de conservation          | Liée à la commande (10 ans, voir D.2)                               |

## D.6 Marketing, e-mails transactionnels et relances

| Champ                          | Détail                                                                                                                                                                     |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Finalité                       | E-mails transactionnels (confirmation, facture, réinitialisation de mot de passe) toujours envoyés ; e-mails marketing (newsletter, relances) uniquement avec consentement |
| Base légale                    | Exécution du contrat (transactionnel) ; consentement, art. 6.1.a (marketing — `User.marketingEmailsOptIn`, défaut `false`, opt-in explicite, jamais opt-out par défaut)    |
| Données                        | Email, historique d'envoi (`Order.cartReminder1/2SentAt`, `Order.reviewReminderSentAt`, `ProductView.reminderSentAt`, `WishlistItem.lastNotifiedPrice/FlashSaleEndsAt`)    |
| Personnes concernées           | Clients avec compte (relances liées à `ProductView` : comptes connectés uniquement, aucun tracking de visiteur anonyme dans ce projet)                                     |
| Destinataires / sous-traitants | **SMTP Brevo** (ou équivalent configuré)                                                                                                                                   |
| Durée de conservation          | Non explicite — liée au cycle de vie de la commande ou du compte                                                                                                           |

## D.7 Avis produits, questions, fidélité, parrainage

| Champ                          | Détail                                                                                                                     |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Finalité                       | Avis clients, questions/réponses produit, programme de fidélité et de parrainage                                           |
| Base légale                    | Intérêt légitime / consentement implicite à la publication (avis, questions) ; exécution du contrat (fidélité, parrainage) |
| Données                        | `Review`, `ProductQuestion`, `LoyaltyAward`, `User.referralCode/referredById`, `ReferralReward`, `GiftCard`                |
| Personnes concernées           | Clients                                                                                                                    |
| Destinataires / sous-traitants | Aucun                                                                                                                      |
| Durée de conservation          | Non explicite — conservées même après anonymisation du compte (rattachées à un compte devenu anonyme, voir D.8)            |

## D.8 Droits des personnes (self-service)

| Champ                     | Détail                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Finalité                  | Export des données personnelles (portabilité) et suppression de compte (effacement)                                                                                                                                                                                                                                                                                                                             |
| Base légale               | Obligation légale (RGPD art. 15, 17, 20)                                                                                                                                                                                                                                                                                                                                                                        |
| Où                        | `/auth/settings/donnees` — export JSON complet ; suppression par **anonymisation** (`$lib/prisma/user/anonymizeUser.ts`), jamais de suppression physique du compte                                                                                                                                                                                                                                              |
| Détail de l'anonymisation | Vide les champs identifiants de `User` (email, nom, mot de passe...), supprime `SavedPaymentMethod` (+ détachement Stripe), `Address`, `WishlistItem`, `StockAlert`, `ProductView`, jetons de session/réinitialisation ; conserve `Order`/`Transaction`/`Review`/`ReturnRequest`/`ProductQuestion`/`LoyaltyAward`/`ReferralReward` rattachés au compte désormais anonyme, pour l'obligation comptable de 10 ans |
| Même flux côté admin      | `/admin/users?/deleteUser` utilise la même fonction (un bug qui supprimait les commandes au lieu de les conserver a été corrigé, voir le résumé exécutif de la [Partie C](#partie-c--conformit%C3%A9-r%C3%A9glementaire-e-commerce))                                                                                                                                                                            |

## D.9 Détection de fraude / scoring de risque

| Champ                          | Détail                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Finalité                       | Prévention de la fraude à la commande (calcul d'un score de risque avant paiement)                                                                                                                                                                                                                                                               |
| Base légale                    | Intérêt légitime (art. 6.1.f) — prévention de la fraude                                                                                                                                                                                                                                                                                          |
| Données                        | Vélocité de commandes sur 24h, écart entre adresse de livraison et de facturation, domaine d'e-mail jetable connu → `Order.riskScore/riskLevel/riskFactors`, `Transaction` (recopié), `FraudBlock` (commandes bloquées)                                                                                                                          |
| Personnes concernées           | Clients                                                                                                                                                                                                                                                                                                                                          |
| ⚠️ Point d'attention RGPD      | Si le blocage automatique est activé (`StoreSettings.fraudBlockingEnabled`), il s'agit d'une **décision automatisée produisant un effet juridique** (commande refusée) — l'article 22 RGPD peut s'appliquer (droit à une intervention humaine, à contester la décision). À faire trancher avec un juriste si ce module est activé en production. |
| Destinataires / sous-traitants | Aucun                                                                                                                                                                                                                                                                                                                                            |
| Durée de conservation          | **Non explicite dans le code —** `FraudBlock` n'a aucune purge identifiée, conservation actuellement permanente par défaut (voir « Points ouverts »)                                                                                                                                                                                             |

## D.10 Wishlist, alertes stock, navigation produit

| Champ                          | Détail                                                                                                                                                                                |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Finalité                       | Liste d'envies, alertes de réassort, historique de navigation (relance produits consultés)                                                                                            |
| Base légale                    | Action explicite de l'utilisateur (clic « cœur », inscription à une alerte)                                                                                                           |
| Données                        | `WishlistItem`, `StockAlert`, `ProductView` (comptes connectés uniquement — le « récemment consulté » vitrine anonyme est en `localStorage` navigateur, jamais un traitement serveur) |
| Personnes concernées           | Clients avec compte                                                                                                                                                                   |
| Destinataires / sous-traitants | Aucun                                                                                                                                                                                 |
| Durée de conservation          | Supprimées à l'anonymisation du compte (D.8)                                                                                                                                          |

## D.11 Journal d'audit admin

| Champ                          | Détail                                                                                                         |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Finalité                       | Traçabilité des actions administrateur (sécurité)                                                              |
| Base légale                    | Intérêt légitime / obligation de sécurité (art. 32)                                                            |
| Données                        | `AdminAuditLog` (acteur, action, cible, métadonnées) — sans clé étrangère, survit à la suppression d'un compte |
| Personnes concernées           | Administrateurs (acteurs) et clients (cibles des actions journalisées)                                         |
| Destinataires / sous-traitants | Aucun                                                                                                          |
| Durée de conservation          | **Non explicite dans le code — aucune purge identifiée** (voir « Points ouverts »)                             |

## D.12 Formulaire de contact

| Champ                          | Détail                                                     |
| ------------------------------ | ---------------------------------------------------------- |
| Finalité                       | Traiter une demande envoyée via le formulaire de contact   |
| Base légale                    | Consentement / mesures précontractuelles (art. 6.1.a ou b) |
| Données                        | `ContactSubmission` (nom, email, sujet, message)           |
| Personnes concernées           | Visiteurs, avec ou sans compte                             |
| Destinataires / sous-traitants | Destinataire interne par e-mail                            |
| Durée de conservation          | Non explicite dans le code                                 |

### Sous-traitants (destinataires tiers)

| Sous-traitant              | Rôle                                           | Statut                                                                                                                                                                |
| -------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stripe                     | Paiement, remboursement                        | Confirmé, en usage actif                                                                                                                                              |
| Sendcloud                  | Expédition, étiquettes, suivi                  | Confirmé, en usage actif                                                                                                                                              |
| Cloudinary                 | Hébergement des images                         | Confirmé, en usage actif                                                                                                                                              |
| Vercel                     | Hébergement de l'application                   | Confirmé, en usage actif                                                                                                                                              |
| Neon                       | Hébergement de la base de données (PostgreSQL) | Confirmé, en usage actif                                                                                                                                              |
| SMTP (Brevo ou équivalent) | Envoi des e-mails transactionnels et marketing | Confirmé, en usage actif                                                                                                                                              |
| Upstash (Redis + QStash)   | Cache, verrous, file d'attente de jobs         | Confirmé, en usage actif                                                                                                                                              |
| Google                     | Connexion OAuth (si utilisée par le client)    | Confirmé, en usage conditionnel                                                                                                                                       |
| **Sentry**                 | Monitoring d'erreurs (serveur + navigateur)    | **Confirmé présent (**`SENTRY_DSN`), absent de l'audit précédent — peut capturer des IP/contextes de requête ; aucun `Sentry.setUser()` explicite trouvé dans le code |
| **TinyMCE**                | Éditeur de texte riche (back-office)           | Clé API présente, SDK chargé côté client admin — à vérifier si le cloud TinyMCE est réellement utilisé ou seulement la version auto-hébergée                          |
| api-adresse.data.gouv.fr   | Autocomplétion d'adresse                       | API publique gouvernementale, sans clé — pas un sous-traitant au sens RGPD                                                                                            |

Confirmé absent : aucun SDK analytics/publicitaire (Google Analytics, Meta
Pixel, Matomo...), aucune IA/LLM, aucun SMS.

### Points ouverts (à trancher, pas des bugs)

1. `FraudBlock` n'a aucune purge automatique — les tentatives de commande
   bloquées pour fraude sont conservées indéfiniment. À faire trancher :
   une durée de conservation raisonnable (ex. 1 à 3 ans) est probablement
   attendue au regard du principe de minimisation (art. 5.1.e).
2. `AdminAuditLog` n'a aucune purge automatique — même remarque, avec la
   nuance que ce journal a une vraie justification de sécurité qui peut
   légitimer une conservation plus longue.
3. **Blocage automatique de fraude = décision automatisée** (`fraudBlockingEnabled`)
   — vérifier l'applicabilité de l'art. 22 RGPD avant activation en
   production (droit à une intervention humaine).
4. **~~Contentful~~** ~~semble être un sous-traitant configuré mais inutilisé~~
   — retiré (`.env.example`, `.env.test.example`, CI) : clés supprimées,
   plus aucun accès à révoquer.
5. **Sentry** ajouté à `/confidentialite` (était absent) — reste à vérifier
   ce qu'il capture réellement (IP, corps de requête, éventuel PII dans les
   messages d'erreur).
6. **Identité du responsable de traitement et DPO** — voir en haut de
   cette partie, même blocage que les mentions légales ([C.3](#c3-mentions-l%C3%A9gales--identification-lcen)).
