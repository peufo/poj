---
id: T-0005
titre: Claude choisit le deck d'une carte capturée (outil MCP pour lister les decks)
statut: pret
priorite: normale
story: doc/story/decks.md
plan_requis: true
modele: opus
effort: high
zones: [apps/web/src/lib/server/mcp, apps/web/src/lib/server/domain/decks]
branche:
agent:
cree: 2026-10-29
maj: 2026-10-29
---

## Contexte
Ce ticket fait suite à T-0003 (modèle ouvert aux decks : type langue ou sujet, noms des faces, option des deux sens). Dans T-0003, le deck d'une carte est le deck par défaut, implicite. Ici, Claude choisit le deck d'une carte capturée : il le **déduit**, par exemple de la langue de l'expression, ou il **demande** quand il hésite. Voir la story `doc/story/decks.md`.

Règles de la story :
- **Deck de langue :** vérification DeepL, comme aujourd'hui.
- **Deck de sujet :** pas de second avis. La relecture par Claude, suivie de ma confirmation, reste obligatoire.
- **Révision avec Claude :** « on révise » mélange tous les decks. On peut aussi demander un deck précis.

## Critères de fin
- [ ] Un outil MCP liste les decks : nom, type, langues ou noms des faces, nombre de cartes.
- [ ] La création et la vérification d'une carte acceptent un deck explicite. Sans deck, c'est le deck par défaut.
- [ ] Les consignes MCP disent à Claude :
  - [ ] de déduire le deck ou de demander en cas de doute ;
  - [ ] de vérifier avec DeepL seulement pour un deck de langue ;
  - [ ] de toujours relire la carte avant de la créer.
- [ ] La révision accepte un deck facultatif. Sans deck, elle mélange tous les decks.
- [ ] `doc/specs/mcp.md` est à jour.
- [ ] Les tests passent.

## Plan
(à rédiger en MODE PLAN)

## Questions

## Journal
- 2026-10-29 — créé depuis la story decks. Part après T-0003, puis T-0004 ou en parallèle si les zones le permettent.
