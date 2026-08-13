-- AlterTable
ALTER TABLE "NotificationLog" ADD COLUMN "recipientPhone" TEXT;

-- DropForeignKey
ALTER TABLE "VoicePendingAction" DROP CONSTRAINT "VoicePendingAction_tripId_fkey";

-- DropTable
DROP TABLE "VoicePendingAction";
