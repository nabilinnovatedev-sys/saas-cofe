# Préparation de messages Instagram

Accès administrateur : **Instagram** dans la barre latérale, route `/admin/instagram`. Cette page reste réservée aux administrateurs de la plateforme.

## Utilisation

1. Importer un fichier CSV, XLSX ou XLS contenant une colonne `nom` et une colonne `instagram`.
2. Vérifier ou modifier le lien et le modèle français/arabe. `{{name}}` et `{{link}}` sont remplacés localement.
3. Utiliser **Aperçu**, puis **Copier le message**.
4. Utiliser **Ouvrir Instagram**, démarrer la conversation et coller le message manuellement.

La colonne Instagram accepte un identifiant (`cafe_atlas`), un identifiant précédé de `@` ou une URL de profil complète. Les liens de publication, Reel, Story ou conversation sont refusés.

## Confidentialité et limites

- Le fichier est lu dans le navigateur par un Web Worker. Il n’est pas envoyé au serveur et disparaît au rechargement ou au changement de page.
- Aucun message n’est envoyé automatiquement. Instagram ne permet pas de préremplir un DM arbitraire depuis un simple lien.
- « Copié » signifie uniquement que le navigateur a confirmé la copie dans le presse-papiers, pas que le message a été collé ou envoyé.
- Le compte n’est transmis à Instagram que lorsque l’administrateur clique explicitement sur **Ouvrir Instagram**.
- Les fichiers sont limités à 5 Mo, 2 000 lignes et 100 colonnes. Les formules Excel sont refusées.
- Les comptes du fichier exemple sont illustratifs.

## Vérification

`npm run test -w @cafe/web` vérifie les identifiants et URLs Instagram, les doublons, les filtres, le modèle de message, l’exemple CSV, les classeurs XLSX/XLS, les en-têtes français/arabe, les limites et le blocage des formules.
