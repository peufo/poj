-- CreateTable
CREATE TABLE "new_cards_limits" (
    "id" UUID NOT NULL,
    "deck_id" UUID NOT NULL,
    "per_day" INTEGER NOT NULL,
    "effective_from" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "new_cards_limits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "new_cards_limits_deck_id_effective_from_key" ON "new_cards_limits"("deck_id", "effective_from");

-- AddForeignKey
ALTER TABLE "new_cards_limits" ADD CONSTRAINT "new_cards_limits_deck_id_fkey" FOREIGN KEY ("deck_id") REFERENCES "decks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

