BEGIN;

CREATE TABLE "ai_provider_settings" (
  "provider" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ai_provider_settings_pkey" PRIMARY KEY ("provider"),
  CONSTRAINT "ai_provider_settings_provider_check"
    CHECK ("provider" IN ('gemini'))
);

INSERT INTO "ai_provider_settings" ("provider", "enabled", "updatedAt")
VALUES ('gemini', true, CURRENT_TIMESTAMP);

COMMIT;
