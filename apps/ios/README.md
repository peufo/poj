# poj — iOS (`apps/ios`)

App SwiftUI (iOS 18+, Swift 6 en concurrence stricte) qui consomme l'API du web.

```
project.yml                 définition XcodeGen (Poj.xcodeproj est généré et ignoré par git)
Config/*.xcconfig           API_BASE_URL par configuration (Debug : http://localhost:5173)
Poj/
  PojApp.swift              point d'entrée : bascule entre connexion et notes
  Config.swift              lit API_BASE_URL depuis l'Info.plist
  Auth/                     TokenStore (Keychain), SessionModel, LoginView
  Notes/                    NotesModel, NotesView
Packages/PojAPI/            Swift package local
  Sources/PojAPI/
    openapi.json            → lien vers packages/api-contract/openapi.json
    openapi-generator-config.yaml
    AuthMiddleware.swift    ajoute Authorization: Bearer <token>
    PojClient.swift         Client.poj(baseURL:token:)
```

## Lancer

```sh
brew install xcodegen                # une fois
bun run ios:project                  # depuis la racine, après chaque modif de project.yml
open apps/ios/Poj.xcodeproj
```

Démarrer le serveur web (`bun run dev` à la racine), puis lancer le schéma `Poj` sur un simulateur. Au premier build, Xcode demande d'autoriser le plugin `OpenAPIGenerator` (« Trust & Enable »). En ligne de commande, `bun run ios:build` passe `-skipPackagePluginValidation`.

## Auth

Better Auth avec le plugin `bearer`. `POST /api/auth/sign-in/email` (ou `sign-up`) renvoie le token dans l'en-tête `set-auth-token`, exposé par le client généré sous `ok.headers.setAuthToken`. Le token est stocké dans le Keychain, puis ajouté à chaque requête par `AuthMiddleware`. Une réponse 401 ramène à l'écran de connexion.

## Notes de toolchain

- `swift-collections` est plafonné à `< 1.7.0` dans `Package.swift`. Compilée avec Swift 6.4 (Xcode 27), la 1.7.0 référence `swift_initBorrow`, absent des runtimes iOS/macOS 26 : l'app plante au lancement. Retirer la contrainte quand le correctif sera publié, ou quand la cible minimale sera un OS qui fournit ce symbole.
- `bun run ios:test` lance `swift test` (macOS).
- `http://localhost` est autorisé en dev via `NSAllowsLocalNetworking`. Sur un appareil physique, remplacer `API_BASE_URL` par l'IP du Mac.
