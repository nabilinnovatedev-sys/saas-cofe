# Plateforme multi-cafés

Produit conforme au cahier des charges : administration privée, menu public sans compte et application mobile Expo distincte pour les serveurs. L’autorité métier se trouve dans PostgreSQL/Supabase (RLS, contraintes et fonctions sécurisées), pas dans les interfaces.

Pour comprendre comment le projet fonctionne et pourquoi chaque dossier existe, consulter [ARCHITECTURE.md](./ARCHITECTURE.md).

## Organisation

- `apps/web` : React/Vite, routes admin et sites publics `/:slug`.
- `apps/waiter-mobile` : React Native/Expo, commandes temps réel, historique et push.
- `packages/domain` : types, cycle canonique et calculs partagés.
- `supabase/migrations` : schéma, RLS, Storage, Realtime et fonctions SQL.
- `supabase/functions` : commandes invitées, suivi, comptes, appareils et worker push.

## Prérequis

Node 22.13+, npm 10+, Docker Desktop pour Supabase local, Supabase CLI 2+, et un compte Expo/EAS pour les notifications sur appareil.

```bash
npm install
cp .env.example apps/web/.env.local
cp apps/waiter-mobile/.env.example apps/waiter-mobile/.env
```

Renseigner seulement l’URL Supabase et la clé publique `anon`/publishable dans les applications. Une clé `service_role` ne doit jamais se trouver dans un fichier web/mobile.

## Développement local complet

```bash
supabase start
supabase db reset
cp supabase/.env.example supabase/.env.local
# Remplacer chaque exemple par un secret fort. Pour DEVICE_ENCRYPTION_KEY :
openssl rand -base64 32
supabase functions serve --env-file supabase/.env.local
npm run dev:web
# Dans un autre terminal :
npm run dev:mobile
```

`supabase status` affiche l’URL et la clé anon locales à reporter dans les deux `.env`. Le seed fourni est volontairement commenté et facultatif.

### Premier administrateur

Déployer/démarrer `bootstrap-admin`, choisir un `BOOTSTRAP_SECRET` temporaire et un mot de passe d’au moins 12 caractères, puis :

```bash
export BOOTSTRAP_SECRET='le-meme-secret-que-la-fonction'
export ADMIN_PASSWORD='un-mot-de-passe-long-et-unique'
./scripts/bootstrap-admin.sh http://127.0.0.1:54321 admin@example.ma 'Administrateur'
unset BOOTSTRAP_SECRET ADMIN_PASSWORD
```

La fonction refuse toute création si un administrateur existe déjà. En production, supprimer ensuite `BOOTSTRAP_SECRET` et, idéalement, ne plus déployer cette fonction.

## Projet Supabase hébergé existant

Ces commandes appliquent des migrations : examiner le diff avant toute base contenant déjà des données. Aucune migration distante n’a été exécutée par ce dépôt.

```bash
supabase login
supabase link --project-ref VOTRE_PROJECT_REF
supabase db diff --linked
supabase db push --dry-run
supabase db push
supabase secrets set --env-file supabase/.env.production
supabase functions deploy create-order track-order admin-staff register-device push-worker push-receipts bootstrap-admin
```

Dans **Authentication → URL Configuration**, ajouter `cafe-waiter://auth` aux URL de redirection autorisées (invitation et récupération mobile), ainsi que l’origine web de production. Vérifier aussi le fournisseur email et son expéditeur avant d’inviter un serveur.

Configurer deux crons Supabase avec l’en-tête `x-worker-secret` : `push-worker` chaque minute et `push-receipts` toutes les deux minutes. Le premier réclame atomiquement l’outbox après commit et envoie un texte générique; le second contrôle les receipts Expo et désactive les appareils signalés `DeviceNotRegistered`.

## Lancement et vérification

```bash
npm run typecheck
npm test
npm run build
supabase test db
```

Le parcours manuel de référence est : connexion admin → créer un café → enregistrer l’identité → créer catégorie/produits → créer une table et conserver son QR → publier → ouvrir le QR → commander → se connecter dans l’app serveur → accepter puis faire progresser jusqu’à « Servie ».

## Mobile et notifications

Remplacer les identifiants d’application dans `app.json`, créer le projet EAS, puis renseigner `EXPO_PUBLIC_EAS_PROJECT_ID` :

```bash
cd apps/waiter-mobile
npx eas-cli login
npx eas-cli init
npx eas-cli build --profile development --platform android
# ou --platform ios (compte Apple requis)
```

Expo Go ne permet pas de valider tout le comportement des notifications distantes. Les notifications d’arrière-plan/fermé doivent être testées sur un appareil physique avec un development build ou un build signé. Fournir les credentials APNs et FCM demandés par EAS.

## Déploiement web

```bash
npm run build
```

Déployer `apps/web/dist` sur Vercel, Netlify ou un hébergeur statique. `vercel.json` et `public/_redirects` fournissent le fallback SPA. Définir les trois variables `VITE_*` lors du build et faire pointer `VITE_PUBLIC_MENU_URL` vers l’origine publique réelle.

## Décisions MVP documentées

Un QR opaque par table est obligatoire pour envoyer; l’URL générale reste consultable. La devise est définie par café (MAD par défaut), sans taxe ni frais. Un produit indisponible reste visible avec un badge. L’annulation est autorisée par serveur/admin avant l’état terminal avec un motif. La route publique est `/:slug`.

## Limites de vérification externe

Sans projet Supabase lié ni téléphone signé, le déploiement distant, l’envoi APNs/FCM, la lecture des receipts, le scan physique des QR et les tests E2E sur appareils ne peuvent pas être certifiés localement. Les composants et procédures nécessaires sont néanmoins inclus; aucun fallback silencieux vers des données simulées n’est utilisé.
# saas-cofe
