# Tests end-to-end

La suite Playwright couvre deux domaines, exécutés en séquence (un seul worker) :

- authentification : un parcours unique, `e2e/auth/journey.spec.ts` ;
- administration : accès (`e2e/admin/security.spec.ts`) et CRUD des comptes
  (`e2e/admin/users.spec.ts`). Les autres sections du back-office n'ont pas
  encore de tests fonctionnels.

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

Playwright démarre lui-même le serveur de développement sur le port 4173
(`PORT` dans `playwright.config.ts`) ; rien n'est à lancer à la main. Le serveur de
dev compile chaque route à la première visite, ce qui explique la première étape
particulièrement lente — une cinquantaine de secondes pour neuf pages jamais
visitées. Ce n'est pas un blocage.

## Ce qui est vérifié, étape par étape

Chaque étape joue d'abord les cas refusés, puis le cas accepté. Un refus est
confirmé à la fois par l'interface et par l'état en base : un message d'erreur
affiché alors que la donnée a changé quand même ne peut pas passer inaperçu.

| Étape     | Cas refusés vérifiés                                                     | Cas accepté                                   |
| --------- | ------------------------------------------------------------------------ | --------------------------------------------- |
| 1         | 9 pages protégées visitées anonymement                                   | redirection vers connexion / mot de passe oublié |
| 2–3       | pseudo trop court, adresse mal formée, 5 règles de mot de passe          | compte créé, non vérifié, mot de passe haché  |
| 4–5       | code trop court, code inexistant, code périmé par un renvoi              | adresse vérifiée                              |
| 6–7       | nouveau mot de passe trop court, mot de passe courant erroné            | mot de passe changé, sessions révoquées       |
| 8–9       | compte inconnu, ancien mot de passe, mot de passe erroné                | connexion avec le nouveau mot de passe        |
| 10–11     | adresse déjà utilisée, adresse inchangée avant saisie du code            | adresse migrée après validation du code       |
| 12–13     | adresse inconnue, code erroné, accès direct au formulaire, mot de passe faible | mot de passe réinitialisé               |
| 14–15     | code TOTP trop court, code TOTP erroné                                   | 2FA configurée, code de secours délivré       |
| 16        | code TOTP erroné, page du compte visitée sans second facteur validé      | session promue après saisie du code           |
| 17        | code de secours trop court, code de secours erroné                       | 2FA retirée, code de secours renouvelé        |
| 18        | code TOTP calculé sur une clé de configuration périmée                    | 2FA reconfigurée, déconnexion complète        |

## Administration

`e2e/admin/security.spec.ts` vérifie que `/admin` est fermé : un visiteur
anonyme est renvoyé à la connexion, un `CLIENT` à l'accueil, y compris pour les
POST (`?/deleteUser`, `?/deletePromo`). Un `ADMIN` atteint le tableau de bord
et la liste des comptes.

`e2e/admin/users.spec.ts` couvre le CRUD des utilisateurs : liste sans fuite de
secrets, promotion de rôle, refus d'un rôle hors enum, bascule MFA, suppression.
Le CRUD produits / blog / promo / ventes / contacts est reporté.

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
| `http://localhost:4173 is already used` ou `EADDRINUSE 2525` | Une exécution interrompue a laissé le serveur de dev ou la boîte SMTP en vie. Libérer les ports : `fuser -k 4173/tcp 2525/tcp 2526/tcp`. |
| `Can't reach database server`                     | Neon en veille ou IPv6 capricieux sous WSL. Les lectures rejouent déjà ; relancer. |
| Le test attend un code d'email indéfiniment       | La boîte SMTP n'a pas démarré : vérifier que `SMTP_HOST`/`SMTP_PORT` de `.env.test` visent bien le sink local. |
| « Too many requests » inattendu                   | Une tentative invalide a été ajoutée sans marge. Voir le tableau des limiteurs. |
| Les données de dev sont modifiées                 | `DATABASE_URL` de `.env.test` ne contient pas `schema=e2e`, ou les guillemets manquent autour de l'URL. |
| `strict mode violation` sur un message            | Message présent en toast et sous le champ : utiliser `expectMessage()`.         |
