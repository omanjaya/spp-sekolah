-- CreateEnum
CREATE TYPE "TagihanSumber" AS ENUM ('BPD', 'MANUAL', 'AUTO_GENERATE');

-- AlterTable
ALTER TABLE "TagihanBpdMaster"
  ADD COLUMN "sumber" "TagihanSumber" NOT NULL DEFAULT 'BPD';

-- Backfill sumber berdasarkan nama file batch
UPDATE "TagihanBpdMaster" m
SET sumber = 'AUTO_GENERATE'::"TagihanSumber"
FROM "TagihanBpdImportBatch" b
WHERE b.id = m."importBatchId"
  AND (b."fileName" LIKE 'Bulk generate%' OR b."fileName" LIKE 'Bulk regenerate%');

UPDATE "TagihanBpdMaster" m
SET sumber = 'MANUAL'::"TagihanSumber"
FROM "TagihanBpdImportBatch" b
WHERE b.id = m."importBatchId"
  AND b."fileName" LIKE 'Manual add%';

-- Index
CREATE INDEX "TagihanBpdMaster_sumber_idx" ON "TagihanBpdMaster"("sumber");
