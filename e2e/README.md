# Tests end-to-end

La suite Playwright couvre quatre domaines, exécutés en séquence (un seul worker) :

- authentification : un parcours unique, `e2e/auth/journey.spec.ts` ;
- administration : accès (`e2e/admin/security.spec.ts`) et CRUD des comptes
  (`e2e/admin/users.spec.ts`) ;
- catalogue : vitrine (`e2e/products/catalog.spec.ts`) et CRUD admin produits
  (`e2e/products/admin.spec.ts`) ;
- commerce : panier (connecté + invité), checkout, ventes (`e2e/commerce/*.spec.ts`).

## Authentification

Un seul scénario, `e2e/auth/journey.spec.ts`, joue tout le cycle de vie d'un
compte dans une session de navigateur unique : inscription, vérification
d'adresse, changement de mot de passe, changement d'adresse, mot de passe oublié,
double authentification, code de secours, déconnexion.

Le choix d'un parcours continu plutôt que de fichiers séparés est délibéré :

- les états s'enchaînent réellement (une adresse changée reste changée, un mot de
  passe remplacé cesse de fonctionner), ce que des tests indépendants ne
  vérifient pas ;
- l'enregistrement vidéo produit une seule prise, lisible de bout en bout ;
- les limiteurs de débit, tous en mémoire du serveur, sont sollicités une fois
  chacun au lieu d'être saturés par des tests parallèles.

## Lancer les tests

```bash
npm run test:e2e          # exécution simple
npm run test:e2e:video    # avec vidéo, copiée dans e2e-videos/
npm run test:e2e:headed   # navigateur visible, avec vidéo
npm run test:e2e:ui       # mode interactif Playwright
npm run test:e2e:report   # dernier rapport HTML
```

Le parcours étant un test unique de deux à trois minutes, les rapporteurs
standard n'écriraient rien avant la fin. `e2e/support/step-reporter.ts` annonce
donc chaque étape en direct :

```
[00:56] ✓ 1. Les pages protégées sont fermées aux visiteurs anonymes (54413 ms)
[01:06] ✓ 2. Inscription : les saisies invalides sont refusées (9680 ms)
```

Pour suivre le déroulé à l'écran, `test:e2e:headed` ouvre le navigateur (sous WSL,
via WSLg). Les délais d'action sont bornés à 20 s : un geste qui n'aboutit pas
échoue vite, en nommant le geste fautif, au lieu d'épuiser le délai du test.

Prérequis :

- `.env.test` à la racine (voir `.env.test.example`). Il pointe sur le schéma
  PostgreSQL `e2e`, distinct du schéma de développement ;
- `npx playwright install chromium` une première fois ;
- la base Neon accessible. Les URL contenant `&` **doivent** rester entre
  guillemets dans `.env.test`.

Playwright démarre Vite sur le **port 2000**, le même que `npm run dev`. Arrêtez
le serveur de développement avant les tests (`fuser -k 2000/tcp`) : la suite
doit injecter `.env.test` (schéma `e2e`, SMTP local). Si `npm run dev` reste
ouvert, le port est pris et les emails partiraient vers Brevo.

Le serveur compile chaque route à la première visite, ce qui explique la
première étape particulièrement lente — une cinquantaine de secondes pour neuf
pages jamais visitées. Ce n'est pas un blocage.

## Procédures — ce que font les tests

Les titres numérotés sont ceux des `test.step(...)` dans les specs. Pour changer
ce qui est testé : modifier cette liste, le `test.step` du même numéro, puis le
code métier. Les copies par module sont dans `docs/auth`, `docs/admin` et
`docs/products`.

Chaque étape joue d'abord les cas refusés, puis le cas accepté. Un refus est
confirmé par l'interface **et** par l'état en base.

### Auth — `e2e/auth/journey.spec.ts`

