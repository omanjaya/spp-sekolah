-- API integrasi bendahara: tombstone refund + index keyset (updatedAt, id).
-- Hanya menambah kolom nullable dan index; tidak mengubah/menghapus data.

-- AlterTable
ALTER TABLE "Refund" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Pembayaran_updatedAt_id_idx" ON "Pembayaran"("updatedAt", "id");

-- CreateIndex
CREATE INDEX "Refund_updatedAt_id_idx" ON "Refund"("updatedAt", "id");
