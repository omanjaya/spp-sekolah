-- Migration: period_lock_refund_cancel
-- Adds:
--   1. PeriodeLock model (B3 — lock accounting periods)
--   2. Refund model (B2 — refund/kelebihan bayar)
--   3. PembayaranCancelRequest model (B7 — cancel approval workflow)
--   4. Missing index: Kwitansi(createdById, createdAt) (D3)
--   5. Missing index: AuditLog(action, createdAt) for action-based filtering

-- ── 1. PeriodeLock ──────────────────────────────────────────────────────────
CREATE TABLE "PeriodeLock" (
    "id"          TEXT NOT NULL,
    "periodYear"  INTEGER NOT NULL,
    "periodMonth" INTEGER NOT NULL,
    "lockedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedById"  TEXT NOT NULL,
    "catatan"     TEXT,
    CONSTRAINT "PeriodeLock_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PeriodeLock_periodYear_periodMonth_key"
    ON "PeriodeLock"("periodYear", "periodMonth");

CREATE INDEX "PeriodeLock_periodYear_periodMonth_idx"
    ON "PeriodeLock"("periodYear", "periodMonth");

ALTER TABLE "PeriodeLock"
    ADD CONSTRAINT "PeriodeLock_lockedById_fkey"
    FOREIGN KEY ("lockedById") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── 2. Refund ────────────────────────────────────────────────────────────────
CREATE TABLE "Refund" (
    "id"           TEXT NOT NULL,
    "siswaId"      TEXT NOT NULL,
    "pembayaranId" TEXT,
    "amount"       DECIMAL(12,2) NOT NULL,
    "alasan"       TEXT NOT NULL,
    "tanggal"      DATE NOT NULL,
    "noBukti"      TEXT,
    "createdById"  TEXT NOT NULL,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Refund_siswaId_idx"    ON "Refund"("siswaId");
CREATE INDEX "Refund_tanggal_idx"    ON "Refund"("tanggal");
CREATE INDEX "Refund_createdAt_idx"  ON "Refund"("createdAt");

ALTER TABLE "Refund"
    ADD CONSTRAINT "Refund_siswaId_fkey"
    FOREIGN KEY ("siswaId") REFERENCES "Siswa"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Refund"
    ADD CONSTRAINT "Refund_pembayaranId_fkey"
    FOREIGN KEY ("pembayaranId") REFERENCES "Pembayaran"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Refund"
    ADD CONSTRAINT "Refund_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── 3. PembayaranCancelRequest ───────────────────────────────────────────────
CREATE TYPE "CancelRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "PembayaranCancelRequest" (
    "id"            TEXT NOT NULL,
    "pembayaranId"  TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "alasan"        TEXT NOT NULL,
    "status"        "CancelRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById"  TEXT,
    "reviewedAt"    TIMESTAMP(3),
    "reviewNote"    TEXT,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PembayaranCancelRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PembayaranCancelRequest_pembayaranId_idx"
    ON "PembayaranCancelRequest"("pembayaranId");
CREATE INDEX "PembayaranCancelRequest_status_createdAt_idx"
    ON "PembayaranCancelRequest"("status", "createdAt");
CREATE INDEX "PembayaranCancelRequest_requestedById_idx"
    ON "PembayaranCancelRequest"("requestedById");

ALTER TABLE "PembayaranCancelRequest"
    ADD CONSTRAINT "PembayaranCancelRequest_pembayaranId_fkey"
    FOREIGN KEY ("pembayaranId") REFERENCES "Pembayaran"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PembayaranCancelRequest"
    ADD CONSTRAINT "PembayaranCancelRequest_requestedById_fkey"
    FOREIGN KEY ("requestedById") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── 4. Missing index: Kwitansi(createdById, createdAt) ──────────────────────
CREATE INDEX "Kwitansi_createdById_createdAt_idx"
    ON "Kwitansi"("createdById", "createdAt");

-- ── 5. Missing index: AuditLog(action, createdAt) ───────────────────────────
CREATE INDEX "AuditLog_action_createdAt_idx"
    ON "AuditLog"("action", "createdAt");
