-- CreateTable: Kwitansi (Receipts)
CREATE TABLE "Kwitansi" (
    "id"            TEXT NOT NULL,
    "nomorKwitansi" TEXT NOT NULL,
    "siswaId"       TEXT NOT NULL,
    "tanggal"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalAmount"   DECIMAL(12,2) NOT NULL,
    "biayaAdm"      DECIMAL(12,2) NOT NULL DEFAULT 0,
    "namaOrangTua"  TEXT,
    "catatan"       TEXT,
    "createdById"   TEXT NOT NULL,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Kwitansi_pkey" PRIMARY KEY ("id")
);

-- CreateTable: KwitansiItem
CREATE TABLE "KwitansiItem" (
    "id"           TEXT NOT NULL,
    "kwitansiId"   TEXT NOT NULL,
    "periodYear"   INTEGER NOT NULL,
    "periodMonth"  INTEGER NOT NULL,
    "amount"       DECIMAL(12,2) NOT NULL,
    "keterangan"   TEXT,
    "pembayaranId" TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KwitansiItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Kwitansi_nomorKwitansi_key" ON "Kwitansi"("nomorKwitansi");
CREATE INDEX "Kwitansi_siswaId_idx"  ON "Kwitansi"("siswaId");
CREATE INDEX "Kwitansi_tanggal_idx"  ON "Kwitansi"("tanggal");
CREATE INDEX "Kwitansi_createdAt_idx" ON "Kwitansi"("createdAt");

CREATE UNIQUE INDEX "KwitansiItem_kwitansiId_periodYear_periodMonth_key"
    ON "KwitansiItem"("kwitansiId", "periodYear", "periodMonth");
CREATE INDEX "KwitansiItem_pembayaranId_idx" ON "KwitansiItem"("pembayaranId");

-- AddForeignKey
ALTER TABLE "Kwitansi" ADD CONSTRAINT "Kwitansi_siswaId_fkey"
    FOREIGN KEY ("siswaId") REFERENCES "Siswa"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Kwitansi" ADD CONSTRAINT "Kwitansi_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "KwitansiItem" ADD CONSTRAINT "KwitansiItem_kwitansiId_fkey"
    FOREIGN KEY ("kwitansiId") REFERENCES "Kwitansi"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "KwitansiItem" ADD CONSTRAINT "KwitansiItem_pembayaranId_fkey"
    FOREIGN KEY ("pembayaranId") REFERENCES "Pembayaran"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
