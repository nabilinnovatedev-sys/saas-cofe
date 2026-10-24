# Livraison et QR

## Administration

Dans **Cafés → votre café → Tables & QR**, activez **Activer la livraison**.
Le réglage est désactivé par défaut et prend effet immédiatement, sans republication.
Le café doit néanmoins être actif et avoir un menu publié.

- **QR livraison · PNG / PDF** : ouvre `/<slug>?mode=delivery`. Aucun numéro de table, téléphone ou emplacement client n'est encodé dans ce QR.
- **QR de table** : le numéro extrait du libellé apparaît au centre. Sans numéro, le libellé est utilisé. Correction d'erreur H et zone centrale limitée pour garder le QR lisible.
- Régénérer un QR de table invalide l'ancien lien. Les secrets existants sont stockés sous forme de hash : ils ne sont pas récupérables pour réimprimer l'ancien QR.
- Avant impression, configurez `VITE_PUBLIC_MENU_URL` avec l'origine HTTPS publique et reconstruisez le web. `localhost` ne fonctionne pas depuis le téléphone d'un client. Vérifiez un scan de l'impression réelle.

## Client

Le QR livraison présélectionne **Livraison** dans le panier. Le client ajoute ses produits, saisit son téléphone et choisit **Autoriser et partager ma position**. La confirmation reste bloquée tant que ces informations manquent. Le refus, l'absence de GPS et le délai dépassé sont expliqués avec une possibilité de réessayer.

La position est demandée uniquement après ce clic, jamais automatiquement. Le client doit être au lieu de livraison et peut vérifier le point sur la carte. Le téléphone et les coordonnées ne sont pas conservés dans le stockage du navigateur ; ils sont envoyés au café lors de la confirmation. Le serveur vérifie le format du téléphone, les bornes des coordonnées et l'activation de la livraison. Des coordonnées reçues ne permettent pas de prouver matériellement la position d'un appareil.

La géolocalisation nécessite un contexte sécurisé et l'autorisation du navigateur : [documentation MDN](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation/getCurrentPosition).

Il n'y a pas de tarif de livraison ni de zone géographique automatique dans cette version. Le total reste celui des produits. Les commandes sur place gardent leur QR de table obligatoire et ne demandent ni téléphone ni localisation.

## Application serveur

Les commandes arrivent dans la liste existante et le canal temps réel. **Livraison** remplace le nom de table. Dans le détail : téléphone, coordonnées, **Appeler le client**, **Ouvrir le lieu de livraison**. Le dernier bouton devient **Marquer livrée** (statut interne `servie`, compatible avec l'historique existant).

Les données sont accessibles aux administrateurs et aux serveurs actifs du café via les politiques RLS existantes. Le lien public de suivi ne renvoie pas le téléphone ni les coordonnées. L'outbox push reste générique et n'inclut pas ces données.

Le code mobile est dans `apps/waiter-mobile/App.tsx`. Un contrôle TypeScript ne remplace pas un essai sur téléphone : tester l'appel, la carte, le temps réel, puis les notifications foreground/background avec un build configuré EAS, APNs/FCM. Voir [la configuration Expo](https://docs.expo.dev/push-notifications/push-notifications-setup/).

## Base et vérifications

- Migration : `supabase/migrations/202610230005_delivery_orders.sql`.
- Edge Function à déployer : `create-order`.
- Tests SQL : `supabase/tests/delivery_orders.sql` (fixtures annulées par `ROLLBACK`, aucun vrai client ni notification envoyé).
- Tests applicatifs : `npm run check`.

Les migrations précédentes de ce projet ayant été exécutées manuellement, ne pas relancer aveuglément toutes les migrations avec `db push`. Appliquer uniquement la migration manquante sur un projet existant.
