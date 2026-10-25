-- CreateEnum
CREATE TYPE "origin" AS ENUM ('web', 'claude');

-- CreateEnum
CREATE TYPE "direction" AS ENUM ('fr_to_en', 'en_to_fr');

-- CreateEnum
CREATE TYPE "rating" AS ENUM ('again', 'hard', 'good', 'easy');

-- CreateEnum
CREATE TYPE "review_state" AS ENUM ('new', 'learning', 'review', 'relearning');

-- CreateTable
CREATE TABLE "cards" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "french" TEXT NOT NULL,
    "english" TEXT NOT NULL,
    "context" TEXT,
    "origin" "origin" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" UUID NOT NULL,
    "card_id" UUID NOT NULL,
    "direction" "direction" NOT NULL,
    "due" TIMESTAMP(3) NOT NULL,
    "stability" DOUBLE PRECISION NOT NULL,
    "difficulty" DOUBLE PRECISION NOT NULL,
    "scheduled_days" INTEGER NOT NULL,
    "learning_steps" INTEGER NOT NULL,
    "reps" INTEGER NOT NULL,
    "lapses" INTEGER NOT NULL,
    "state" "review_state" NOT NULL,
    "last_review" TIMESTAMP(3),
    "hint_requested_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_logs" (
    "id" UUID NOT NULL,
    "review_id" UUID NOT NULL,
    "rating" "rating" NOT NULL,
    "hint_used" BOOLEAN NOT NULL,
    "origin" "origin" NOT NULL,
    "reviewed_at" TIMESTAMP(3) NOT NULL,
    "state_before" JSONB NOT NULL,
    "amended_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "review_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cards_owner_id_created_at_idx" ON "cards"("owner_id", "created_at");

-- CreateIndex
CREATE INDEX "reviews_due_idx" ON "reviews"("due");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_card_id_direction_key" ON "reviews"("card_id", "direction");

-- CreateIndex
CREATE INDEX "review_logs_review_id_reviewed_at_idx" ON "review_logs"("review_id", "reviewed_at");

-- AddForeignKey
ALTER TABLE "cards" ADD CONSTRAINT "cards_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_logs" ADD CONSTRAINT "review_logs_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;
