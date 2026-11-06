---
id: t38
title: Intégrer la nouvelle identité visuelle (logo, favicon, icône) et aligner le style de l'app
status: done
priority: normal
story:
depends_on: []
plan_required: true
review: required
model: opus
effort: high
zones: [apps/web/static, apps/web/src/app.html, apps/web/src/app.css, apps/web/src/lib/components, apps/web/src/lib/ui, apps/web/DESIGN.md, apps/ios/Poj]
branch: ticket/t38-identite-visuelle
agent: a05f65d88472449a7
created: 2026-11-06
updated: 2026-11-06
---

## Context
Le développeur fournit une nouvelle identité visuelle et demande de l'intégrer avec le skill `impeccable` ; « le style de l'app doit suivre ».

Assets (copiés depuis `~/Downloads/poj-logo/`) dans `.ork/tickets/captures/t38-identite-visuelle/` :
- `poj-logo.svg` (clair : marque teal + mot « poj » en `#1E222B`), `poj-logo-dark.svg` (fond `#1E222B`, texte `#F6F5F1`), `poj-logo-white.svg` (sans fond, texte `#F6F5F1`, pour fond sombre) ;
- `poj-mark.svg` (marque seule : trois barres croissantes teal `#0F766E` en opacités 0.35 / 0.65 / 1 et un point au-dessus de la dernière, qui forme un « i » / « j ») ;
- `favicon.svg` (32 px, carré arrondi teal, trois barres blanches, sans point) et `favicon-180.png` (apple-touch) ;
- `poj-app-icon.svg` et `poj-app-icon-1024.png` (icône d'app, avec le point) ;
- aperçus : `apercu-favicon.png`, `apercu-app-icon.png`.

Palette de la marque : teal `#0F766E`, encre `#1E222B`, papier `#F6F5F1`.

## Done criteria
- [ ] Le `Wordmark` de l'app (shell, `AuthShell`, en-têtes) utilise le nouveau logo, en clair et en sombre (`poj-logo` / `poj-logo-white`), à la taille actuelle.
- [ ] Favicon SVG, apple-touch-icon 180 px et, si présent, manifeste web mis à jour.
- [ ] Icône de l'app iOS (`AppIcon` 1024) remplacée, `project.yml` restant la seule source.
- [ ] Les tokens du design system (`app.css`, `DESIGN.md`) suivent la palette de la marque (accent teal `#0F766E`, encre, papier), en gardant le contraste AA en clair et en sombre ; le plan dit ce qui change visuellement.
- [ ] Revue `impeccable` sur les écrans principaux (login, cartes, révision, consentement) en clair et en sombre, avec captures.
- [ ] Les tests passent (`ios:test` si `apps/ios` est touché).

## Plan
Rendu le 2026-11-06 (opus, high). Branche `ticket/t38-identite-visuelle`.
1. Worktree ; `favicon.svg` remplace `src/lib/assets/favicon.svg` ; `favicon-180.png` → `static/apple-touch-icon.png` + `<link rel="apple-touch-icon">` dans `app.html`. Pas de manifeste ni de `favicon.ico`.
2. `Wordmark.svelte` en SVG inline (tracés de `poj-logo.svg`, viewBox recadré `22 13 210.3 95`), `size` = hauteur (22 px barre latérale, 28 px AuthShell, ~49 px de large au lieu de 59) ; couleurs par tokens `light-dark()` (respecte `data-theme`) : nouveaux tokens `mark` (barres : teal en clair, papier en sombre) et `brand` (point, teal fixe) ; `role="img" aria-label="poj"`.
3. `tokens.css` à la palette de la marque (valeurs ci-dessous, AA vérifié dans les deux thèmes) ; `theme-color` de `app.html`.
4. iOS : `Poj/Assets.xcassets` avec `AppIcon.appiconset` (1024 universelle) ; `ASSETCATALOG_COMPILER_APPICON_NAME: AppIcon` dans `project.yml` (aucune icône aujourd'hui).
5. PNG aplatis sur le teal (`magick -background '#0F766E' -flatten -alpha off`) : iOS refuse l'alpha et applique son masque.
6. Docs : `DESIGN.md` (indigo → teal, « The One Teal Rule »), `.impeccable/design.json`, `PRODUCT.md`, commentaires.
7. Spec client `Wordmark.svelte.spec.ts` (nom accessible « poj »).
8. Revue impeccable : 16 captures (login, cartes, révision, consentement × clair/sombre × 390/1280) dans le scratchpad, à verser par l'orchestrateur dans `.ork/tickets/captures/t38-…` ; `detect.mjs`, une passe de corrections, une de confirmation.
9. test_command, `ios:test`, `ios:project` + `ios:build`.

**Ce qui change à l'écran :** accent indigo vif (~#5b4fd6) → teal sourd #0F766E (deux fois moins saturé : bouton principal, puces, Horizon, focus, cases…) ; fonds clairs froids → papier chaud (`surface` = #F6F5F1, `canvas` ~#FBFAF7, `raised` blanc) ; `ink` = #1E222B ; sombre : fonds ardoise de la famille de l'encre, texte papier ; nouveau logo (barres + point + lettrage vectoriel), favicon teal, apple-touch, icône iOS.
Valeurs (clair | sombre) : canvas 0.985 0.004 95 | 0.175 0.012 266 ; surface #F6F5F1 | 0.205 0.014 266 ; raised blanc | 0.235 0.016 266 ; hover 0.945 0.006 95 | 0.255 0.016 266 ; ink #1E222B | #F6F5F1 ; ink-3 0.52 0.016 266 | 0.67 0.01 95 ; accent #0F766E | 0.54 0.09 186 ; accent-text 0.47 0.08 186 | 0.80 0.10 182 ; accent-soft 0.955 0.025 186 | 0.265 0.04 186. Contrastes : blanc/teal 5,47 ; teal/papier 5,02 ; ink-3/papier 4,94.

**Décisions de l'ouvrier :** SVG inline par tokens plutôt que deux `<img>` ; opacités des barres 0,35/0,65 dans les deux thèmes ; PNG aplatis ; pas de manifeste.

**À trancher :**
1. Papier en clair : A sur `surface` (page d'un papier plus clair) *(reco, 6/10)* ; B en fond de page, cartes blanches dessus, `surface` plus sombre.
2. Fond sombre : A ardoise profonde ~#121419 *(reco, 6/10)* ; B exactement #1E222B (plus clair, tous les `-soft` à refaire).
3. Teal (186) proche du vert Good (155) : garder 155 et juger sur captures, décaler à 145 si confus *(5/10)*.
4. Texte sombre en papier chaud plutôt que blanc froid *(reco, 6/10)*.
5. Apple-touch sans point, icône iOS avec point : suivre les assets.
6. `AccentColor` teal iOS : hors critères, non fait sauf demande.

**Risques :** papier chaud sur tous les écrans d'un coup (peut faire « sale ») ; `accent-soft` moins distinct ; `ios:build` long ; capture du consentement à scripter.

**À relire en premier (à l'exécution) :** `tokens.css` · 6/10 · palette sur les 16 captures ; `Wordmark.svelte` · 7/10 · lettrage à 22 px, point teal sur sombre (~3:1) ; `AppIcon.appiconset` · 8/10 · icône aplatie.

## Questions

## Review
DONE le 2026-11-06. 12 fichiers · +207 −139 · 2 commits, rebasé sur dev 5f5d8ff. Worktree `.claude/worktrees/t38-identite-visuelle` (recréé par l'ouvrier ; ports 5193-5194). 347 tests verts, `ios:test` vert ; `ios:project`/`ios:build` non lancés (`xcodegen` absent), catalogue vérifié par `xcrun actool`.
Captures (16) : `.ork/tickets/captures/t38-identite-visuelle/revue/{login,cards,review,consent}-{light,dark}-{mobile,desktop}.png`. Good garde 155 : distinct du teal sur les captures.
- Décisions : PNG aplatis sur le teal ; `accent` = `var(--color-brand)` dans les deux thèmes ; opacités du logo 0,35/0,65 en sombre ; échelle sombre un peu plus claire (canvas 0.185 au lieu de 0.16, raised 0.24 au lieu de 0.215), fond sombre #101318 ; pas de manifeste ni de `favicon.ico`.
- AUTO REVIEW /simplify : 3 corrections (teal à source unique `brand`, `ASSETCATALOG_COMPILER_APPICON_NAME` retiré car posé par le preset XcodeGen, spec qui lit le viewBox) + commentaire `canvas`/`theme-color`.

- [x] REVIEW FIRST — `apps/web/src/lib/styles/tokens.css:22` · 6/10 · toute la palette, à juger sur les captures (sombre, papier chaud en clair).
- [x] REVIEW FIRST — `apps/web/src/lib/components/Wordmark.svelte:21` · 6/10 · point teal du logo terne sur fond sombre (3,4:1, `consent-dark-mobile.png`) ; option : `accent-text` en sombre.
- [x] REVIEW FIRST — `apps/web/src/lib/components/Horizon.svelte:78` · 5/10 · non modifié : en sombre, barres non sélectionnées sourdes (1,8:1) ; réglage par thème = ticket à part. → Développeur : rien à faire, l'Horizon va bientôt changer (tapis roulant).
- [x] remaining — `apps/web/src/lib/components/Wordmark.svelte:11` · 8/10 · viewBox décalé (22 13), coordonnées de l'export gardées. (évident)
- [x] remaining — `apps/web/static/apple-touch-icon.png:1` · 7/10 · PNG commités sans source SVG ; sources dans `.ork/tickets/captures/t38-identite-visuelle/`. (évident)

## Log
- 2026-11-06 — créé depuis les assets envoyés par le développeur (logo, favicon, icône). Plan requis (> 5 fichiers, design system, iOS), relecture requise (choix visuels). Lancé en PLAN MODE (opus, high).
- 2026-11-06 — PLAN READY, attend la validation (4 choix visuels).
- 2026-11-06 — plan validé avec les recommandations (papier sur surface, sombre ardoise ~#121419, Good à 155 jugé sur captures, texte sombre papier, assets suivis, pas d'AccentColor iOS). Même ouvrier en EXECUTION MODE (opus, high), AUTO REVIEW /simplify.
- 2026-11-06 — DONE (opus, high). Relecture requise : in-review, 3 points. Captures versées dans `captures/t38-identite-visuelle/revue/`.
- 2026-11-06 — déploiement dev → main reporté par le développeur après l'intégration de t38.
- 2026-11-06 — relecture : palette ok, point du logo gardé tel quel, Horizon laissé (va changer). Intégré dans dev par avance rapide (2 commits, jusqu'à ab65443, sans conflit).
- 2026-11-06 — worktree et branche supprimés, worktree:prune lancé.
- 2026-11-06 — le développeur annonce le déploiement, mais origin/main est encore à 14a5541 (dev à ad8ef2c) : push non constaté.
- 2026-11-06 — déploiement constaté : origin/main = ad8ef2c. Test en conditions réelles sur Claude.ai à faire par le développeur.
