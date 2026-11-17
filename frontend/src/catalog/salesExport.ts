import type { SaleReceipt } from '../services/catalog'
import { displayName } from './names.ts'
import { paymentLabel } from './accounts.ts'

type Cell = string | number | { amount: number }
const encoder = new TextEncoder()
const xml = (value: string) => value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]!)
const join = (parts: Uint8Array[]) => {
  const result = new Uint8Array(parts.reduce((size, part) => size + part.length, 0))
  let offset = 0
  for (const part of parts) { result.set(part, offset); offset += part.length }
  return result
}

// ZIP with stored entries: a workbook needs no compression or external runtime.
function zip(files: Record<string, string>): Uint8Array<ArrayBuffer> {
  const entries: Uint8Array[] = [], directory: Uint8Array[] = []
  let offset = 0
  for (const [path, value] of Object.entries(files)) {
    const name = encoder.encode(path), content = encoder.encode(value)
    let crc = 0xffffffff
    for (const byte of content) {
      crc ^= byte
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0)
    }
    crc = (crc ^ 0xffffffff) >>> 0
    const header = new Uint8Array(30), local = new DataView(header.buffer)
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true)
    local.setUint16(12, 33, true) // 1980-01-01
    local.setUint32(14, crc, true); local.setUint32(18, content.length, true); local.setUint32(22, content.length, true); local.setUint16(26, name.length, true)
    entries.push(header, name, content)
    const entry = new Uint8Array(46), central = new DataView(entry.buffer)
    central.setUint32(0, 0x02014b50, true); central.setUint16(4, 20, true); central.setUint16(6, 20, true)
    central.setUint16(14, 33, true); central.setUint32(16, crc, true)
    central.setUint32(20, content.length, true); central.setUint32(24, content.length, true); central.setUint16(28, name.length, true); central.setUint32(42, offset, true)
    directory.push(entry, name)
    offset += header.length + name.length + content.length
  }
  const centralDirectory = join(directory), end = new Uint8Array(22), view = new DataView(end.buffer)
  view.setUint32(0, 0x06054b50, true); view.setUint16(8, Object.keys(files).length, true); view.setUint16(10, Object.keys(files).length, true)
  view.setUint32(12, centralDirectory.length, true); view.setUint32(16, offset, true)
  return join([...entries, centralDirectory, end]) as Uint8Array<ArrayBuffer>
}

function sheet(rows: Cell[][]): string {
  if (rows.length > 1_048_576) throw new Error('El historial supera el límite de filas de Excel.')
  const cell = (value: Cell) => {
    if (typeof value === 'number') return `<c><v>${value}</v></c>`
    if (typeof value === 'object') {
      const cents = BigInt(value.amount), amount = `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`
      // Excel only preserves 15 significant numeric digits; keep larger amounts as text.
      if (cents <= 999_999_999_999_999n) return `<c s="1"><v>${amount}</v></c>`
      return `<c t="inlineStr"><is><t>${amount.replace('.', ',')}</t></is></c>`
    }
    return `<c t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`
  }
  return `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="1" width="38" customWidth="1"/><col min="2" max="10" width="24" customWidth="1"/></cols><sheetData>${rows.map((row, index) => `<row r="${index + 1}">${row.map(cell).join('')}</row>`).join('')}</sheetData></worksheet>`
}

export function salesWorkbook(sales: SaleReceipt[]): Uint8Array<ArrayBuffer> {
  const summary: Cell[][] = [['Venta', 'Fecha (Bogotá)', 'Productos distintos', 'Unidades', 'Total COP', 'Método de pago', 'Estado de cuenta', 'Nombre de cuenta', 'Cuenta original']]
  const details: Cell[][] = [['Venta', 'Fecha (Bogotá)', 'Producto', 'Categoría', 'Presentación', 'Contenido ml', 'Cantidad', 'Precio unitario COP', 'Subtotal COP']]
  const date = new Intl.DateTimeFormat('es-CO', { dateStyle: 'short', timeStyle: 'medium', timeZone: 'America/Bogota' })
  for (const sale of sales) {
    const time = date.format(sale.occurredAt)
    summary.push([sale.id, time, sale.lines.length, sale.lines.reduce((sum, line) => sum + BigInt(line.quantity), 0n).toString(), { amount: sale.totalMinor }, paymentLabel(sale.paymentMethod), 'Cerrada', displayName(sale.accountName ?? ''), sale.accountId ?? ''])
    for (const line of sale.lines) details.push([sale.id, time, displayName(line.product.name), line.product.category, line.product.packageKind ?? '', line.product.volumeMl ?? '', line.quantity, { amount: line.unitPriceMinor }, { amount: line.subtotalMinor }])
  }
  return zip({
    '[Content_Types].xml': '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    '_rels/.rels': '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml': '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Ventas" sheetId="1" r:id="rId1"/><sheet name="Detalle" sheetId="2" r:id="rId2"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    'xl/styles.xml': '<?xml version="1.0"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>',
    'xl/worksheets/sheet1.xml': sheet(summary),
    'xl/worksheets/sheet2.xml': sheet(details),
  })
}
