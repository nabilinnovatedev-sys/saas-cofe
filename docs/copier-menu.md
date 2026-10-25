# Copier un menu à la création d’un café

Dans **Cafés → Créer un café → Menu de départ**, choisir **Copier le menu de Cafe Mondialito**, puis **Créer et copier le menu**. Mondialito apparaît en tête des cafés sources. Le choix par défaut reste un menu vide.

La copie reprend toutes les catégories et tous les produits : noms, descriptions, prix, ordre, images, visibilité et disponibilité. La devise du café source est conservée pour éviter une conversion implicite des prix.

Chaque catégorie et produit reçoit un nouvel identifiant, lié uniquement au nouveau café. Les modifications de prix, de noms ou de disponibilité ne se propagent jamais à l’autre café. Les images existantes sont référencées par leur chemin Storage (pas dupliquées physiquement) ; remplacer une image dans l’éditeur envoie un nouveau fichier sous le dossier du café cible. Ne pas supprimer manuellement les fichiers partagés dans Storage tant qu’une copie les utilise.

Le café source reste inchangé. La copie correspond à son catalogue courant au moment de la création, pas à un modèle figé ou nécessairement à sa dernière publication. Aucun logo, design, compte, commande, réglage de livraison, table ou QR n’est copié. Le nouveau café reste en brouillon : vérifier son identité et son menu avant de le publier.

## Installation et vérification

Appliquer `supabase/migrations/202610250001_copy_cafe_menu.sql` avant de déployer le nouveau frontend. Cette migration ajoute uniquement la RPC `admin_create_cafe` ; elle ne modifie aucun catalogue existant. Ne pas réexécuter toutes les anciennes migrations sur une base déjà initialisée manuellement.

Seul un administrateur de plateforme actif peut appeler la RPC. La création et la copie sont atomiques : une erreur annule toute l’opération. Une adresse publique déjà utilisée est refusée.

`supabase/tests/copy_cafe_menu.sql` vérifie les permissions, la copie des champs, les identifiants indépendants, l’absence de publication automatique, les sources vides/inexistantes, les devises différentes et les doublons. Les fixtures sont annulées par `ROLLBACK`.
