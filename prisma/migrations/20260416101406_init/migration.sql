-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'BENDAHARA', 'TU', 'VIEWER');

-- CreateEnum
CREATE TYPE "Grade" AS ENUM ('X', 'XI', 'XII');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('L', 'P');

-- CreateEnum
CREATE TYPE "StatusSiswa" AS ENUM ('AKTIF', 'PINDAH', 'LULUS', 'DO', 'CUTI');

-- CreateEnum
CREATE TYPE "StatusBayar" AS ENUM ('TERBAYAR', 'DIBATALKAN');

-- CreateEnum
CREATE TYPE "PaymentSource" AS ENUM ('IMPORT_EXCEL', 'PASTE_SPREADSHEET', 'MANUAL');

-- CreateEnum
CREATE TYPE "JenisKeringanan" AS ENUM ('JUARA', 'OSN', 'JUARA_UMUM', 'BEASISWA', 'KELUARGA_TIDAK_MAMPU', 'LAINNYA');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'PARTIAL');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'TU',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TahunAjaran" (
    "id" TEXT NOT NULL,
    "kode" TEXT NOT NULL,
    "tahunMulai" INTEGER NOT NULL,
    "tahunAkhir" INTEGER NOT NULL,
    "tanggalMulai" DATE NOT NULL,
    "tanggalAkhir" DATE NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "nominalSppDefault" DECIMAL(12,2) NOT NULL DEFAULT 350000,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TahunAjaran_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rombel" (
    "id" TEXT NOT NULL,
    "tahunAjaranId" TEXT NOT NULL,
    "grade" "Grade" NOT NULL,
    "nomor" INTEGER NOT NULL,
    "kode" TEXT NOT NULL,
    "waliKelas" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Rombel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Siswa" (
    "id" TEXT NOT NULL,
    "nis" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "jenisKelamin" "Gender",
    "angkatan" INTEGER NOT NULL,
    "statusSiswa" "StatusSiswa" NOT NULL DEFAULT 'AKTIF',
    "alamat" TEXT,
    "kontakOrtu" TEXT,
    "catatan" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Siswa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Enrollment" (
    "id" TEXT NOT NULL,
    "siswaId" TEXT NOT NULL,
    "rombelId" TEXT NOT NULL,
    "tahunAjaranId" TEXT NOT NULL,
    "noAbsen" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Enrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pembayaran" (
    "id" TEXT NOT NULL,
    "siswaId" TEXT NOT NULL,
    "periodYear" INTEGER NOT NULL,
    "periodMonth" INTEGER NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "biayaAdm" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "tanggalTransaksi" TIMESTAMP(3) NOT NULL,
    "noBukti" TEXT,
    "kodeCabang" TEXT,
    "tellerUser" TEXT,
    "statusBayar" "StatusBayar" NOT NULL DEFAULT 'TERBAYAR',
    "source" "PaymentSource" NOT NULL,
    "importBatchId" TEXT,
    "catatan" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pembayaran_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Keringanan" (
    "id" TEXT NOT NULL,
    "siswaId" TEXT NOT NULL,
    "periodYear" INTEGER NOT NULL,
    "periodMonth" INTEGER NOT NULL,
    "jenis" "JenisKeringanan" NOT NULL,
    "persentase" INTEGER NOT NULL DEFAULT 100,
    "alasan" TEXT,
    "buktiUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "Keringanan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pelunasan" (
    "id" TEXT NOT NULL,
    "siswaId" TEXT NOT NULL,
    "periodeMulai" TEXT NOT NULL,
    "periodeAkhir" TEXT NOT NULL,
    "tanggalLunas" DATE NOT NULL,
    "nominalTotal" DECIMAL(12,2) NOT NULL,
    "noBukti" TEXT,
    "metodeLabel" TEXT,
    "catatan" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "Pelunasan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "fileHash" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedBy" TEXT NOT NULL,
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "duplicateCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "errorDetails" JSONB,
    "status" "ImportStatus" NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT,
    "entityId" TEXT,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "TahunAjaran_kode_key" ON "TahunAjaran"("kode");

