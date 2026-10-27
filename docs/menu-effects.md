# Fonds, animations et intros

Dans **Design & templates**, le studio propose :

- fond du template (inchangé), couleur personnalisée ou dégradé ; indépendant de la couverture ;
- apparition douce, glissement ou zoom pour les catégories et produits ;
- intro avec le logo et le nom : apparition, pulsation ou rideau ;
- deux compositions supplémentaires : **Carte · Invitation du café** (carte inclinée qui se déplie), **Cercles · Ouverture immersive** (anneaux animés et révélation circulaire) ;
- quatre couleurs indépendantes pour toutes les intros : fond, texte, effets/bordures, surface de la carte/du logo/du bouton. Le texte du bouton reste automatiquement contrasté ; les couleurs du fichier logo ne sont pas modifiées ;
- durée de 1 à 4 secondes, bouton pour passer et bouton pour rejouer dans le studio.

Sans logo, une icône café est utilisée. Les intros ne sont pas rejouées lors d’un changement de catégorie, mais le sont à chaque ouverture/rechargement du menu. Les préférences `prefers-reduced-motion` désactivent les animations et l’intro. Aucun son, aucune vidéo ni dépendance d’animation supplémentaire.

Les cartes gardent une surface claire. Le texte autour s’adapte à un fond uni sombre ; avec un dégradé, les textes sont placés sur des surfaces opaques pour rester lisibles.

## Installation

Appliquer `supabase/migrations/202610260001_menu_effects.sql`, puis `supabase/migrations/202610260002_intro_variants_colors.sql` avant de sauvegarder les nouvelles options. Puis déployer le web. Aucune Edge Function à déployer. Le client affiche une erreur explicite si la migration manque. Les couleurs nulles gardent les valeurs automatiques ; les couleurs choisies sont conservées lors du changement d’intro. Le bouton de réinitialisation réactive les valeurs automatiques.

**Enregistrer le design**, puis **Publier**. Les nouveaux champs sont copiés dans la publication via le trigger existant ; une modification du brouillon ne change pas le menu public avant publication. Les anciennes publications restent compatibles et sans animations par défaut.

## Vérifications

`npm run check` : types, tests unitaires (couleurs, valeurs par défaut, limites, compatibilité) et build. Le script `supabase/tests/menu_effects.sql` vérifie la publication, l’isolation du brouillon, l’historique et les contraintes ; il s’exécute dans une transaction annulée.
