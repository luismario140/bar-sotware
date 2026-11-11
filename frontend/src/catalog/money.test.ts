import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { money, priceInput } from './money.ts'

test('editar un precio conserva todos sus centavos y ceros', () => {
  assert.equal(priceInput(650050), '6500.50')
  assert.equal(priceInput(0), '0.00')
  assert.equal(priceInput(1), '0.01')
  assert.equal(priceInput(Number.MAX_SAFE_INTEGER), '90071992547409.91')
})

test('la presentación COP no redondea los centavos de importes grandes', () => {
  assert.ok(money(650050).includes('6.500,5'))
  assert.ok(money(1).includes('0,01'))
  assert.ok(money(Number.MAX_SAFE_INTEGER).includes('90.071.992.547.409,91'))
})