-- CreateIndex
CREATE INDEX "TahunAjaran_isActive_idx" ON "TahunAjaran"("isActive");

-- CreateIndex
CREATE INDEX "Rombel_tahunAjaranId_idx" ON "Rombel"("tahunAjaranId");

-- CreateIndex
CREATE UNIQUE INDEX "Rombel_tahunAjaranId_grade_nomor_key" ON "Rombel"("tahunAjaranId", "grade", "nomor");

-- CreateIndex
CREATE UNIQUE INDEX "Rombel_tahunAjaranId_kode_key" ON "Rombel"("tahunAjaranId", "kode");

-- CreateIndex
CREATE UNIQUE INDEX "Siswa_nis_key" ON "Siswa"("nis");

-- CreateIndex
CREATE INDEX "Siswa_angkatan_statusSiswa_idx" ON "Siswa"("angkatan", "statusSiswa");

-- CreateIndex
CREATE INDEX "Siswa_nama_idx" ON "Siswa"("nama");

-- CreateIndex
CREATE INDEX "Enrollment_rombelId_idx" ON "Enrollment"("rombelId");

-- CreateIndex
CREATE UNIQUE INDEX "Enrollment_siswaId_tahunAjaranId_key" ON "Enrollment"("siswaId", "tahunAjaranId");

-- CreateIndex
CREATE UNIQUE INDEX "Pembayaran_noBukti_key" ON "Pembayaran"("noBukti");

-- CreateIndex
CREATE INDEX "Pembayaran_periodYear_periodMonth_idx" ON "Pembayaran"("periodYear", "periodMonth");

-- CreateIndex
CREATE INDEX "Pembayaran_tanggalTransaksi_idx" ON "Pembayaran"("tanggalTransaksi");

-- CreateIndex
CREATE INDEX "Pembayaran_kodeCabang_idx" ON "Pembayaran"("kodeCabang");

-- CreateIndex
CREATE UNIQUE INDEX "Pembayaran_siswaId_periodYear_periodMonth_key" ON "Pembayaran"("siswaId", "periodYear", "periodMonth");

-- CreateIndex
CREATE INDEX "Keringanan_periodYear_periodMonth_idx" ON "Keringanan"("periodYear", "periodMonth");

-- CreateIndex
CREATE UNIQUE INDEX "Keringanan_siswaId_periodYear_periodMonth_key" ON "Keringanan"("siswaId", "periodYear", "periodMonth");

-- CreateIndex
CREATE UNIQUE INDEX "Pelunasan_noBukti_key" ON "Pelunasan"("noBukti");

-- CreateIndex
CREATE INDEX "Pelunasan_siswaId_idx" ON "Pelunasan"("siswaId");

-- CreateIndex
CREATE UNIQUE INDEX "ImportBatch_fileHash_key" ON "ImportBatch"("fileHash");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "Rombel" ADD CONSTRAINT "Rombel_tahunAjaranId_fkey" FOREIGN KEY ("tahunAjaranId") REFERENCES "TahunAjaran"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_siswaId_fkey" FOREIGN KEY ("siswaId") REFERENCES "Siswa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_rombelId_fkey" FOREIGN KEY ("rombelId") REFERENCES "Rombel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_tahunAjaranId_fkey" FOREIGN KEY ("tahunAjaranId") REFERENCES "TahunAjaran"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pembayaran" ADD CONSTRAINT "Pembayaran_siswaId_fkey" FOREIGN KEY ("siswaId") REFERENCES "Siswa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pembayaran" ADD CONSTRAINT "Pembayaran_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Keringanan" ADD CONSTRAINT "Keringanan_siswaId_fkey" FOREIGN KEY ("siswaId") REFERENCES "Siswa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pelunasan" ADD CONSTRAINT "Pelunasan_siswaId_fkey" FOREIGN KEY ("siswaId") REFERENCES "Siswa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
