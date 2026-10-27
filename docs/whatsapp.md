# Préparation de messages WhatsApp

Accès administrateur : **WhatsApp** dans la barre latérale, route `/admin/whatsapp`. Les serveurs ne peuvent pas accéder à cette page.

1. Importer un fichier XLSX, XLS ou CSV, par sélection ou glisser-déposer.
2. La première feuille doit contenir les en-têtes `nom` et `telephone`. Sont aussi reconnus : `nom du café` / `اسم المقهى` pour le nom, et `téléphone` / `الهاتف المنشور` / `الهاتف` / `رقم الهاتف` pour le numéro. Espaces, casse, accents et marques de direction du texte sont normalisés. Il faut une seule colonne par champ ; les colonnes supplémentaires (adresse, classement, liens, remarques) sont ignorées. Les téléphones au format texte sont préférables pour conserver le zéro national. Les CSV doivent être en UTF-8.
3. Vérifier les numéros normalisés et les messages. Modifier le modèle, le lien ou l’indicatif si nécessaire. `{{name}}` est remplacé à chaque occurrence, dans les deux langues, et `{{link}}` par le lien choisi.
4. Utiliser **Aperçu du message**, puis **Ouvrir WhatsApp**. Le lien `https://wa.me/NUMERO?text=MESSAGE_ENCODE` utilise `encodeURIComponent`. L’utilisateur doit envoyer lui-même le message dans WhatsApp.

L’exemple téléchargeable est `apps/web/src/assets/contacts-whatsapp.csv`. **Tester avec l’exemple** utilise le même lecteur local que l’import de fichiers. Les noms et numéros sont illustratifs : ne pas utiliser cet exemple pour envoyer de vrais messages.

## Confidentialité et suivi

- Le fichier est lu dans un Web Worker local, avec SheetJS CE 0.20.3 installé depuis son CDN officiel et embarqué dans le build. Aucune dépendance n’est chargée depuis un CDN tiers au moment de l’import.
- Aucun contact, fichier, modèle modifié ou statut n’est envoyé à Supabase ou à un autre serveur par cette fonctionnalité. Aucune persistance dans localStorage/IndexedDB ; changer de page ou recharger efface la liste et la progression. Les requêtes d’authentification habituelles de l’application restent présentes, sans les contacts.
- Seul un clic explicite sur le lien WhatsApp transmet le numéro et le message à WhatsApp. Pas de traitement en masse, d’envoi automatique, de suivi de lecture ni de confirmation d’envoi.
- « Ouvert » signifie **lien cliqué**, sans garantie que l’application WhatsApp a effectivement été ouverte ou que le message a été envoyé. Un lien ouvert depuis le menu contextuel du navigateur ne peut pas être détecté. **Remettre à faire** permet de corriger le statut.
- Les doublons normalisés et lignes invalides restent visibles mais ne peuvent pas être ouverts ; corriger le fichier puis le réimporter. Un import valide remplace la liste et réinitialise la progression ; un import échoué conserve l’ancienne liste.

## Limites et choix

- Maximum : 5 Mo, 2 000 lignes de contacts, 100 colonnes, première feuille uniquement. Lecture interrompue après 15 secondes. Pas d’import partiel silencieux.
- Les formules, dates, erreurs et cellules non numériques/texte sont refusées dans les champs requis. Les macros, liens de cellule et HTML ne sont jamais exécutés ou affichés comme HTML.
- Les indicatifs `+` et `00` restent internationaux ; les numéros nationaux commençant par `0` utilisent l’indicatif configuré, `212` par défaut. Un numéro court sans préfixe explicite utilise aussi cet indicatif (notamment quand Excel a supprimé le zéro national). Utiliser `+` pour lever toute ambiguïté sur des numéros étrangers.
- La validation de format ne garantit pas qu’un numéro possède un compte WhatsApp.
- Le lien demandé avec `?preview=...` est conservé par défaut. Cet aperçu nécessite une session administrateur. L’éditeur avertit de ce problème et propose explicitement de retirer `preview` pour utiliser le menu public, qui doit être publié et actif.

## Vérifications

`npm run check` exécute TypeScript, les tests du domaine et du web, puis le build de production. `npm run test -w @cafe/web` vérifie l’exemple CSV, des classeurs XLSX/XLS générés en mémoire, les caractères français/arabe, les numéros, doublons, filtres, limites et l’URL WhatsApp. Aucun test n’envoie de message.

L’audit npm du monorepo signale des dépendances existantes Expo/Vitest (notamment node-forge, zod, @vitest/mocker et tinypool). Cette fonctionnalité ne met pas à niveau ces chaînes d’outils ; ne pas exposer les serveurs de développement/tests sur Internet. SheetJS provient de la distribution officielle, pas de l’ancien paquet npm 0.18.5.

Aucune migration Supabase ni Edge Function supplémentaire n’est nécessaire. Un nouveau déploiement du frontend suffit après validation.

Références : [Click to chat WhatsApp](https://faq.whatsapp.com/5913398998672934), [installation officielle SheetJS](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/).