Un seul scénario continu (les états s'enchaînent).

| # | Étape | Refusé | Accepté |
| - | ----- | ------ | ------- |
| 1 | Les pages protégées sont fermées aux visiteurs anonymes | 9 routes `GUARDED_PAGES` | redirection login / mot de passe oublié |
| 2 | Inscription : les saisies invalides sont refusées | pseudo court, email HTML, 5 règles MDP | reste sur `/auth/signup`, pas de session |
| 3 | Inscription : le compte est créé, non vérifié | — | session, `emailVerified=false`, hash argon |
| 4 | Vérification de l'adresse : les codes invalides sont rejetés | code trop court, code inexistant | `emailVerified` reste faux |
| 5 | Vérification de l'adresse : un renvoi invalide le code précédent | ancien code après « Renvoyer » | nouveau code → `/auth`, vérifié |
| 6 | Mot de passe : un mot de passe courant erroné ne change rien | MDP trop court, courant faux | hash inchangé |
| 7 | Mot de passe : le changement révoque les autres sessions | — | 1 session, cookie conservé |
| 8 | Connexion : les identifiants erronés sont refusés | compte inconnu, ancien MDP, MDP faux | pas de cookie |
| 9 | Connexion : le nouveau mot de passe est accepté | — | redirection `/` |
| 10 | Changement d'email : une adresse déjà prise est refusée | email occupé | email du compte inchangé |
| 11 | Changement d'email : effectif après validation du code | avant le code, email encore l'ancien | code reçu sur la **nouvelle** adresse |
| 12 | Mot de passe oublié : demande et code invalides | email inconnu, code faux, GET `/reset-password` | reste sur verify-email |
| 13 | Mot de passe oublié : réinitialisation avec le bon code | MDP trop court | 1 session, `/auth` |
| 14 | 2FA : un code de configuration invalide n’enregistre rien | TOTP court / faux | `totpKey` reste null |
| 15 | 2FA : configuration acceptée et code de secours délivré | — | code affiché = code chiffré en base |
| 16 | 2FA : la session reste bridée jusqu’à la saisie du code | TOTP faux, GET `/auth/settings` | après Verify → `/auth` |
| 17 | Code de secours : refusé s’il est faux, à usage unique sinon | trop court, faux | 2FA retirée, nouveau recovery |
| 18 | Reconfiguration de la 2FA puis déconnexion complète | TOTP calculé sur une clé périmée | setup OK, `signOut`, 0 session |

Test à part : déconnexion depuis le tiroir panier (`signOutFromCart`) — cookie
absent, 0 session, GET `/auth/settings` → `/auth/login`.

Constantes du spec à ajuster en même temps : `GUARDED_PAGES`, `WEAK_PASSWORDS`.

### Admin accès — `e2e/admin/security.spec.ts`

Routes fermées : `ADMIN_PATHS` dans `e2e/support/admin.ts`.

| # | Étape | Geste | Preuve |
| - | ----- | ----- | ------ |
| 1 | Un visiteur anonyme est renvoyé à la connexion | GET chaque `ADMIN_PATHS` | `/auth/login` |
| 2 | Un CLIENT est renvoyé à l’accueil | inscription + GET chaque path | `/` |
| 3 | Un CLIENT ne peut pas muter (users, promo) | POST `?/deleteUser`, `?/deletePromo` | lignes encore en base |
| 4 | Un ADMIN atteint le tableau de bord et les comptes | `promoteToAdmin` + GET `/admin`, `/admin/users` | titres Accueil / Utilisateurs |

### Admin utilisateurs — `e2e/admin/users.spec.ts`

| # | Étape | Geste | Preuve |
| - | ----- | ----- | ------ |
| 1 | La liste affiche les emails, sans secret | recherche dans le tableau | 3 emails visibles ; pas de hash / totp / recovery |
| 2 | Promotion CLIENT → ADMIN | fiche → menu ADMIN → Save | `role === ADMIN` en base |
| 3 | Un rôle hors enum est refusé | POST `SUPERUSER` | `role` reste `CLIENT` |
| 4 | La MFA se bascule depuis la fiche | checkbox + Save | `isMfaEnabled === true` |
| 5 | Suppression d’un CLIENT | dialogue Continue | disparu du tableau **et** de la base |

Test à part (sans numéro) : un CLIENT qui GET `/admin/users/:id` d'un autre
compte est renvoyé à `/`.

### Catalogue vitrine — `e2e/products/catalog.spec.ts`

| # | Étape | Geste | Preuve |
| - | ----- | ----- | ------ |
| 1 | La liste affiche le nom Prisma | GET `/products` | titres Catalogue + nom, lien catégorie |
| 2 | La fiche s’ouvre par slug | GET `/products/[slug]` | nom, prix, ligne en base |
| 3 | Un slug inconnu renvoie 404 | GET slug absent | statut 404 |
| 4 | Pas d’UI d’édition admin sur la vitrine | HTML de `/products` | pas de `/admin/products` ni `passwordHash` |

### Catalogue admin — `e2e/products/admin.spec.ts`

La création UI (Cloudinary) n'est pas jouée : `.env.test` n'a pas d'upload réel.
Les produits sont posés en Prisma (`createCatalogProduct`), puis le CRUD passe
par l'interface.

| # | Étape | Geste | Preuve |
| - | ----- | ----- | ------ |
| 1 | La liste admin affiche les produits | GET `/admin/products`, recherche | ligne du tableau Produits |
| 2 | Création Prisma visible sur la vitrine | GET `/products` | heading du nom + ligne en base |
| 3 | Édition prix et stock | fiche admin → 9,99 / 7 → Save | DB + fiche publique « 9.99 € », « Stock : 7 » |
| 4 | Suppression d’un produit sans commande | dialogue Continue | produit absent en base |
| 5 | Un produit commandé est refusé à la suppression | même geste sur un `OrderItem` | produit **encore** en base |

Test à part : un CLIENT POST `?/deleteProduct` — le produit reste.

### Commerce panier — `e2e/commerce/cart.spec.ts`

| # | Étape | Geste | Preuve |
| - | ----- | ----- | ------ |
| 1 | Fiche : ajouter au panier | bouton « Ajouter au panier » | UI + `OrderItem` |
| 2 | save-cart d'une autre commande | POST id étranger | 403 |
| 3 | Prix posté ≠ catalogue | POST `price: 0.01` | persisté = catalogue |

### Commerce panier invité — `e2e/commerce/guest.spec.ts`

| # | Étape | Geste | Preuve |
| - | ----- | ----- | ------ |
| 1 | Anonyme : ajouter puis recharger | bouton puis reload | item encore visible |
| 2 | Anonyme puis inscription | signup après add | `OrderItem` en base, localStorage vide |
| 3 | Compte + invité (autre produit) | login après add invité | les deux lignes en base |

### Commerce checkout — `e2e/commerce/checkout.spec.ts`

| # | Étape | Geste | Preuve |
| - | ----- | ----- | ------ |
| 1 | Anonyme GET `/checkout` | navigation | `/auth/login` |
| 2 | CLIENT avec panier | `/checkout` | sélecteur d'adresse |
| 3 | POST sans adresse / sans être proprio | `?/checkout` | 400 / 403 |
| 4 | Paiement simulé | helper Prisma | order payée n'est plus `PENDING` |

### Commerce ventes — `e2e/commerce/sales.spec.ts`

| # | Étape | Geste | Preuve |
| - | ----- | ----- | ------ |
| 1 | ADMIN voit la transaction | `/admin/sales` | cellule email |
| 2 | CLIENT GET `/admin/sales` | navigation | `/` |
| 3 | Facture user : uniquement la sienne | GET facture d'un autre | 404 |

Hors périmètre encore : CRUD blog, promo, contacts. Pas de Stripe réel, pas de Sendcloud.

## Architecture des utilitaires

`e2e/support/` contient tout ce qui n'est pas le scénario lui-même.

- **`db.ts`** — client Prisma branché explicitement sur l'URL de `.env.test`, et
  lectures d'état (`requireUser`, `countSessions`, `getRecoveryCode`,
  `getTotpKey`). Les secrets chiffrés sont déchiffrés ici : le module applicatif
  `src/lib/lucia/encryption.ts` dépend de `$env/static/private` et n'est pas
  importable hors du bundle SvelteKit. Chaque lecture passe par `resilient()`,
  qui rejoue la requête si Neon sort de veille, pour qu'une coupure réseau ne se
  lise pas comme une régression.
