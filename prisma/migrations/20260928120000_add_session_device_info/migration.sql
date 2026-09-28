-- Appareil/localisation approximative + dernière activité d'une session,
-- pour /auth/settings/sessions et /admin/users/[id] (voir prisma/schema.prisma).
ALTER TABLE "sessions" ADD COLUMN     "city" TEXT,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "ipAddress" TEXT,
ADD COLUMN     "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "userAgent" TEXT;
