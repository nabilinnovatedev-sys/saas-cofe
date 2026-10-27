# Fidélité — nom et téléphone, sans SMS

## Parcours

```text
Admin → café → Fidélité → activer, choisir seuil/cadeau/design → enregistrer
Serveur → achat vérifié → générer QR +1 (5 minutes, 1 usage)
Client → scanner → nom + téléphone à la première visite → carte + 1 point
Visites suivantes → même navigateur → scanner → +1 automatiquement
Seuil atteint → client affiche code cadeau (5 minutes)
Serveur → vérifier code + nom → confirmer remise → déduire le seuil
```

Le QR d’inscription permanent crée une carte **sans point**. Le QR temporaire du serveur donne un point. Aucun point n’est ajouté pour une simple ouverture du menu. La vérification de l’achat est manuelle : un serveur autorisé reste responsable de l’émission du QR.

## Accès et sécurité

- Aucun mot de passe, aucun SMS, aucun compte Supabase Auth créé pour le client.
- Nom/téléphone non vérifiés : le navigateur reçoit un secret aléatoire de 256 bits, conservé en `localStorage`. Seule son empreinte SHA-256 est stockée en base. Ne jamais transformer ce parcours en recherche publique par téléphone.
- Même navigateur : carte retrouvée automatiquement. Nouveau téléphone, navigation privée ou stockage effacé : récupération au comptoir après vérification en personne. Le serveur recherche le numéro exact **dans son café** et génère un QR de récupération. Son utilisation remplace l’ancien secret et invalide les anciens codes cadeau/récupération.
- Sans SMS, on ne peut pas prouver à distance la propriété d’un numéro. Une personne connaissant un numéro peut tenter une première inscription à sa place. Les litiges d’identité doivent être réglés en personne ; ne pas promettre une vérification téléphonique.
- QR d’attribution/récupération : aléatoire, usage unique, durée 5 minutes. Le token est dans le fragment `#award=…` / `#recover=…`, pas dans les logs HTTP de navigation. QR créé localement, jamais via un service externe d’images.
- Codes cadeau : 48 bits aléatoires, durée 5 minutes, limite de tentatives, confirmation serveur obligatoire. Ne pas les communiquer à un tiers.
- Tables membres/tokens/journal inaccessibles à `anon` et `authenticated`. Toute opération passe par la fonction Edge ; le RPC interne est réservé à `service_role`. Vérification du serveur actif et du café dans le RPC également.
- Attribution/débit atomiques sous verrou de programme, solde non négatif, journal à token unique. Réessayer un QR déjà consommé par le même membre ne donne aucun point supplémentaire.
- Changer le cadeau/seuil invalide les codes cadeau en cours. Les points restent acquis ; les clients voient le nouveau seuil immédiatement. Un cadeau retire exactement ce seuil : le surplus est conservé.
- Programme désactivé ou café suspendu : actions bloquées. Le programme est indépendant de la publication du menu et peut être activé sur un café en brouillon.
- 60 requêtes/minute par adresse IP hachée (public) ou compte serveur. Les compteurs expirés sont nettoyés lors des appels. Pas de logs de noms, numéros ou tokens.
- Les coordonnées sont destinées à la fidélité, pas à une inscription marketing. Le café doit définir sa politique de conservation et son processus de suppression ; aucun envoi promotionnel n’est implémenté ici.

## Installation

### État au 27 octobre 2026

La migration `202610260003_loyalty.sql` est appliquée au projet `xqnhvlzineawhsmplkic` et enregistrée dans `supabase_migrations.schema_migrations`. Les cinq tables, leur RLS, les permissions du RPC et la correspondance exacte avec le fichier local ont été vérifiés. Aucun programme n’a été activé et aucune donnée client n’a été créée pour ce déploiement.

**Attention :** l’historique distant était vide alors que les tables applicatives existaient déjà (migrations antérieures probablement exécutées manuellement). Seule la migration fidélité a été appliquée, dans une transaction avec son enregistrement dans l’historique. Ne pas exécuter `db push --include-all` sans réconcilier d’abord les anciennes migrations avec le schéma réel. Elles n’ont pas été marquées arbitrairement comme appliquées.

Le déploiement de la fonction Edge, du web et d’un nouvel APK reste distinct de cette migration.

1. Appliquer `supabase/migrations/202610260003_loyalty.sql` après les migrations précédentes. Ne pas relancer toutes les migrations dans SQL Editor. Avec CLI, vérifier d’abord les migrations en attente :

   ```sh
   supabase migration list
   supabase db push --dry-run
   ```

2. Vérifier les secrets de la fonction : `PUBLIC_WEB_ORIGIN` doit être **l’origine exacte du site public** (sans chemin), par exemple `https://saas-cofe-tqyi.vercel.app`. `ABUSE_HASH_SECRET` doit être un secret serveur aléatoire. Les variables Supabase serveur sont fournies par Supabase. Ne jamais mettre la service-role dans `VITE_*` ou `EXPO_PUBLIC_*`.

3. Déployer :

   ```sh
   supabase functions deploy loyalty --project-ref xqnhvlzineawhsmplkic
   ```

   `supabase/config.toml` configure `verify_jwt=false` car les clients ne sont pas connectés à Supabase Auth. Les opérations serveur vérifient explicitement le JWT avec `auth.getUser`, puis les droits en base.

4. Déployer le web, ouvrir un café → **Fidélité**, configurer et enregistrer. Les réglages sont appliqués immédiatement ; les menus historiques ne sont pas modifiés.
5. Recompiler et distribuer l’app serveur pour voir l’onglet **Fidélité**. Le code mobile est intégré, mais un ancien APK ne reçoit pas cette fonctionnalité automatiquement. Aucune nouvelle permission caméra n’est nécessaire : le client scanne avec son propre téléphone.

## Validation

```sh
npm run check
npx deno check supabase/functions/loyalty/index.ts
```

`npm run test:loyalty-db` exécute la migration réelle dans un PostgreSQL en mémoire [PGlite](https://pglite.dev/docs/), avec fixtures minimales des tables existantes. Il vérifie attribution unique, rejeu, expiration, isolation des cafés, permissions, récompense/surplus, récupération et limites de tentatives. PGlite utilise une seule connexion : les appels simultanés testés sont sérialisés, pas un test de charge multi-connexion Supabase.

Avant production, tester sur staging avec deux téléphones : inscription/scans, scan simultané du même QR, expiration, cadeau utilisé deux fois, récupération, désactivation, coupure réseau. Le build et les tests locaux ne remplacent pas cette recette sur appareils et backend déployé.
