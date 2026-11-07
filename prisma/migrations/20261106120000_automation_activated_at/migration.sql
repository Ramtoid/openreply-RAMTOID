-- AlterTable
-- Existing campaigns get the migration time, so applying this never makes the
-- polling sweep act on comments left before it.
ALTER TABLE "Automation" ADD COLUMN "activatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
