# Journal des décisions

Décisions prises **et rejetées**, avec leur raison. Les plus récentes en haut.

## 2026-10-24 — Page de consentement OAuth conservée

**Décision :** l'ajout du connecteur Claude passe par une page de consentement explicite. Voir [specs/mcp.md](specs/mcp.md#transport-et-authentification).

**Rejeté :** l'approbation automatique, même avec un seul utilisateur. La page ne s'affiche qu'une fois, et elle protège contre un client qui se ferait passer pour Claude.

## 2026-10-24 — Note enregistrée d'office, corrigeable ensuite

**Décision :** en révision vocale, Claude annonce la note, l'enregistre et enchaîne sans attendre mon accord. Si je conteste, il corrige la note précédente. Sur le web, un bouton permet aussi de corriger la dernière note. Seule la dernière réponse d'une révision est corrigeable, et seulement dans l'heure. Voir [specs/repetition.md](specs/repetition.md#corriger-la-dernière-note).

**Rejeté :** attendre ma validation avant d'enregistrer chaque note. Au volant, ça fait deux échanges par carte.

**Conséquence :** l'historique conserve l'état FSRS d'avant chaque réponse.

## 2026-10-24 — Les outils MCP appliquent eux-mêmes les règles qu'ils peuvent garantir

**Décision :** le serveur applique lui-même le plafond *Hard* après un indice (le contexte ne sort que par `get_hint`), la mise de côté du sens inverse, et le rejeu sans effet des créations et des notes. Seules les règles qui dépendent du comportement de Claude reposent sur la description des outils : relire la carte avant de la créer, ne pas proposer *Easy*. Voir [specs/mcp.md](specs/mcp.md).

## 2026-10-24 — Modifier le texte d'une carte réinitialise sa progression

