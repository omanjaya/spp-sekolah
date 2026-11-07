-- CreateEnum
CREATE TYPE "KwitansiKategori" AS ENUM ('REGULER', 'KERINGANAN');

-- AlterTable
ALTER TABLE "KwitansiItem"
  ADD COLUMN "kategori" "KwitansiKategori" NOT NULL DEFAULT 'REGULER',
  ADD COLUMN "jenisKeringanan" "JenisKeringanan";

-- CreateIndex
CREATE INDEX "KwitansiItem_kategori_idx" ON "KwitansiItem"("kategori");