- **`smtp-sink.ts`** — serveur SMTP en mémoire qui capte les emails sortants et
  les expose sur une petite API HTTP (`SMTP_HTTP_PORT`). Aucun email ne sort de
  la machine.
- **`mailbox.ts`** — lecture de cette boîte. `waitForEmailCode(adresse)` attend
  l'email destiné à une adresse, décode le corps _quoted-printable_ et en extrait
  le code à usage unique. Les codes sont donc relevés là où l'utilisateur les
  lit, et non en base : si l'envoi casse, le test casse.
- **`fixtures.ts`** — un compte neuf par test, supprimé à la fin, et une adresse
  IP unique injectée via `X-Forwarded-For` pour que les limiteurs par IP repartent
  de zéro.
- **`flows.ts`** — gestes réutilisables (connexion, déconnexion, saisie de code,
  configuration TOTP) et petites aides d'assertion. Toutes les saisies passent par
  `fillStable()`, voir plus bas.
- **`step-reporter.ts`** — l'avancement en direct dans la console.
- **`global-setup.ts`** — applique les migrations sur le schéma `e2e`, purge les
  comptes de test résiduels, démarre la boîte SMTP, et referme tout à la fin.

## Points d'attention pour faire évoluer le scénario

**Limiteurs de débit.** Ils vivent en mémoire du serveur et ne sont pas réinitialisés
entre les étapes. Ajouter des tentatives invalides consomme un budget réel ; le
tableau ci-dessous donne les marges disponibles.