**Décision :** si le français ou l'anglais d'une carte change, ses deux sens repartent de zéro (l'historique est conservé). Une modification du contexte seul ne touche pas à la progression. Voir [story/web.md](story/web.md#web-5--modifier-une-carte).

**Raison :** une modification corrige le plus souvent une erreur. Garder un long intervalle reviendrait à ne presque plus revoir la version corrigée. Revoir une carte en trop coûte peu.

**Rejeté :** conserver la progression, avec une réinitialisation manuelle optionnelle.

## 2026-10-24 — Compte unique créé au premier lancement

**Décision :** tant qu'aucun compte n'existe, le web affiche un formulaire de création de compte à la place de la connexion. Ensuite, l'inscription est refusée côté serveur. Voir [story/web.md](story/web.md#web-1--accès-réservé).

**Rejeté :** une commande `user:create`, ou un compte défini par variable d'environnement. C'est moins naturel qu'un formulaire au premier lancement.

## 2026-10-24 — Le web d'abord, Claude ensuite

**Décision :** le premier jalon est l'application web (gérer et réviser ses cartes), le second le connecteur Claude. Voir [roadmap.md](roadmap.md).

**Raison :** le web permet de voir que tout est en ordre (cartes, échéances, historique) avant de confier la capture et la révision à Claude.

## 2026-10-24 — Pas de marquage « à vérifier »

**Décision :** aucune carte ne porte de statut « à vérifier ». La fiabilité repose uniquement sur la vérification à la création (relecture de Claude et second avis DeepL).

**Rejeté :** laisser Claude marquer en cours de révision une carte qui lui paraît douteuse. C'est un état de plus à gérer pour un gain incertain.

## 2026-10-24 — Construire Poj plutôt qu'adopter un outil existant

**Décision :** on construit Poj sur la stack déjà en place (SvelteKit, Prisma, Better Auth, ts-fsrs). Voir [analyses/ecosysteme-fsrs.md](analyses/ecosysteme-fsrs.md).

**Rejeté :**
- *Anki sur un VPS (AnkiConnect ou bibliothèque `anki`) avec un serveur MCP devant* : beaucoup de plomberie fragile (Anki graphique sans écran, ou synchro de collection à gérer soi-même), un second langage (Python), et des cartes créables sans vérification depuis les apps mobiles.
- *Flipnem, Loudwalk* : abonnement, aucune vérification à la création, et pas de MCP distant documenté (Flipnem) ou pas de MCP du tout (Loudwalk).

## 2026-10-24 — Export des données : plus tard

**Décision :** pas d'export (Anki, CSV) dans le premier périmètre.

**À rouvrir si :** le projet s'arrête ou que je veux migrer vers un autre outil. L'historique complet des réponses étant conservé, un export reste possible à tout moment.

## 2026-10-24 — Note choisie directement par Claude

**Décision :** Claude transmet directement la note (*Again*, *Hard* ou *Good*). On garde le modèle actuel.

**Rejeté :** faire rapporter à Claude des faits bruts (juste ou faux, indice, hésitation) et laisser le serveur calculer la note avec des règles fixes, comme le fait Loudwalk. Le gain est marginal : la note est déjà un résumé fidèle de ces faits, et Claude ne mesure pas l'hésitation mieux qu'il ne choisit *Hard*.

## 2026-10-24 — DeepL comme second avis à la création

**Décision :** le serveur interroge l'API DeepL (clé gratuite) pour obtenir une traduction de référence de chaque carte proposée. Les traductions vers l'anglais visent l'anglais britannique (`EN-GB`).
- **Avec Claude :** si DeepL diverge de la proposition de Claude, Claude expose les deux options avec ses arguments, et c'est moi qui tranche.
- **Sur le web :** le formulaire affiche la traduction DeepL comme suggestion. Aucun statut particulier : la carte est enregistrée telle que je la saisis.

**Rejeté (pour l'instant) :** Wiktionary (via kaikki.org) comme troisième source. Il ne couvre que les mots et expressions figées, et demande d'indexer un gros fichier. À reconsidérer si DeepL s'avère insuffisant sur les mots à plusieurs sens.

## 2026-10-24 — Prévenir les cartes fausses plutôt que les corriger

**Décision :** l'effort de fiabilité porte sur la **création** des cartes. Pendant une révision, je ne suis pas en mesure de repérer une erreur dans une langue que j'apprends.

**Rejeté :** corriger ou signaler une carte de vive voix pendant la révision. Je ne peux pas savoir qu'une carte est fausse, et corriger au volant risque d'introduire une nouvelle erreur.

## 2026-10-24 — Claude relit ses propositions avant de créer une carte

**Décision :** avant d'enregistrer une carte, Claude me la relit (français, anglais, contexte) et attend ma confirmation. Il le fait à chaque fois, pas seulement en cas de doute.

## 2026-10-24 — Notes à l'oral : Again, Hard, Good ; Easy seulement sur demande

**Décision :** en révision avec Claude, Claude propose *Again*, *Hard* ou *Good* d'après la conversation, et je peux contester. *Easy* n'est appliqué que si je le dis explicitement. Voir [specs/repetition.md](specs/repetition.md).

**Raison :** si Claude distribuait *Easy* lui-même, il en donnerait trop, et les intervalles gonfleraient.

## 2026-10-24 — FSRS plutôt que Leitner

**Décision :** la planification utilise FSRS (bibliothèque `ts-fsrs`, paramètres par défaut, rétention cible de 90 %). Voir [specs/repetition.md](specs/repetition.md).

**Raison :** FSRS demande moins de révisions pour une même rétention, ce qui compte pour des sessions courtes. Il règle aussi nativement les cas que Leitner laissait ouverts : cartes maîtrisées, révision en avance, indices.

**Rejeté :** Leitner avec 5 boîtes (intervalles de 1, 3, 7, 14 et 30 jours, retour en boîte 1 en cas d'erreur). C'est plus lisible, mais les intervalles sont fixes et ne s'adaptent pas à chaque carte.

**Coût accepté :** quatre notes au lieu de deux, une progression moins lisible que « boîte 3 », et un historique complet des réponses à conserver.

## 2026-10-24 — Sessions de durée libre

**Décision :** une session n'a ni durée minimale ni nombre de cartes imposé. On peut la lancer avec 6 minutes devant soi et l'interrompre à tout moment : chaque réponse est enregistrée immédiatement, il n'y a rien à « terminer ». Voir [specs/repetition.md](specs/repetition.md).

## 2026-10-24 — Saisie web par formulaire

**Décision :** sans Claude, on crée une carte via un formulaire simple (français, anglais, contexte). Le langage naturel reste la valeur ajoutée de Claude.

**Rejeté :** saisie en langage naturel côté web. Elle obligerait le serveur à appeler lui-même un LLM (clé API, coût, double implémentation de ce que Claude fait déjà via MCP).

## 2026-10-24 — Audio uniquement via Claude

**Décision :** l'audio (entendre la prononciation, répondre à l'oral) passe exclusivement par le mode vocal de Claude. L'application ne stocke ni ne génère d'audio, et l'interface web est purement textuelle.

**Rejeté :**
- *Synthèse vocale du navigateur ou TTS pré-généré* : coût et complexité sans besoin réel hors de Claude.
- *Évaluation de la prononciation* : hors périmètre.

**Validé :** le mode vocal de Claude appelle bien les outils d'un connecteur MCP distant (testé avec Basic Memory).

## 2026-10-24 — Évaluation hybride en révision conversationnelle

**Décision :** pendant une révision avec Claude, Claude propose un verdict en tolérant synonymes et approximations ; je peux le contester. Le verdict final est enregistré. Précisé depuis par le passage à FSRS : le verdict prend la forme d'une note (voir plus haut).

**Rejeté :**
- *Claude seul juge* : risque d'indulgence, je perds la main sur ma progression.
- *Auto-évaluation seule* : honnête mais peu interactif, on perd l'intérêt de la conversation.

## 2026-10-24 — Révision dans les deux sens

**Décision :** chaque carte se révise dans les deux sens (FR → EN et EN → FR).

**Rejeté :** sens unique, insuffisant pour passer de la compréhension à la production.

## 2026-10-24 — App iOS gelée

**Décision :** `apps/ios` est conservé dans le dépôt mais n'est plus maintenu (ni évolution, ni garantie de compilation). Sur mobile, l'interface est l'app Claude (connecteur MCP) et l'interface web.

**Raison :** un seul utilisateur, et l'app Claude couvre déjà l'usage nomade. Une app native dupliquerait l'effort sans valeur ajoutée.

**À rouvrir si :** un besoin que ni Claude ni le web ne couvrent apparaît (notifications de rappel, usage hors ligne réel…).
