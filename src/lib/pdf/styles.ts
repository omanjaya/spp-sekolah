import { StyleSheet } from '@react-pdf/renderer'

/**
 * PDF styles — "DAFTAR SISWA YANG MEMBAYAR UANG KOMITE" matrix layout.
 * Landscape A4, dense table with 12 month columns + summary column.
 */

const COLORS = {
  ink: '#0f172a',
  ink2: '#1e293b',
  muted: '#64748b',
  faint: '#94a3b8',
  line: '#cbd5e1',
  lineSoft: '#e2e8f0',
  bgAlt: '#f8fafc',
  bgHead: '#0f172a',
  bgHeadSoft: '#f1f5f9',
  accent: '#0f766e', // teal — subtle school accent
  success: '#047857',
  warning: '#b45309',
  waiverBg: '#fef3c7',
  belumBg: '#ffffff',
}

export const pdfStyles = StyleSheet.create({
  page: {
    paddingTop: 14,
    paddingBottom: 20,
    paddingHorizontal: 14,
    fontFamily: 'Helvetica',
    fontSize: 6,
    color: COLORS.ink,
  },

  // ─── Header ──────────────────────────────────────────────
  headerBlock: {
    marginBottom: 4,
  },
  titleBar: {
    backgroundColor: COLORS.bgHead,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  title: {
    color: '#ffffff',
    fontFamily: 'Helvetica-Bold',
    fontSize: 10,
    textAlign: 'center',
    letterSpacing: 0.6,
  },
  titleAccent: {
    height: 2,
    backgroundColor: COLORS.accent,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
    paddingHorizontal: 2,
  },
  metaLeft: { flexDirection: 'column', maxWidth: '60%' },
  metaRight: { flexDirection: 'column', alignItems: 'flex-end' },
  metaLine: { flexDirection: 'row', gap: 2, marginTop: 1 },
  metaLabel: {
    fontSize: 6.5,
    color: COLORS.muted,
    minWidth: 44,
  },
  metaValue: {
    fontSize: 6.8,
    color: COLORS.ink,
    fontFamily: 'Helvetica-Bold',
  },
  metaHead: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 8,
    color: COLORS.ink,
  },
  metaSub: {
    fontSize: 7,
    color: COLORS.muted,
    marginTop: 0.5,
  },

  // ─── Table ───────────────────────────────────────────────
  table: {
    borderTopWidth: 0.5,
    borderLeftWidth: 0.5,
    borderColor: COLORS.line,
    marginTop: 4,
  },
  headRow: {
    flexDirection: 'row',
    backgroundColor: COLORS.bgHeadSoft,
  },
  row: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
  },
  rowAlt: {
    flexDirection: 'row',
    backgroundColor: COLORS.bgAlt,
  },
  headCell: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 5.7,
    paddingVertical: 3,
    paddingHorizontal: 1.5,
    textAlign: 'center',
    color: COLORS.ink2,
    borderRightWidth: 0.5,
    borderBottomWidth: 0.5,
    borderColor: COLORS.line,
  },
  cell: {
    fontSize: 5.8,
    paddingVertical: 1.6,
    paddingHorizontal: 1.5,
    borderRightWidth: 0.25,
    borderBottomWidth: 0.25,
    borderColor: COLORS.lineSoft,
    color: COLORS.ink,
  },
  cellCenter: { textAlign: 'center' },
  cellLeft: { textAlign: 'left' },

  // Column widths (landscape A4 usable = ~814pt)
  cellNo: { width: 18 },
  cellNis: { width: 44 },
  cellNama: { width: 148 },
  cellMonth: { width: 46, flex: 1 },
  cellSum: { width: 36 },

  // Status styling
  cellLunas: {
    color: COLORS.ink,
  },
  cellBelum: {
    color: COLORS.faint,
  },
  cellWaiver: {
    color: COLORS.warning,
    fontFamily: 'Helvetica-Bold',
    backgroundColor: COLORS.waiverBg,
  },

  // Summary column per row (count of paid)
  summaryChip: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 5.8,
    color: COLORS.success,
  },
  summaryChipWarn: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 5.8,
    color: COLORS.warning,
  },

  // ─── Legend ──────────────────────────────────────────────
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 6,
    paddingHorizontal: 2,
    gap: 10,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    fontSize: 5.8,
    color: COLORS.muted,
  },
  legendSwatch: {
    width: 7,
    height: 7,
    marginRight: 3,
    borderWidth: 0.5,
    borderColor: COLORS.line,
  },

  // ─── Footer ──────────────────────────────────────────────
  footer: {
    position: 'absolute',
    bottom: 8,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 6.2,
    color: COLORS.muted,
    paddingTop: 3,
    borderTopWidth: 0.5,
    borderTopColor: COLORS.lineSoft,
  },
})
