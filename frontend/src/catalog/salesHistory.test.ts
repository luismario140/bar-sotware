import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { displayName } from './names.ts'
import { collectSales, visibleHistory } from './salesHistory.ts'
import { salesWorkbook } from './salesExport.ts'
import { accountProduct, paymentLabel } from './accounts.ts'
import type { SaleReceipt } from '../services/catalog.ts'

const sale = (index: number): SaleReceipt => ({ id: `venta-${index}`, totalMinor: 650050, occurredAt: 0,
  lines: [{ quantity: 1, unitPriceMinor: 650050, subtotalMinor: 650050, product: {
    id: 'producto', name: '=aguardiente & antioqueño', category: 'Aguardientes', active: true, version: 1,
    unitPriceMinor: 650050, shotPriceMinor: null, imageId: null, quantitySold: 1, quantityRemaining: 4, packageKind: 'BOTELLA', volumeMl: 750,
  } }] })

test('muestra las iniciales de cada palabra sin cambiar siglas ni el valor original', () => {
  assert.equal(displayName('aguardiente antioqueño'), 'Aguardiente Antioqueño')
  assert.equal(displayName('álvaro josé'), 'Álvaro José')
  assert.equal(displayName('ron-anejo COP'), 'Ron-Anejo COP')
})

test('divide las ultimas veinte ventas en cinco paginas de cuatro', () => {
  const sales = Array.from({ length: 20 }, (_, index) => sale(index))
  for (let page = 0; page < 5; page++) {
    const result = visibleHistory({ sales, page: 0, hasNext: true }, page)
    assert.deepEqual(result.sales.map(value => value.id), sales.slice(page * 4, page * 4 + 4).map(value => value.id))
    assert.equal(result.hasNext, page < 4)
  }
  assert.equal(visibleHistory({ sales: sales.slice(0, 6), page: 0, hasNext: false }, 1).sales.length, 2)
  assert.equal(visibleHistory({ sales: [], page: 0, hasNext: false }, 0).hasNext, false)
  assert.equal(visibleHistory({ sales, page: 0, hasNext: true }, 5).page, 4)
})

test('exporta paginas antiguas y elimina repetidos entre lotes', async () => {
  const requested: number[] = []
  const result = await collectSales(async page => {
    requested.push(page)
    return { sales: page === 0 ? Array.from({ length: 20 }, (_, index) => sale(index)) : [sale(19), sale(20)], page, hasNext: page === 0 }
  })
  assert.deepEqual(requested, [0, 1])
  assert.equal(result.length, 21)
  assert.equal(result[20].id, 'venta-20')
})

test('el Excel incluye dos hojas, importes exactos y texto seguro', () => {
  const workbook = salesWorkbook([sale(0)])
  assert.equal(new DataView(workbook.buffer).getUint32(0, true), 0x04034b50)
  const content = new TextDecoder().decode(workbook)
  assert.ok(content.includes('name="Ventas"'))
  assert.ok(content.includes('name="Detalle"'))
  assert.ok(content.includes('<v>6500.50</v>'))
  assert.ok(content.includes('=aguardiente &amp; Antioqueño'))
  assert.ok(!content.includes('<f>'))
  const large = sale(1)
  large.totalMinor = Number.MAX_SAFE_INTEGER
  assert.ok(new TextDecoder().decode(salesWorkbook([large])).includes('90071992547409,91'))
  const paid = sale(2)
  paid.paymentMethod = 'TRANSFERENCIA'; paid.accountName = 'amigos de mario'
  const paidExport = new TextDecoder().decode(salesWorkbook([paid]))
  assert.ok(paidExport.includes('Transferencia'))
  assert.ok(paidExport.includes('Amigos De Mario'))
  assert.ok(paidExport.includes('Cerrada'))
})

test('al retomar una cuenta sus reservas y precios se aplican solo a esa cuenta', () => {
  const product = sale(0).lines[0].product
  const current = { ...product, quantityRemaining: 2, unitPriceMinor: 900000 }
  const account = { id: 'account', version: 1, paymentMethod: 'EFECTIVO' as const, name: null, totalMinor: 650050, lines: sale(0).lines, createdAt: 0, updatedAt: 0 }
  assert.equal(accountProduct(current, null).quantityRemaining, 2)
  assert.equal(accountProduct(current, account).quantityRemaining, 3)
  assert.equal(accountProduct(current, account).unitPriceMinor, 650050)
  assert.equal(current.unitPriceMinor, 900000)
  assert.equal(paymentLabel(null), 'No registrado')
})
