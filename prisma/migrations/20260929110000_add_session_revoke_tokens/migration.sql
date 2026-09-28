-- Jeton à usage unique du lien "Ce n'était pas moi" (alerte nouvel appareil),
-- voir prisma/schema.prisma.
CREATE TABLE "session_revoke_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_revoke_tokens_pkey" PRIMARY KEY ("id")
);
