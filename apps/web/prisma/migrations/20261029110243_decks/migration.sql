-- Decks (doc/decisions.md, 2026-10-29 « Modèle ouvert à plusieurs decks ») : les cartes
-- appartiennent à un deck, leurs faces et leurs sens deviennent génériques.
-- Aucune donnée à préserver : les cartes et leur historique sont vidés, les utilisateurs
-- gardés. Aucun deck n'est créé ici, le deck par défaut naît à la volée (`ensureDefault`).
TRUNCATE TABLE "review_logs", "reviews", "cards";

-- CreateEnum
CREATE TYPE "deck_kind" AS ENUM ('language', 'subject');

-- AlterEnum
BEGIN;
CREATE TYPE "direction_new" AS ENUM ('a_to_b', 'b_to_a');
ALTER TABLE "reviews" ALTER COLUMN "direction" TYPE "direction_new" USING ("direction"::text::"direction_new");
ALTER TYPE "direction" RENAME TO "direction_old";
ALTER TYPE "direction_new" RENAME TO "direction";
DROP TYPE "public"."direction_old";
COMMIT;

-- AlterTable
ALTER TABLE "cards" DROP COLUMN "english",
DROP COLUMN "french",
ADD COLUMN     "deck_id" UUID NOT NULL,
ADD COLUMN     "side_a" TEXT NOT NULL,
ADD COLUMN     "side_b" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "decks" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "deck_kind" NOT NULL,
    "language_a" TEXT,
    "language_b" TEXT,
    "label_a" TEXT,
    "label_b" TEXT,
    "both_directions" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "decks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "decks_owner_id_idx" ON "decks"("owner_id");

-- CreateIndex
CREATE INDEX "cards_deck_id_idx" ON "cards"("deck_id");

-- AddForeignKey
ALTER TABLE "decks" ADD CONSTRAINT "decks_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cards" ADD CONSTRAINT "cards_deck_id_fkey" FOREIGN KEY ("deck_id") REFERENCES "decks"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Une paire de langues pour un deck de langue, aucune pour un sujet (non modélisé par Prisma).
ALTER TABLE "decks" ADD CONSTRAINT "decks_language_pair" CHECK (
    CASE "kind"
        WHEN 'language' THEN "language_a" IS NOT NULL AND "language_b" IS NOT NULL
        ELSE "language_a" IS NULL AND "language_b" IS NULL
    END
);
