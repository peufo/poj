-- Migration initiale, générée depuis `schema.prisma` (`prisma migrate diff --from-empty`),
-- complétée à la main par ce que Prisma ne modélise pas : l'extension `unaccent` et la
-- contrainte CHECK `decks_language_pair`.

-- Recherche de cartes insensible aux accents (`cards.list`) : « ecole » trouve « école ».
-- `unaccent` est une extension de confiance (PostgreSQL 13+) : le propriétaire de la base
-- peut la créer sans être superutilisateur.
CREATE EXTENSION IF NOT EXISTS unaccent;

-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('user', 'admin');

-- CreateEnum
CREATE TYPE "origin" AS ENUM ('web', 'claude');

-- CreateEnum
CREATE TYPE "direction" AS ENUM ('a_to_b', 'b_to_a');

-- CreateEnum
CREATE TYPE "rating" AS ENUM ('again', 'hard', 'good', 'easy');

-- CreateEnum
CREATE TYPE "review_state" AS ENUM ('new', 'learning', 'review', 'relearning');

-- CreateEnum
CREATE TYPE "deck_kind" AS ENUM ('language', 'subject');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "role" "user_role" NOT NULL DEFAULT 'user',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "user_id" UUID NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL,
    "account_id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "access_token" TEXT,
    "refresh_token" TEXT,
    "id_token" TEXT,
    "access_token_expires_at" TIMESTAMP(3),
    "refresh_token_expires_at" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verifications" (
    "id" UUID NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitations" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "invited_by_id" UUID NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

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

-- CreateTable
CREATE TABLE "cards" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "deck_id" UUID NOT NULL,
    "side_a" TEXT NOT NULL,
    "side_b" TEXT NOT NULL,
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

