---
id: T-0002
titre: Claude inspire l'ajout de cartes à partir de situations réelles
statut: pret
priorite: normale
story: doc/story/ajout-quotidien.md
plan_requis: true
modele: opus
effort: high
zones: [apps/web/src/lib/server/mcp]
branche:
agent:
cree: 2026-10-29
maj: 2026-10-29
---

## Contexte
Quand l'inspiration me manque pour ajouter une carte, Claude doit m'aider à retrouver une **situation réelle** au lieu de me proposer des cartes toutes faites « selon mon niveau ». C'est une décision de la story `doc/story/ajout-quotidien.md` : une carte sans situation réelle est moins bonne et coûte des révisions pendant des mois.

Le serveur MCP (`mcp/server.ts`) a 6 outils : `check_card`, `create_card`, `next_review`, `get_hint`, `submit_review` et `amend_review`. Il a aussi des `INSTRUCTIONS` serveur, constantes, qui couvrent la capture et la révision. Il n'a ni prompt ni ressource MCP.

Claude n'annonce pas l'état de l'objectif quotidien : c'est une gratification visuelle propre au web (T-0001).

## Critères de fin
- [ ] Les consignes du connecteur décrivent la marche à suivre quand je demande de l'aide ou dis manquer d'idées : interroger sur des situations réelles (ma journée, ce que j'aurais voulu dire en anglais, ce que j'ai entendu) ou s'appuyer sur ce que Claude sait de moi, puis en tirer une carte avec son contexte d'origine.
- [ ] Les consignes interdisent de proposer des cartes génériques sans situation réelle.
- [ ] La carte issue de cette aide suit le déroulé de capture habituel (CL-2) : `check_card`, divergence DeepL, relecture et confirmation.
- [ ] Aucun outil ni contrat API n'est ajouté, sauf justification dans le plan (par exemple un prompt MCP).
- [ ] Les tests passent.

## Plan
(à rédiger en MODE PLAN)

## Questions

## Journal
- 2026-10-29 — créé depuis la story ajout-quotidien. En attente : max_parallele = 1, part après T-0001.
- 2026-10-29 — passe après T-0003 (le modèle ouvert touche aussi le MCP)