| Limiteur                                    | Budget          | Clé        | Consommé par le parcours |
| ------------------------------------------- | --------------- | ---------- | ------------------------ |
| `hooks.server.ts`                           | 100 / 1 s       | IP         | ~60 requêtes             |
| signup `ipBucket`                           | 3 / 10 s        | IP         | 1                        |
| login `throttler`                           | 0,1,2,4,8,16… s | compte     | 2 échecs                 |
| `verify-email` (saisie du code)             | 5 / 30 min      | compte     | 4 ← marge la plus mince  |
| `sendVerificationEmailBucket` (renvoi)      | 3 / 10 min      | compte     | 1                        |
| `forgot-password` (IP et compte)            | 3 / 60 s        | IP, compte | 1                        |
| `reset-password/verify-email`               | 5 / 30 min      | compte     | 2                        |
| `totpBucket`                                | 5 / 30 min      | compte     | 2                        |
| `recoveryCodeBucket`                        | 3 / 60 min      | compte     | 2                        |

Le throttler de connexion impose une attente **croissante** entre deux échecs sur
un même compte : `waitOutLoginThrottle()` la fait patienter explicitement. Sans
cela, la tentative suivante reçoit « Too many requests » au lieu du message
attendu. Toute nouvelle tentative de connexion ratée décale d'un cran toutes les
suivantes.

**Validation côté client.** Chaque formulaire déclare `validators: zodClient(...)`.
Une saisie invalide est donc bloquée dans le navigateur et n'atteint jamais le
serveur : ces cas ne consomment aucun budget, mais ils ne prouvent rien sur la
validation serveur. Pour tester celle-ci, il faut poster directement via
`request.post()`.

**Messages.** Les erreurs serveur remontent en toast (`svelte-sonner`) et,
lorsqu'elles portent sur un champ, également sous le champ. `expectMessage()`
retient la première occurrence pour éviter l'échec du mode strict de Playwright.

