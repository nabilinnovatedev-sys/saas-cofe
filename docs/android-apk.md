# APK Android de test

La version locale est compilée avec le variant `release` (JavaScript embarqué, pas de serveur Metro), mais signée avec la clé de **test** du projet Android généré. Elle sert aux essais internes, pas à la publication sur Google Play.

## Reconstruire sur ce Mac

Depuis la racine du dépôt :

```sh
npm run build -w @cafe/domain
cd apps/waiter-mobile
npx expo prebuild --platform android --no-install
cd android
JAVA_HOME=/opt/homebrew/opt/openjdk@17 ANDROID_HOME=/opt/homebrew/share/android-commandlinetools ./gradlew :app:assembleRelease -PreactNativeArchitectures=arm64-v8a,armeabi-v7a --console=plain
```

Si `repo.reactnative.dev` est inaccessible, ajouter `-I ../../../scripts/android-maven-mirror.gradle` à la commande Gradle. Ce script limite l'utilisation du miroir Maven Central hébergé sur Google Cloud au groupe `com.facebook.react`, sans modifier les dépôts globaux de la machine ni les versions des bibliothèques.

Sortie : `apps/waiter-mobile/android/app/build/outputs/apk/release/app-release.apk`.
Le dossier Android et les APK générés sont ignorés par Git. Gardez la même clé de signature pour les futures mises à jour ; une nouvelle clé ne permettra pas de mettre à jour une installation existante.

Les variables `EXPO_PUBLIC_SUPABASE_URL` et `EXPO_PUBLIC_SUPABASE_ANON_KEY` doivent être présentes dans `apps/waiter-mobile/.env` avant le build. Ne jamais embarquer de clé `service_role`.

## Utilisation

- Installer le fichier sur un appareil Android ARM (version minimale à vérifier dans le manifeste de l'APK final).
- Se connecter avec un compte **serveur actif**, créé dans l'administration du café. Un compte `platform_admin` n'est pas un compte serveur.
- Vérifier connexion, liste temps réel, changement de statut, téléphone et carte des livraisons sur un vrai appareil.
- Les notifications push nécessitent encore un projet EAS, la configuration FCM et les secrets/planifications backend associés. Leur présence dans le code ne signifie pas qu'elles sont opérationnelles.

Le profil EAS `preview` est aussi configuré explicitement en APK : après connexion et configuration du projet, `npx eas-cli build --platform android --profile preview`. Voir la [documentation Expo](https://docs.expo.dev/build-reference/apk/).
