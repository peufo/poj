/**
 * Longueurs maximales du contenu d'une carte, partagées par les schémas du web et les outils MCP
 * (la validation se fait à ces frontières, pas dans le domaine).
 */
export const CARD_LIMITS = { sideA: 300, sideB: 300, context: 1000 } as const;

/** Nombre maximal de cartes d'un lot, par appel (outils MCP `check_cards` et `create_cards`). */
export const MAX_BATCH_CARDS = 50;
