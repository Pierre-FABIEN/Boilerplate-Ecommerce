# Conformité réglementaire e-commerce — pistes à traiter

Document vivant, dans le même esprit que `RESTE_A_FAIRE.md` et
`FEATURE_IDEAS.md` : bilan des obligations légales applicables à une
boutique en ligne France/UE (vente B2C, bijouterie/joaillerie), comparé à
l'état réel constaté dans ce dépôt. **Ceci n'est pas un avis juridique** —
à faire valider par un avocat/expert-comptable avant toute mise en
production réelle. Objectif : une liste de vérification de départ, pas un
audit juridique complet.

**Méthode** : chaque ligne a été vérifiée en lisant le code (routes,
schéma Prisma, `checkout.ts`) — pas une liste générique copiée d'ailleurs.

## Résumé exécutif

Les 3 points ci-dessous sont **traités côté code** (voir détail dans les
sections correspondantes plus bas, marquées ✅ mise à jour) :

1. **Pages légales créées** — `/mentions-legales`, `/cgv`,
   `/confidentialite` + pied de page + bannière cookies + case CGV
   obligatoire au checkout. Les champs d'identité de l'entreprise (SIRET,
   adresse, capital social...) sont désormais **saisissables depuis
   `/admin/identite`** (`StoreSettings.company*`) et affichés
   dynamiquement sur `/mentions-legales` et les factures/avoirs — restent
   `[À COMPLÉTER]` tant que personne ne les a saisis, je ne peux pas les
   inventer à la place de l'entreprise, voir la section 3.
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

Pour situer par rapport à `RESTE_A_FAIRE.md` : la purge RGPD automatisée
déjà en place (`$lib/server/jobs/cleanup.ts` — sessions expirées, tokens,
paniers abandonnés) couvre le principe de minimisation des données
(RGPD art. 5.1.e), **distinct** du droit à l'effacement sur demande d'une
personne (art. 17) — désormais traité lui aussi, voir section 1.

**Mise à jour (RGPD)** : les droits à la portabilité (art. 20) et à
l'effacement (art. 17) sont maintenant en self-service depuis
`/auth/settings/donnees` — export JSON complet, suppression par
**anonymisation** (jamais une suppression physique du compte :
`Order`/`Transaction` restent conservés, obligation comptable). Au
passage, un vrai bug a été trouvé et corrigé dans le flux admin existant
(`/admin/users?/deleteUser`) : il supprimait purement et simplement les
commandes du compte avant suppression, contredisant le commentaire du
schéma qui exige leur conservation — les deux flux partagent désormais
la même fonction correcte (`$lib/prisma/user/anonymizeUser.ts`).

**Mise à jour (consommation, mentions, fiscal)** :

- `/cgu` créée (contenu utilisateur : avis, questions produit,
  commentaires blog), liée depuis le pied de page.
- Garantie légale de conformité + vices cachés : déjà correctement
  couverte par `/cgv` section 6, acceptée avant commande via la case
  CGV — statut corrigé dans le tableau (était noté comme manquant à
  tort).
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

**Mise à jour (registre des traitements, délai de livraison)** :