**Saisies après un refus.** Superforms réinjecte les données postées dans le
formulaire quand l'action échoue. Ce rendu peut survenir juste après la saisie
suivante et l'écraser : le champ affiche alors la bonne valeur au moment où on
l'observe, mais c'est l'ancienne qui repart au serveur. D'où `fillStable()`, qui
laisse passer un cycle de rendu et réessaie tant que la saisie ne tient pas. Toute
nouvelle saisie doit passer par cette aide, `locator.fill()` seul étant instable
sur ces formulaires.

**Résultats d'action et superforms.** Une action pilotée par superforms doit
toujours renvoyer son `form`, via `message(form, …)` ou `fail(400, { form })`. Un
`fail()` portant une autre charge laisse le client croire que la soumission est
toujours en cours : le formulaire refuse alors toute nouvelle tentative, sans
message ni erreur visible. C'est exactement ce que le scénario a mis au jour sur
`/auth/verify-email`, en soumettant un code erroné avant le bon.

**Sélecteurs.** Les composants shadcn-svelte réservent des surprises : `CardTitle`
rend un `div` (donc `getByText`, pas `getByRole('heading')`), et un `Button` avec
`href` rend un `<a>` (donc `getByRole('link')`).

**Slash final.** Les redirections serveur visent `/auth/`, que SvelteKit normalise
en `/auth`. D'où `waitForPath()` / `currentPath()`, qui comparent des chemins sans
slash final, plutôt que des motifs glob.

**Nettoyage.** La fixture supprime le compte de son adresse d'origine. Comme le
scénario change l'adresse en cours de route, il termine par un `deleteUser()`
explicite sur l'adresse finale. Les commandes doivent partir avant l'utilisateur :
l'application crée un panier dès qu'un utilisateur connecté charge une page, et la
relation `Order → User` est en `Restrict`.

## Hors périmètre

- **Connexion Google OAuth** : nécessite un fournisseur externe, non simulé.
- **Activation de la 2FA par l'interface** : le commutateur est commenté dans les
  paramètres alors que l'action serveur existe. Le scénario pose donc le drapeau
  en base (`enableMfa`) pour atteindre les parcours 2FA. À remplacer par un vrai
  clic si l'interface est rétablie.
- **Second facteur pendant la réinitialisation de mot de passe**
  (`/auth/reset-password/2fa`) : la 2FA n'est configurée qu'après cette étape du
  parcours. Le couvrir demanderait un second compte.
- **Expiration des codes et des sessions** : dépend du temps, à traiter avec une
  horloge simulée plutôt qu'en attendant.

## Dépannage

| Symptôme                                          | Cause probable                                                                 |
| ------------------------------------------------- | ------------------------------------------------------------------------------ |
| `http://localhost:2000 is already used` ou `EADDRINUSE 2525` | `npm run dev` ou une exécution interrompue occupe le port. Libérer : `fuser -k 2000/tcp 2525/tcp 2526/tcp`. |
| Vite refuse un fichier sous un autre dépôt (`Lezardoises`, `outside of Vite serving allow list`) | Un service worker PWA d'un autre projet est resté accroché à `localhost:2000`. Recharger une fois (le hook client le retire en dev) ou, dans Chrome : Application → Service Workers → Unregister. |
| `Can't reach database server`                     | Neon en veille ou IPv6 capricieux sous WSL. Les lectures rejouent déjà ; relancer. |
| Le test attend un code d'email indéfiniment       | La boîte SMTP n'a pas démarré : vérifier que `SMTP_HOST`/`SMTP_PORT` de `.env.test` visent bien le sink local. |
| « Too many requests » inattendu                   | Une tentative invalide a été ajoutée sans marge. Voir le tableau des limiteurs. |
| Les données de dev sont modifiées                 | `DATABASE_URL` de `.env.test` ne contient pas `schema=e2e`, ou les guillemets manquent autour de l'URL. |
| `strict mode violation` sur un message            | Message présent en toast et sous le champ : utiliser `expectMessage()`.         |
