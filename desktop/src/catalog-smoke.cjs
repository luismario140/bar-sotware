async function runCatalogSmoke(window, backend, helpers) {
  const { evaluate, waitFor, fill, submit } = helpers
  await waitFor("document.getElementById('new-product')")
  await evaluate("document.getElementById('new-product').click()")
  await waitFor("document.getElementById('product-name')")
  await fill('product-name', 'Producto propio de prueba')
  await fill('product-category', 'Pruebas')
  await fill('product-unit', '6500,50')
  await fill('product-shot', '9000')
  // Archivo de prueba en memoria; no utiliza imágenes ni rutas del negocio real.
  await evaluate(`(() => {
    const canvas = document.createElement('canvas'); canvas.width = 40; canvas.height = 60;
    const context = canvas.getContext('2d'); context.fillStyle = '#dfae67'; context.fillRect(5, 5, 30, 50);
    const data = Uint8Array.from(atob(canvas.toDataURL('image/png').split(',')[1]), value => value.charCodeAt(0));
    const transfer = new DataTransfer(); transfer.items.add(new File([data], 'usb-test.png', { type: 'image/png' }));
    const input = document.getElementById('product-file'); input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  })()`)
  await waitFor("document.querySelector('.image-preview img') && !document.querySelector('#product-form fieldset').disabled")
  await submit()
  await waitFor("!document.querySelector('dialog[open]') && document.querySelector('[data-product-id]')")
  await waitFor("document.querySelector('.product-card img')?.naturalWidth > 0")
  let products = await backend.catalog('list')
  if (!products.ok || products.body.length !== 1 || products.body[0].unitPriceMinor !== 650050 || !products.body[0].imageId) throw new Error('Falló el alta del producto con imagen.')
  const id = products.body[0].id
  const image = await backend.catalog('image', { id })
  if (!image.ok || !image.body.startsWith('data:image/png;base64,')) throw new Error('La imagen local no responde.')
  await evaluate("document.querySelector('[data-action=edit]').click()")
  await waitFor("document.getElementById('product-name')")
  await fill('product-name', 'Producto editado de prueba')
  await fill('product-unit', '7000')
  await submit()
  await waitFor("!document.querySelector('dialog[open]') && document.body.innerText.includes('Producto editado de prueba')")
  for (const active of [false, true]) {
    await evaluate("document.querySelector('[data-action=status]').click()")
    await waitFor("document.getElementById('confirm-product-status')")
    await evaluate("document.getElementById('confirm-product-status').click()")
    await waitFor("!document.querySelector('dialog[open]')")
    products = await backend.catalog('list')
    if (products.body.length !== 1 || products.body[0].active !== active || products.body[0].id !== id) throw new Error('Falló el cambio de estado del producto.')
  }
  await fill('product-search', 'sin coincidencias')
  await waitFor("!document.querySelector('[data-product-id]') && document.body.innerText.includes('No hay productos con estos filtros')")
  await fill('product-search', '')
  await waitFor("document.querySelector('[data-product-id]')")
  console.log('APPBARPOS_CATALOG_SMOKE=create,image,edit,status,search:OK')
}

module.exports = { runCatalogSmoke }