- `REGISTRE_TRAITEMENTS.md` créé — brouillon de registre RGPD art. 30,
  12 traitements identifiés en lisant le code (comptes, commandes,
  livraison, marketing, fraude, avis, fidélité, self-service RGPD, audit
  admin, contact). Fait apparaître un sous-traitant absent de l'audit
  initial, **Sentry** (suivi d'erreurs, ajouté à `/confidentialite`), et un
  vestige de configuration inutilisé, **Contentful** (clés présentes en
  environnement/CI mais aucun usage dans le code) — retiré (`.env.example`,
  `.env.test.example`, CI). Deux durées de conservation non explicites
  relevées (`FraudBlock`, `AdminAuditLog`, aucune purge automatique
  identifiée) et un point d'attention sur le blocage automatique de fraude
  (décision automatisée, art. 22 RGPD à
  vérifier si ce module est activé en production).
- Délai de livraison engagé (Code conso. L216-1) : même principe que le
  taux de TVA — `StoreSettings.estimatedDelivery{Min,Max}Days`,
  configurable depuis `/admin/livraison`, `null` par défaut (rien affiché
  tant que l'admin n'a pas saisi une vraie estimation), affiché au
  checkout avant validation de commande une fois renseigné.

**Mise à jour (identité de l'entreprise)** : raison sociale, forme
juridique, capital social, adresse du siège, SIRET, n° de TVA
intracommunautaire, directeur de publication, téléphone et e-mail sont
désormais saisissables depuis **`/admin/identite`** (page dédiée, retirée
de `/admin/settings`, `StoreSettings.company*`) au lieu d'être figés en
`[À COMPLÉTER]` dans le code ou pilotés uniquement par des variables
d'environnement (`INVOICE_COMPANY_*`, conservées comme repli). Reste,
comme avant, une saisie humaine — le code ne peut toujours pas deviner
l'identité réelle de l'entreprise.

Vérifié : chaque endroit du site qui affiche cette identité la lit bien
depuis cette même source (`getCompanyIdentity()`/`getInvoiceCompany()`),
sans copie figée qui pourrait diverger — `/mentions-legales` (placeholder
tant qu'un champ n'est pas rempli), pied de page (`Footer.svelte`, nom
affiché dans le copyright, replie sur le nom de marque tant que la raison
sociale n'est pas saisie), factures/avoirs PDF, aperçu HTML de facture et
e-mails de facture/avoir. `/cgv` et `/confidentialite` ne dupliquent rien,
ils renvoient vers `/mentions-legales`.

**Mise à jour (SEO)** : `src/lib/seo.config.ts` contenait des métadonnées
génériques d'un ancien boilerplate (« studio web, agence web, identité
visuelle... ») sans rapport avec la bijouterie — réécrit pour décrire la
vraie activité. `/products` et `/blog` n'avaient aucune balise SEO du
tout (`<SEO>` jamais monté) : ajoutées.

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
  `/sitemap.xml` (seul le blog était requêté) — corrigé.
- **Zones privées** : aucune page n'envoyait `noindex` — `/admin/*` et
  `/auth/*` (y compris `/auth/settings/*`) sont désormais en `noindex`
  posé une seule fois au niveau du layout (`+layout.svelte`), pas page par
  page, pour couvrir automatiquement toute sous-page future. `/checkout`,
  `/checkout/success` et `/suivi-commande` (transactionnels, aucune valeur
  SEO) également passés en `noindex`.
- **Articles de blog** (`/blog/[slug]`) : aucun SEO propre à l'article
  (titre/description génériques du site) — corrigé, avec JSON-LD
  `Article` (pas de champ `excerpt` en base : description dérivée du
  contenu HTML, tronquée).
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
  (au-delà du `noindex` uniforme).

**Mise à jour (logo de l'entreprise)** : `/admin/identite` permet
désormais d'envoyer un vrai logo (PNG/JPEG, même mécanisme d'upload
Cloudinary que les images produit — `StoreSettings.companyLogoUrl`,
`null` par défaut, jamais de logo inventé). Utilisé à trois endroits :
JSON-LD `Organization` (`SEO.svelte`, remplace une référence
`/logo.png` qui n'a jamais existé), en-tête des factures/avoirs PDF (le
logo est récupéré et incrusté au moment de la génération,
`fetchLogoForPdf` — best-effort, une facture se génère toujours même si
l'image est injoignable) et affiché sur `/mentions-legales`. Ne remplace
pas `og-default.jpg` : une carte 1200×630 composée automatiquement à
partir d'un logo carré risquerait d'être mal cadrée, contrairement à la
carte typographique dédiée ci-dessus.

**Mise à jour (navigation admin)** : le taux de TVA et le délai de
livraison, jusque-là deux formulaires empilés en haut de la page
« Modules e-commerce » (`/admin/settings`), ont chacun leur propre page
(`/admin/tva`, `/admin/livraison`) avec une entrée dédiée dans la
navigation admin — même principe que l'identité de l'entreprise
(`/admin/identite`, section 3). `/admin/settings` ne porte plus que les
interrupteurs de modules.

---

## 1. Protection des données personnelles (RGPD + CNIL)

| Obligation                       | Base légale                    | État constaté                 | Piste                                                                                                                                                                                                                                                                                                                                         |
| -------------------------------- | ------------------------------ | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Politique de confidentialité     | RGPD art. 13-14                | ✅ `/confidentialite`         | Distincte des CGV                                                                                                                                                                                                                                                                                                                             |
| Bannière cookies/traceurs        | Directive ePrivacy, reco. CNIL | ✅ `CookieNotice.svelte`      | Information (aucun traceur non essentiel actif) plutôt qu'un consentement, cohérent avec l'état réel du site                                                                                                                                                                                                                                  |
| Consentement marketing opt-in    | RGPD art. 6                    | ✅ En place                   | `User.marketingEmailsOptIn`, défaut `false`, déjà bien distingué des e-mails transactionnels                                                                                                                                                                                                                                                  |
| Sécurité technique des données   | RGPD art. 32                   | ✅ En place                   | Argon2id, TOTP/recovery chiffrés AES, 2FA — bon niveau technique                                                                                                                                                                                                                                                                              |
| Minimisation / purge automatique | RGPD art. 5.1.e                | ✅ En place                   | `cleanup.ts` — sessions, tokens, paniers `PENDING` abandonnés                                                                                                                                                                                                                                                                                 |
| Droit d'accès et rectification   | RGPD art. 15-16                | 🟡 Partiel                    | Rectification via `/auth/settings` déjà possible ; pas de vue « toutes mes données »                                                                                                                                                                                                                                                          |
| Droit à la portabilité           | RGPD art. 20                   | ✅ `/auth/settings/donnees`   | Export JSON complet (profil, adresses, commandes, factures, avis, questions, liste d'envies, retours, fidélité)                                                                                                                                                                                                                               |
| Droit à l'effacement sur demande | RGPD art. 17                   | ✅ Anonymisation self-service | `anonymizeUser()` — jamais de suppression physique du compte, `Order`/`Transaction` conservés (obligation comptable) ; même fonction réutilisée par l'admin (bug de perte de données corrigé au passage)                                                                                                                                      |
| Registre des traitements         | RGPD art. 30                   | 🟡 Brouillon rédigé           | `REGISTRE_TRAITEMENTS.md` — 12 traitements identifiés en lisant le code, sous-traitants recensés (dont Sentry, absent de l'audit initial ; Contentful, vestige inutilisé, retiré) ; reste à signer avec l'identité réelle du responsable de traitement, et à trancher 2 durées de conservation non explicites (`FraudBlock`, `AdminAuditLog`) |

## 2. Droit de la consommation & vente à distance

| Obligation                                   | Base légale                                    | État constaté             | Piste                                                                                                                                                                                                                                                            |
| -------------------------------------------- | ---------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CGV                                          | Code com. L441-1, Code conso. L111-1           | ✅ `/cgv` + case à cocher | Case obligatoire dans l'action `checkout`, revalidée côté serveur                                                                                                                                                                                                |
| Droit de rétractation (14 j)                 | Code conso. L221-18 à L221-28                  | ✅ `ReturnRequest.kind`   | `WITHDRAWAL` vs `WARRANTY`, sans motif requis pour une rétractation, remboursement déjà intégral (frais de port inclus) dans les deux cas                                                                                                                        |
| Exclusion pour biens personnalisés           | Code conso. L221-28, 3°                        | ✅ Appliqué               | Option masquée côté client ET revérifiée côté serveur si `Transaction.shippingOption === 'no_shipping'`                                                                                                                                                          |
| Garantie légale de conformité + vices cachés | Code conso. L217-3 s., Code civil art. 1641 s. | ✅ `/cgv` section 6       | Mention déjà présente (conformité + vices cachés), acceptée avant validation de commande via la case CGV                                                                                                                                                         |
| Médiateur de la consommation                 | Code conso. L616-1 s.                          | 🟡 Partiel                | Section dédiée dans `/mentions-legales` + renvoi dans `/cgv` ; reste à désigner et contractualiser un médiateur réel (décision métier, deux options de référence déjà listées)                                                                                   |
| Délai de livraison engagé                    | Code conso. L216-1 s.                          | ✅ Configurable           | `StoreSettings.estimatedDelivery{Min,Max}Days`, modifiable depuis `/admin/livraison` (même principe que le taux de TVA : `null` par défaut, rien affiché tant que l'admin n'a pas saisi une vraie estimation) — affiché au checkout avant validation de commande |

## 3. Mentions légales & identification (LCEN)

| Obligation                | Base légale       | État constaté           | Piste                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------- | ----------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Page « Mentions légales » | LCEN art. 6-III-1 | 🟡 Saisissable en admin | Raison sociale, forme juridique, capital social, adresse, SIRET, TVA intracommunautaire, directeur de publication : configurables depuis `/admin/identite` (`StoreSettings.company*`), affichés dynamiquement sur `/mentions-legales` et sur les factures/avoirs — reste `[À COMPLÉTER]` tant que personne ne les a saisis, ce qui reste une décision humaine |
| CGU                       | Bonne pratique    | ✅ `/cgu`               | Couvre le contenu utilisateur (avis, questions produit, commentaires blog) et la responsabilité associée                                                                                                                                                                                                                                                      |

## 4. Facturation, prix & fiscalité

| Obligation                    | Base légale                             | État constaté           | Piste                                                                                                                                                                                                                                                                                            |
| ----------------------------- | --------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Taux de TVA correct           | CGI art. 278 s.                         | 🟡 Configurable         | `StoreSettings.vatRate`, modifiable depuis `/admin/tva` — reste à saisir le bon taux (20 % attendu), décision volontairement laissée à un humain                                                                                                                                                 |
| Mentions obligatoires facture | Code com. L441-9, CGI art. 242 nonies A | ✅ SIRET + TVA affichés | `InvoiceCompany.siret`/`.vat` imprimés sur le PDF facture/avoir et l'aperçu HTML — priorité à l'identité saisie depuis `/admin/identite` (section 3), repli sur `INVOICE_COMPANY_*` (env) puis sur un placeholder manifestement fictif si rien n'est saisi                                       |
| Affichage des prix TTC        | Arrêté du 3 déc. 1987                   | ✅ Corrigé              | Catalogue, fiche produit (+ ventes croisées, récemment consultés), liste d'envies affichaient le prix HT stocké sans conversion — désormais convertis en TTC à l'affichage (`toTTC()`, `$lib/utils/price.ts`) ; panier/commande restent inchangés (HT + TVA déjà détaillés séparément, conforme) |
| Guichet unique TVA (OSS)      | CGI art. 298 sexdecies-G                | ❌ Manquant             | Pertinent seulement au-delà de 10 000 €/an de ventes hors France vers l'UE                                                                                                                                                                                                                       |

## 5. Paiement en ligne

| Obligation                   | Base légale                   | État constaté | Piste                                                                   |
| ---------------------------- | ----------------------------- | ------------- | ----------------------------------------------------------------------- |
| PCI-DSS                      | Norme sectorielle obligatoire | ✅ En place   | Stripe Checkout hébergé, aucune donnée carte ne transite par le serveur |
| Authentification forte (SCA) | DSP2                          | ✅ En place   | Gérée nativement par Stripe Checkout (3D Secure)                        |

## 6. Spécifique métaux précieux & diamants

| Obligation                         | Base légale                                 | État constaté  | Piste                                                                                                                                                                                                                                                                                  |
| ---------------------------------- | ------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Titrage/poinçon métal précieux     | CGI art. 521 s.                             | 🟡 Infra dispo | Aucun champ dédié, mais le système générique de taxonomies (`/admin/products/taxonomies`, type `NUMBER` + unité) permet déjà de créer une taxonomie « Titrage » et de saisir une valeur par produit — reste une tâche de saisie de données réelles (fournisseur), pas de développement |
| Traçabilité/certification diamants | Processus de Kimberley, normes sectorielles | 🟡 Partiel     | Rejoint l'idée « certificat d'authenticité » de `FEATURE_IDEAS.md` — ici adossée à une vraie obligation de transparence, pas qu'un argument marketing                                                                                                                                  |

## 7. Accessibilité numérique

| Obligation | Base légale                       | État constaté       | Piste                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------- | --------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| RGAA       | Loi n°2005-102, décret n°2019-768 | 🟡 Audit léger fait | Pas un audit de certification (nécessite un expert RGAA si le seuil de CA applicable est atteint), mais un passage ciblé sur les pages clientes (catalogue, fiche produit, checkout, compte, pages légales) : `lang="fr"` déjà présent, alt text déjà correct partout, aucun `<div onclick>` au clavier-inaccessible détecté. Corrigé : champ de recherche catalogue sans nom accessible, boutons icône seule sans `aria-label` (panier, retirer un article du panier x2, moyens de paiement enregistrés, interrupteurs mode sombre/plein écran), `aria-label` en anglais sur la page adresses (incohérent avec le reste du site en français), lien « Aller au contenu » ajouté (absent auparavant). **Reste à vérifier manuellement** : contraste des couleurs (`text-muted-foreground` très utilisé pour le texte secondaire, à mesurer dans un navigateur en clair et sombre) — pas calculable sans rendu réel. |

---

Pas encore priorisé collectivement : à faire confirmer point par point avec
un avocat/expert-comptable avant d'attaquer l'implémentation, en commençant
par le résumé exécutif ci-dessus.
