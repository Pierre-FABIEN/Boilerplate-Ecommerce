-- Historique des connexions (survit à l'expiration/révocation de la session,
-- voir prisma/schema.prisma) + alerte "nouvel appareil" (isNewDevice).
CREATE TABLE "login_events" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "city" TEXT,
    "country" TEXT,
    "method" TEXT NOT NULL,
    "isNewDevice" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "login_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "login_events_userId_createdAt_idx" ON "login_events"("userId", "createdAt");

ALTER TABLE "login_events" ADD CONSTRAINT "login_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
