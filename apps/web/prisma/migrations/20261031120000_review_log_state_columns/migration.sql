-- L'état FSRS d'avant la réponse passe du JSON "state_before" à des colonnes typées,
-- aux mêmes noms que celles de "reviews". Les lignes existantes sont converties ; une
-- ligne incomplète fait échouer la migration au passage en NOT NULL.

-- AlterTable
ALTER TABLE "review_logs" ADD COLUMN     "due" TIMESTAMP(3),
ADD COLUMN     "stability" DOUBLE PRECISION,
ADD COLUMN     "difficulty" DOUBLE PRECISION,
ADD COLUMN     "scheduled_days" INTEGER,
ADD COLUMN     "learning_steps" INTEGER,
ADD COLUMN     "reps" INTEGER,
ADD COLUMN     "lapses" INTEGER,
ADD COLUMN     "state" "review_state",
ADD COLUMN     "last_review" TIMESTAMP(3);

-- Les dates du JSON sont en ISO 8601 UTC ; les colonnes TIMESTAMP(3) de Prisma aussi.
UPDATE "review_logs" SET
    "due" = ("state_before"->>'due')::timestamptz AT TIME ZONE 'UTC',
    "stability" = ("state_before"->>'stability')::double precision,
    "difficulty" = ("state_before"->>'difficulty')::double precision,
    "scheduled_days" = ("state_before"->>'scheduledDays')::integer,
    "learning_steps" = ("state_before"->>'learningSteps')::integer,
    "reps" = ("state_before"->>'reps')::integer,
    "lapses" = ("state_before"->>'lapses')::integer,
    "state" = ("state_before"->>'state')::"review_state",
    "last_review" = ("state_before"->>'lastReview')::timestamptz AT TIME ZONE 'UTC';

ALTER TABLE "review_logs" ALTER COLUMN "due" SET NOT NULL,
ALTER COLUMN "stability" SET NOT NULL,
ALTER COLUMN "difficulty" SET NOT NULL,
ALTER COLUMN "scheduled_days" SET NOT NULL,
ALTER COLUMN "learning_steps" SET NOT NULL,
ALTER COLUMN "reps" SET NOT NULL,
ALTER COLUMN "lapses" SET NOT NULL,
ALTER COLUMN "state" SET NOT NULL,
DROP COLUMN "state_before";
