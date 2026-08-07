-- DropIndex
DROP INDEX "ProviderUsage_provider_periodKey_key";

-- AlterTable
ALTER TABLE "ProviderUsage" DROP COLUMN "periodKey",
ADD COLUMN     "resetAt" TIMESTAMP(3) NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "ProviderUsage_provider_key" ON "ProviderUsage"("provider");