-- CreateTable
CREATE TABLE "daily_goals" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "goal" INTEGER NOT NULL,
    "effective_from" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jwks" (
    "id" UUID NOT NULL,
    "public_key" TEXT NOT NULL,
    "private_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3),
    "alg" TEXT,
    "crv" TEXT,

    CONSTRAINT "jwks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauth_clients" (
    "id" UUID NOT NULL,
    "client_id" TEXT NOT NULL,
    "client_secret" TEXT,
    "client_discovery_id" TEXT,
    "disabled" BOOLEAN DEFAULT false,
    "skip_consent" BOOLEAN,
    "enable_end_session" BOOLEAN,
    "subject_type" TEXT,
    "scopes" TEXT[],
    "client_credentials_scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "user_id" UUID,
    "created_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3),
    "name" TEXT,
    "uri" TEXT,
    "icon" TEXT,
    "contacts" TEXT[],
    "tos" TEXT,
    "policy" TEXT,
    "software_id" TEXT,
    "software_version" TEXT,
    "software_statement" TEXT,
    "redirect_uris" TEXT[],
    "post_logout_redirect_uris" TEXT[],
    "backchannel_logout_uri" TEXT,
    "backchannel_logout_session_required" BOOLEAN,
    "token_endpoint_auth_method" TEXT,
    "application_type" TEXT,
    "jwks" TEXT,
    "jwks_uri" TEXT,
    "grant_types" TEXT[],
    "response_types" TEXT[],
    "require_pkce" BOOLEAN,
    "dpop_bound_access_tokens" BOOLEAN DEFAULT false,
    "reference_id" TEXT,
    "metadata" JSONB,

    CONSTRAINT "oauth_clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauth_resources" (
    "id" UUID NOT NULL,
    "identifier" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "access_token_ttl" INTEGER,
    "refresh_token_ttl" INTEGER,
    "signing_algorithm" TEXT,
    "signing_key_id" TEXT,
    "allowed_scopes" TEXT[],
    "custom_claims" JSONB,
    "dpop_bound_access_tokens_required" BOOLEAN DEFAULT false,
    "disabled" BOOLEAN DEFAULT false,
    "created_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3),
    "policy_version" INTEGER DEFAULT 1,
    "metadata" JSONB,

    CONSTRAINT "oauth_resources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauth_client_resources" (
    "id" UUID NOT NULL,
    "client_id" TEXT NOT NULL,
    "resource_id" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3),

    CONSTRAINT "oauth_client_resources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauth_refresh_tokens" (
    "id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "session_id" UUID,
    "user_id" UUID NOT NULL,
    "reference_id" TEXT,
    "authorization_code_id" TEXT,
    "resources" TEXT[],
    "requested_user_info_claims" TEXT[],
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,
    "revoked" TIMESTAMP(3),
    "rotated_at" TIMESTAMP(3),
    "rotation_replay_response" TEXT,
    "rotation_replay_expires_at" TIMESTAMP(3),
    "auth_time" TIMESTAMP(3),
    "confirmation" JSONB,
    "scopes" TEXT[],

    CONSTRAINT "oauth_refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauth_access_tokens" (
    "id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "session_id" UUID,
    "user_id" UUID,
    "reference_id" TEXT,
    "authorization_code_id" TEXT,
    "resources" TEXT[],
    "requested_user_info_claims" TEXT[],
    "refresh_id" UUID,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,
    "revoked" TIMESTAMP(3),
    "confirmation" JSONB,
    "scopes" TEXT[],

    CONSTRAINT "oauth_access_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauth_consents" (
    "id" UUID NOT NULL,
    "client_id" TEXT NOT NULL,
    "user_id" UUID,
    "reference_id" TEXT,
    "resources" TEXT[],
    "requested_user_info_claims" TEXT[],
    "scopes" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "oauth_consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauth_client_assertions" (
    "id" UUID NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "oauth_client_assertions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token");

-- CreateIndex
CREATE INDEX "accounts_user_id_idx" ON "accounts"("user_id");

-- CreateIndex
CREATE INDEX "verifications_identifier_idx" ON "verifications"("identifier");

-- CreateIndex
CREATE INDEX "invitations_email_idx" ON "invitations"("email");

-- CreateIndex
CREATE INDEX "invitations_invited_by_id_idx" ON "invitations"("invited_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_token_hash_key" ON "invitations"("token_hash");

-- CreateIndex
CREATE INDEX "decks_owner_id_idx" ON "decks"("owner_id");

-- CreateIndex
CREATE INDEX "cards_owner_id_created_at_idx" ON "cards"("owner_id", "created_at");

-- CreateIndex
CREATE INDEX "cards_deck_id_idx" ON "cards"("deck_id");

-- CreateIndex
CREATE INDEX "reviews_due_idx" ON "reviews"("due");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_card_id_direction_key" ON "reviews"("card_id", "direction");

-- CreateIndex
CREATE INDEX "review_logs_review_id_reviewed_at_idx" ON "review_logs"("review_id", "reviewed_at");

-- CreateIndex
CREATE UNIQUE INDEX "daily_goals_user_id_effective_from_key" ON "daily_goals"("user_id", "effective_from");

-- CreateIndex
CREATE INDEX "oauth_clients_user_id_idx" ON "oauth_clients"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_clients_client_id_key" ON "oauth_clients"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_resources_identifier_key" ON "oauth_resources"("identifier");

-- CreateIndex
CREATE INDEX "oauth_client_resources_client_id_idx" ON "oauth_client_resources"("client_id");

-- CreateIndex
CREATE INDEX "oauth_client_resources_resource_id_idx" ON "oauth_client_resources"("resource_id");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_client_resources_client_id_resource_id_key" ON "oauth_client_resources"("client_id", "resource_id");

-- CreateIndex
CREATE INDEX "oauth_refresh_tokens_client_id_idx" ON "oauth_refresh_tokens"("client_id");

-- CreateIndex
CREATE INDEX "oauth_refresh_tokens_session_id_idx" ON "oauth_refresh_tokens"("session_id");

-- CreateIndex
CREATE INDEX "oauth_refresh_tokens_user_id_idx" ON "oauth_refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "oauth_refresh_tokens_authorization_code_id_idx" ON "oauth_refresh_tokens"("authorization_code_id");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_refresh_tokens_token_key" ON "oauth_refresh_tokens"("token");

-- CreateIndex
CREATE INDEX "oauth_access_tokens_client_id_idx" ON "oauth_access_tokens"("client_id");

-- CreateIndex
CREATE INDEX "oauth_access_tokens_session_id_idx" ON "oauth_access_tokens"("session_id");

-- CreateIndex
CREATE INDEX "oauth_access_tokens_user_id_idx" ON "oauth_access_tokens"("user_id");

-- CreateIndex
CREATE INDEX "oauth_access_tokens_authorization_code_id_idx" ON "oauth_access_tokens"("authorization_code_id");

-- CreateIndex
CREATE INDEX "oauth_access_tokens_refresh_id_idx" ON "oauth_access_tokens"("refresh_id");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_access_tokens_token_key" ON "oauth_access_tokens"("token");

-- CreateIndex
CREATE INDEX "oauth_consents_client_id_idx" ON "oauth_consents"("client_id");

-- CreateIndex
CREATE INDEX "oauth_consents_user_id_idx" ON "oauth_consents"("user_id");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_id_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decks" ADD CONSTRAINT "decks_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cards" ADD CONSTRAINT "cards_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cards" ADD CONSTRAINT "cards_deck_id_fkey" FOREIGN KEY ("deck_id") REFERENCES "decks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_logs" ADD CONSTRAINT "review_logs_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_goals" ADD CONSTRAINT "daily_goals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_clients" ADD CONSTRAINT "oauth_clients_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_client_resources" ADD CONSTRAINT "oauth_client_resources_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "oauth_clients"("client_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_client_resources" ADD CONSTRAINT "oauth_client_resources_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "oauth_resources"("identifier") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_refresh_tokens" ADD CONSTRAINT "oauth_refresh_tokens_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "oauth_clients"("client_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_refresh_tokens" ADD CONSTRAINT "oauth_refresh_tokens_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_refresh_tokens" ADD CONSTRAINT "oauth_refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_access_tokens" ADD CONSTRAINT "oauth_access_tokens_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "oauth_clients"("client_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_access_tokens" ADD CONSTRAINT "oauth_access_tokens_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_access_tokens" ADD CONSTRAINT "oauth_access_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_access_tokens" ADD CONSTRAINT "oauth_access_tokens_refresh_id_fkey" FOREIGN KEY ("refresh_id") REFERENCES "oauth_refresh_tokens"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_consents" ADD CONSTRAINT "oauth_consents_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "oauth_clients"("client_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_consents" ADD CONSTRAINT "oauth_consents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Une paire de langues pour un deck de langue, aucune pour un sujet (non modélisé par Prisma).
ALTER TABLE "decks" ADD CONSTRAINT "decks_language_pair" CHECK (
    CASE "kind"
        WHEN 'language' THEN "language_a" IS NOT NULL AND "language_b" IS NOT NULL
        ELSE "language_a" IS NULL AND "language_b" IS NULL
    END
);
