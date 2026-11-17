async function runCatalogSmoke(window, backend, helpers) {
  const { evaluate, waitFor, fill, submit } = helpers
  await waitFor("document.querySelectorAll('.inventory-group').length === 8")
  await evaluate("document.getElementById('new-product').click()")
  await waitFor("document.getElementById('product-name')")
  if (await evaluate("!document.getElementById('product-category').required || document.getElementById('product-category').options.length !== 9 || document.getElementById('product-category').value !== ''")) throw new Error('Las ocho categorias no son obligatorias.')
  await fill('product-name', 'Producto propio de prueba')
  await fill('product-category', 'Cervezas')
  await fill('product-unit', '6500,50')
  await fill('product-remaining', '24')
  await submit()
  await waitFor("!document.querySelector('dialog[open]') && document.querySelector('[data-product-id]')")
  let products = await backend.catalog('list')
  if (!products.ok || products.body.length !== 1 || products.body[0].quantityRemaining !== 24 || products.body[0].quantitySold !== 0) throw new Error('Fallo el alta del inventario.')
  const id = products.body[0].id
  if (await evaluate("document.querySelector('.sidebar-account strong').textContent[0] !== document.querySelector('.sidebar-account strong').textContent[0].toUpperCase() || document.querySelector('.product-name-button').textContent !== 'Producto Propio De Prueba'")) throw new Error('Los nombres no muestran las iniciales en mayuscula.')
  if (await evaluate("document.querySelectorAll('.inventory-table th').length !== 6")) throw new Error('Las columnas del inventario no coinciden.')
  await evaluate("document.querySelector('[data-action=edit]').click()")
  await waitFor("document.getElementById('product-name')")
  if (await evaluate("!document.getElementById('product-sold').readOnly")) throw new Error('La cantidad vendida debe calcularse con las ventas.')
  await fill('product-name', 'Producto editado de prueba')
  await fill('product-unit', '7000')
  await fill('product-remaining', '21')
  await submit()
  await waitFor("!document.querySelector('dialog[open]')")
  await evaluate("document.querySelector('[data-action=restock]').click()")
  await waitFor("document.getElementById('restock-quantity')")
  await fill('restock-quantity', '6')
  await submit()
  await waitFor("!document.querySelector('dialog[open]')")
  products = await backend.catalog('list')
  if (products.body[0].quantityRemaining !== 27 || products.body[0].quantitySold !== 0) throw new Error('La reposicion no sumo sobre el saldo anterior.')
  await evaluate("document.querySelector('[data-category=Rones] summary').click()")
  await evaluate("document.querySelector('[data-category=Rones] [data-action=add-category-product]').click()")
  await waitFor("document.getElementById('product-name')")
  if (await evaluate("document.getElementById('product-category').value !== 'Rones' || !document.getElementById('product-package').required")) throw new Error('La categoria no se preselecciono o falta la presentacion.')
  await fill('product-name', 'Ron propio de prueba')
  await fill('product-package', 'MEDIA')
  if (await evaluate("document.getElementById('product-volume').value !== '375'")) throw new Error('La media no propone 375 ml.')
  await fill('product-package', 'LITRO')
  if (await evaluate("document.getElementById('product-volume').value !== '1000'")) throw new Error('El litro no propone 1000 ml.')
  await fill('product-package', 'BOTELLA')
  if (await evaluate("document.getElementById('product-volume').value !== '750'")) throw new Error('La botella no propone 750 ml.')
  await fill('product-unit', '50000')
  await fill('product-remaining', '12')
  await submit()
  await waitFor("!document.querySelector('dialog[open]') && document.querySelectorAll('[data-product-id]').length === 2")
  products = await backend.catalog('list')
  const rum = products.body.find(product => product.category === 'Rones')
  if (rum.packageKind !== 'BOTELLA' || rum.volumeMl !== 750) throw new Error('No se guardo la presentacion del ron.')
  if (await evaluate("!document.querySelector('[data-product-id=' + CSS.escape(" + JSON.stringify(rum.id) + ") + '] .stock-low') || !!document.querySelector('[data-product-id=' + CSS.escape(" + JSON.stringify(id) + ") + '] .stock-low')")) throw new Error('El inventario no distingue stock bajo de stock suficiente.')
  async function verifyInventoryScroll() {
    const result = await evaluate(`(async () => {
      const groups = document.querySelector('.inventory-groups');
      const sections = Array.from(groups.querySelectorAll('details'));
      const opened = sections.map(section => section.open);
      sections.forEach(section => { section.open = true; });
      const tbody = groups.querySelector('tbody');
      const rows = Array.from({ length: 36 }, () => tbody.firstElementChild.cloneNode(true));
      rows.forEach(row => tbody.append(row));
      const fixed = [document.querySelector('.sidebar'), document.querySelector('.page-header'), document.querySelector('.catalog-heading'), document.querySelector('.catalog-filters'), document.getElementById('logout'), document.querySelector('.sidebar-footer')];
      const before = fixed.map(element => element.getBoundingClientRect().top);
      groups.scrollTop = groups.scrollHeight;
      const tableScroll = groups.querySelector('.inventory-scroll');
      tableScroll.scrollLeft = tableScroll.scrollWidth;
      rows.at(-1).scrollIntoView({ block: 'nearest', inline: 'nearest' });
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const after = fixed.map(element => element.getBoundingClientRect().top);
      const last = rows.at(-1).getBoundingClientRect();
      const viewport = groups.getBoundingClientRect();
      const result = {
        stationary: before.every((top, index) => Math.abs(top - after[index]) < 1),
        scrolls: groups.scrollTop > 0,
        lastProductVisible: last.bottom <= viewport.bottom + 1 && last.top >= viewport.top,
        documentFits: document.documentElement.scrollHeight <= innerHeight && document.documentElement.scrollWidth <= innerWidth,
        sidebarVisible: fixed[0].getBoundingClientRect().top === 0 && fixed[4].getBoundingClientRect().bottom <= innerHeight && fixed[5].getBoundingClientRect().bottom <= innerHeight,
      };
      if (!result.documentFits) result.overflow = { height: document.documentElement.scrollHeight, width: document.documentElement.scrollWidth, viewportHeight: innerHeight, viewportWidth: innerWidth };
      rows.forEach(row => row.remove());
      sections.forEach((section, index) => { section.open = opened[index]; });
      groups.scrollTop = 0; tableScroll.scrollLeft = 0;
      return result;
    })()`)
    if (Object.values(result).some(value => !value)) throw new Error('El inventario desplegado mueve el panel lateral o pierde productos: ' + JSON.stringify(result))
  }
  await verifyInventoryScroll()
  const inventoryBounds = window.getBounds()
  try {
    window.setSize(800, 650)
    await waitFor('innerWidth <= 800')
    await verifyInventoryScroll()
  } finally { window.setBounds(inventoryBounds) }
  if (await evaluate("!!document.getElementById('new-sale')")) throw new Error('La venta sigue dentro del inventario.')
  async function clickCard(productId) {
    await evaluate("document.querySelector('[data-sale-card=' + CSS.escape(" + JSON.stringify(productId) + ") + ']').click()")
  }
  async function buildSale() {
    await evaluate("document.getElementById('sales-navigation').click()")
    await waitFor("document.querySelectorAll('[data-sale-card]').length === 2 && !document.querySelector('[data-sale-card]').disabled")
    await evaluate("document.getElementById('payment-cash').click()")
    if (await evaluate("!!document.getElementById('sale-search')")) throw new Error('La venta no debe mostrar busqueda por teclado.')
    await evaluate("Array.from(document.querySelectorAll('.sales-category-tabs button')).find(button => button.textContent === 'Cervezas').click()")
    await waitFor("document.querySelectorAll('[data-sale-card]').length === 1")
    await clickCard(id)
    await waitFor("document.getElementById('sale-total').textContent.replace(/\\D/g, '') === '7000'")
    await clickCard(id)
    await clickCard(id)
    await evaluate("document.querySelector('.sales-category-tabs button').click()")
    await waitFor("document.querySelectorAll('[data-sale-card]').length === 2")
    await clickCard(rum.id)
    await clickCard(rum.id)
    await waitFor("document.getElementById('sale-total').textContent.replace(/\\D/g, '') === '121000'")
  }
  await buildSale()
  const layout = await evaluate(`(() => {
    const catalog = document.querySelector('.sales-catalog').getBoundingClientRect();
    const ticket = document.querySelector('.sales-receipt').getBoundingClientRect();
    return { catalogRight: catalog.right, ticketLeft: ticket.left, viewport: innerWidth };
  })()`)
  if (layout.viewport > 850 && layout.ticketLeft < layout.catalogRight) throw new Error('El comprobante no aparece al costado del catalogo.')
  if (await evaluate("document.querySelector('.sales-receipt').getBoundingClientRect().top > document.querySelector('.page-header').getBoundingClientRect().top || document.getElementById('refresh-sales').textContent.trim() !== '' || !document.getElementById('refresh-sales').getAttribute('aria-label')")) throw new Error('El comprobante no aprovecha el espacio superior o falta el icono accesible de recarga.')
  const previewPath = require('node:path').join(process.env.APPBARPOS_DATA_DIR, 'sales-receipt-preview.png')
  await window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })
  await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
  require('node:fs').writeFileSync(previewPath, (await window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG())
  console.log('APPBARPOS_SALES_PREVIEW=' + previewPath)
  async function verifyPinnedPanels() {
    const result = await evaluate(`(async () => {
      const catalog = document.querySelector('.sales-catalog');
      const items = document.querySelector('.draft-ticket .ticket-items');
      const sidebar = document.querySelector('.sidebar');
      const header = document.querySelector('.page-header');
      const receipt = document.querySelector('.sales-receipt');
      const total = document.querySelector('.draft-ticket .ticket-total');
      const complete = document.getElementById('complete-sale');
      const spacer = document.createElement('div');
      spacer.style.height = '1500px';
      catalog.append(spacer);
      const extraLines = Array.from({ length: 12 }, () => items.firstElementChild.cloneNode(true));
      extraLines.forEach(line => items.append(line));
      const before = [sidebar, header, receipt, total, complete].map(element => element.getBoundingClientRect().top);
      catalog.scrollTop = 700;
      items.scrollTop = items.scrollHeight;
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const after = [sidebar, header, receipt, total, complete].map(element => element.getBoundingClientRect().top);
      const result = {
        stationary: before.every((top, index) => Math.abs(top - after[index]) < 1),
        catalogScrolled: catalog.scrollTop > 0,
        receiptScrolled: items.scrollTop > 0,
        controlsVisible: complete.getBoundingClientRect().bottom <= innerHeight && receipt.getBoundingClientRect().top >= 0,
        receiptFillsWindow: receipt.getBoundingClientRect().height >= innerHeight - 64 && receipt.getBoundingClientRect().bottom <= innerHeight,
        sidebarAccount: !!sidebar.querySelector('.sidebar-account') && !!sidebar.querySelector('#logout') && !!sidebar.querySelector('footer'),
        documentFits: document.documentElement.scrollHeight <= innerHeight,
      };
      spacer.remove(); extraLines.forEach(line => line.remove());
      catalog.scrollTop = 0; items.scrollTop = 0;
      return result;
    })()`)
    if (Object.values(result).some(value => !value)) throw new Error('El panel o comprobante no permanece visible: ' + JSON.stringify(result))
  }
  await verifyPinnedPanels()
  const originalBounds = window.getBounds()
  try {
    window.setSize(800, 650)
    await waitFor('innerWidth <= 800')
    await verifyPinnedPanels()
  } finally {
    window.setBounds(originalBounds)
  }
  await evaluate("document.getElementById('clear-sale').click()")
  await waitFor("!document.querySelector('[data-sale-product]')")
  products = await backend.catalog('list')
  if (products.body.find(product => product.id === id).quantityRemaining !== 27) throw new Error('Vaciar una venta cambio el inventario.')
  await buildSale()
  // El borrador se conserva al editar el precio en inventario.
  await evaluate("document.getElementById('products-navigation').click()")
  await waitFor("document.querySelector('[data-action=edit-price]')")
  await evaluate("document.querySelector('[data-action=edit-price]').click()")
  await waitFor("document.getElementById('product-unit')")
  await fill('product-unit', '8000')
  await submit()
  await waitFor("!document.querySelector('dialog[open]')")
  await evaluate("document.getElementById('sales-navigation').click()")
  await waitFor("document.getElementById('sale-total').textContent.replace(/\\D/g, '') === '124000'")
  await evaluate("document.getElementById('complete-sale').click()")
  await waitFor("document.querySelector('.sales-receipt .form-success') && document.querySelector('.draft-ticket') && !document.querySelector('[data-sale-product]') && document.getElementById('sale-total').textContent.replace(/\\D/g, '') === '0' && !document.getElementById('start-another-sale') && !document.getElementById('products-navigation').disabled")
  if (await evaluate("!document.getElementById('complete-sale').disabled")) throw new Error('El comprobante vacio permite completar otra venta.')
  await waitFor("!document.querySelector('.sales-receipt .form-success')")
  if (await evaluate("!!document.querySelector('[data-sale-product]') || !document.querySelector('.draft-ticket')")) throw new Error('El aviso no desaparecio con el comprobante vacio.')
  await evaluate("document.getElementById('payment-cash').click()")
  await clickCard(id)
  await waitFor("document.querySelector('[data-sale-product]') && !document.getElementById('complete-sale').disabled")
  await evaluate("document.getElementById('clear-sale').click()")
  await waitFor("!document.querySelector('[data-sale-product]')")
  products = await backend.catalog('list')
  const sold = products.body.find(product => product.id === id)
  const soldRum = products.body.find(product => product.id === rum.id)
  if (sold.quantityRemaining !== 24 || sold.quantitySold !== 3 || soldRum.quantityRemaining !== 10 || soldRum.quantitySold !== 2) throw new Error('La venta no actualizo ambos productos.')
  let history = await backend.catalog('sales', { page: 0 })
  if (!history.ok || history.body.sales.length !== 1 || history.body.sales[0].totalMinor !== 12400000) throw new Error('La venta no quedo guardada con el total correcto.')
  const saleId = history.body.sales[0].id
  await evaluate("document.getElementById('sales-history-tab').click()")
  await waitFor("document.querySelector('[data-history-sale]') && document.querySelector('[data-receipt-id]')")
  await evaluate("document.getElementById('products-navigation').click()")
  await waitFor("document.querySelector('[data-action=edit-price]')")
  await evaluate("document.querySelector('[data-action=edit-price]').click()")
  await waitFor("document.getElementById('product-unit')")
  await fill('product-unit', '9000')
  await submit()
  await waitFor("!document.querySelector('dialog[open]')")
  await evaluate("document.getElementById('sales-navigation').click()")
  await waitFor("document.querySelector('[data-history-sale]')")
  history = await backend.catalog('sales', { page: 0 })
  const recordedLine = history.body.sales[0].lines.find(line => line.product.id === id)
  if (history.body.sales[0].id !== saleId || recordedLine.unitPriceMinor !== 800000 || history.body.sales[0].totalMinor !== 12400000) throw new Error('Editar precios altero una venta ya guardada.')
  await evaluate("document.getElementById('products-navigation').click()")
  await waitFor("document.querySelectorAll('[data-product-id]').length === 2")
  await fill('product-search', 'sin coincidencias')
  await waitFor("!document.querySelector('[data-product-id]') && document.body.innerText.includes('No hay productos con estos filtros')")
  await fill('product-search', '')
  await waitFor("document.querySelectorAll('[data-product-id]').length === 2")
  await evaluate("document.getElementById('security-navigation').click()")
  await waitFor("document.getElementById('security-current-pin')")
  await evaluate("document.getElementById('products-navigation').click()")
  await waitFor("document.querySelectorAll('[data-product-id]').length === 2")
  if (await evaluate("document.querySelector('[data-product-id=' + CSS.escape(" + JSON.stringify(id) + ") + '] [data-quantity=remaining]').textContent !== '24'")) throw new Error('Las existencias no persisten al recargar.')
  await evaluate("document.querySelector('[data-action=delete]').click()")
  await waitFor("document.getElementById('confirm-product-delete')")
  await evaluate("document.querySelector('dialog .secondary-button').click()")
  await waitFor("!document.querySelector('dialog[open]') && document.querySelectorAll('[data-product-id]').length === 2")
  await evaluate("document.querySelector('[data-action=delete]').click()")
  await waitFor("document.getElementById('confirm-product-delete')")
  await evaluate("document.getElementById('confirm-product-delete').click()")
  await waitFor("!document.querySelector('dialog[open]') && document.querySelectorAll('[data-product-id]').length === 1")
  products = await backend.catalog('list')
  if (!products.ok || products.body.length !== 1 || products.body[0].id === id) throw new Error('No se elimino el producto confirmado.')
  // Twenty-two sales exercise the display limit and export beyond the visible history.
  const randomUUID = require('node:crypto').randomUUID
  let exportProduct = products.body[0]
  const replenished = await backend.catalog('restock', { id: exportProduct.id, expectedVersion: exportProduct.version, operationId: randomUUID(), quantity: 30 })
  if (!replenished.ok) throw new Error('No se pudo preparar la prueba de historial.')
  exportProduct = replenished.body
  for (let index = 0; index < 21; index++) {
    const created = await backend.catalog('checkout', { operationId: randomUUID(), paymentMethod: 'EFECTIVO', lines: [{ productId: exportProduct.id, expectedVersion: exportProduct.version, quantity: 1 }] })
    if (!created.ok) throw new Error('No se pudo preparar una venta de historial.')
    exportProduct = created.body.lines[0].product
  }
  await evaluate("document.getElementById('sales-navigation').click()")
  await waitFor("document.querySelectorAll('[data-history-sale]').length === 4 && document.querySelector('.sales-pagination').textContent.includes('Página 1 de 5')")
  const displayedIds = new Set(await evaluate("Array.from(document.querySelectorAll('[data-history-sale]'), element => element.dataset.historySale)"))
  for (let page = 2; page <= 5; page++) {
    const firstId = await evaluate("document.querySelector('[data-history-sale]').dataset.historySale")
    await evaluate("document.querySelector('.sales-pagination button:last-child').click()")
    await waitFor("document.querySelector('.sales-pagination').textContent.includes('Página " + page + " de 5') && document.querySelectorAll('[data-history-sale]').length === 4 && !document.querySelector('.sales-pagination button').disabled && document.querySelector('[data-history-sale]').dataset.historySale !== " + JSON.stringify(firstId))
    for (const historyId of await evaluate("Array.from(document.querySelectorAll('[data-history-sale]'), element => element.dataset.historySale)")) displayedIds.add(historyId)
  }
  if (displayedIds.size !== 20 || await evaluate("!document.querySelector('.sales-pagination button:last-child').disabled")) throw new Error('El historial no se limita a cinco paginas distintas de cuatro ventas.')
  const exportPath = require('node:path').join(process.env.APPBARPOS_DATA_DIR, 'ventas-prueba.xlsx')
  const download = new Promise((resolve, reject) => {
    const session = window.webContents.session
    const timer = setTimeout(() => { session.removeListener('will-download', onDownload); reject(new Error('La exportacion Excel no inicio.')) }, 20000)
    function onDownload(event, item) {
      item.setSavePath(exportPath)
      item.once('done', (event, state) => { clearTimeout(timer); state === 'completed' ? resolve() : reject(new Error('La exportacion Excel fallo: ' + state)) })
    }
    session.once('will-download', onDownload)
  })
  await evaluate("document.getElementById('export-sales').click()")
  await download
  const workbook = require('node:fs').readFileSync(exportPath)
  const sheets = new Map()
  for (let offset = 0; workbook.readUInt32LE(offset) === 0x04034b50;) {
    const size = workbook.readUInt32LE(offset + 18), nameLength = workbook.readUInt16LE(offset + 26), extraLength = workbook.readUInt16LE(offset + 28)
    const name = workbook.toString('utf8', offset + 30, offset + 30 + nameLength)
    const start = offset + 30 + nameLength + extraLength
    sheets.set(name, workbook.toString('utf8', start, start + size))
    offset = start + size
  }
  const summary = sheets.get('xl/worksheets/sheet1.xml')
  if (!summary || (summary.match(/<row /g) || []).length !== 23 || !summary.includes(saleId) || !sheets.get('xl/worksheets/sheet2.xml')?.includes('Producto Editado De Prueba')) throw new Error('Excel no conserva todas las ventas y productos historicos.')
  console.log('APPBARPOS_EXCEL_EXPORT=' + exportPath)
  await evaluate("document.getElementById('sale-register-tab').click()")
  await waitFor("document.querySelector('[data-sale-card]')")
  await evaluate("document.getElementById('payment-cash').click()")
  const stockCard = "document.querySelector('[data-sale-card=' + CSS.escape(" + JSON.stringify(exportProduct.id) + ") + ']')"
  for (let index = 0; index < exportProduct.quantityRemaining; index++) {
    await clickCard(exportProduct.id)
    const remaining = exportProduct.quantityRemaining - index - 1
    if (remaining === 15 && await evaluate("!!" + stockCard + ".querySelector('.stock-low')")) throw new Error('La alerta amarilla aparece con 15 unidades.')
    if (remaining === 14 && await evaluate("!" + stockCard + ".querySelector('.stock-low') || getComputedStyle(" + stockCard + ".querySelector('.stock-low')).color !== 'rgb(250, 204, 21)'")) throw new Error('Con 14 unidades debe aparecer la alerta amarilla.')
  }
  await waitFor(stockCard + ".disabled && " + stockCard + ".textContent.includes('Todo en esta cuenta')")
  if (await evaluate(stockCard + ".textContent.includes(' disponibles') || !!" + stockCard + ".querySelector('.sale-card-add')")) throw new Error('La tarjeta agotada sigue ofreciendo mas unidades.')
  await clickCard(exportProduct.id)
  if (await evaluate("Number(document.getElementById('sale-quantity-' + " + JSON.stringify(exportProduct.id) + ").value) !== " + exportProduct.quantityRemaining)) throw new Error('Se agregaron mas unidades que las disponibles.')
  await evaluate("document.querySelector('.ticket-quantity button').click()")
  await waitFor("!" + stockCard + ".disabled && " + stockCard + ".textContent.includes('1 disponibles')")
  await clickCard(exportProduct.id)
  await evaluate("document.getElementById('complete-sale').click()")
  await waitFor(stockCard + ".disabled && " + stockCard + ".textContent.includes('Agotado') && !document.querySelector('[data-sale-product]')")
  await clickCard(exportProduct.id)
  if (await evaluate("!!document.querySelector('[data-sale-product]')")) throw new Error('Se pudo agregar un producto sin stock.')
  const emptyStock = (await backend.catalog('list')).body[0]
  const restocked = await backend.catalog('restock', { id: emptyStock.id, expectedVersion: emptyStock.version, operationId: randomUUID(), quantity: 1 })
  if (!restocked.ok) throw new Error('No se pudo reponer el producto agotado.')
  await evaluate("document.getElementById('refresh-sales').click()")
  await waitFor("!" + stockCard + ".disabled && " + stockCard + ".textContent.includes('1 disponibles')")
  if (await evaluate("!document.getElementById('complete-sale').disabled")) throw new Error('No se exige seleccionar el metodo de pago.')
  await evaluate("document.getElementById('payment-transfer').click()")
  await waitFor("!document.getElementById('account-open').disabled")
  await evaluate("document.getElementById('account-open').click()")
  await fill('sale-account-name', 'amigos de mario')
  await clickCard(exportProduct.id)
  await evaluate("document.getElementById('complete-sale').click()")
  await waitFor("!document.querySelector('[data-sale-product]') && document.querySelector('.sale-notice')?.textContent.includes('Cuenta abierta guardada') && !document.getElementById('products-navigation').disabled")
  let openAccounts = await backend.catalog('accounts')
  if (!openAccounts.ok || openAccounts.body.length !== 1 || openAccounts.body[0].name !== 'amigos de mario') throw new Error('No se guardo la cuenta abierta con nombre.')
  const accountId = openAccounts.body[0].id
  const accountStock = (await backend.catalog('list')).body[0]
  if (accountStock.quantityRemaining !== 0 || accountStock.quantitySold !== emptyStock.quantitySold) throw new Error('Abrir una cuenta debe reservar sin marcar productos vendidos.')
  await evaluate("document.getElementById('products-navigation').click()")
  await waitFor("document.querySelector('[data-product-id]')")
  await evaluate("document.getElementById('sales-navigation').click()")
  await waitFor("!document.getElementById('open-accounts-toggle').disabled")
  async function resumeSavedAccount() {
    await evaluate("document.getElementById('open-accounts-toggle').click()")
    await waitFor("document.querySelector('[data-open-account]')")
    await evaluate("document.querySelector('[data-open-account=' + CSS.escape(" + JSON.stringify(accountId) + ") + ']').click()")
    await waitFor("document.querySelector('[data-sale-product]') && document.getElementById('account-open').getAttribute('aria-pressed') === 'true'")
  }
  await resumeSavedAccount()
  if (await evaluate("document.getElementById('sale-account-name').value !== 'amigos de mario' || document.getElementById('payment-transfer').getAttribute('aria-pressed') !== 'true'")) throw new Error('Retomar una cuenta perdio el pago o el nombre.')
  const extraStock = await backend.catalog('restock', { id: accountStock.id, expectedVersion: accountStock.version, operationId: randomUUID(), quantity: 2 })
  if (!extraStock.ok) throw new Error('No se pudo preparar la ampliacion de cuenta.')
  await evaluate("document.getElementById('refresh-sales').click()")
  await waitFor("!" + stockCard + ".disabled")
  await clickCard(exportProduct.id)
  await evaluate("document.getElementById('complete-sale').click()")
  await waitFor("!document.querySelector('[data-sale-product]') && !document.getElementById('open-accounts-toggle').disabled")
  openAccounts = await backend.catalog('accounts')
  if (openAccounts.body.length !== 1 || openAccounts.body[0].version !== 2 || openAccounts.body[0].lines[0].quantity !== 2) throw new Error('Ampliar una cuenta creo otra cuenta o perdio productos.')
  await resumeSavedAccount()
  await fill('sale-account-name', '')
  await evaluate("document.getElementById('account-closed').click()")
  await waitFor("document.getElementById('account-closed').getAttribute('aria-pressed') === 'true'")
  await evaluate("document.getElementById('complete-sale').click()")
  await waitFor("!document.querySelector('[data-sale-product]') && document.querySelector('.sale-notice')?.textContent.includes('Venta guardada')")
  const paid = (await backend.catalog('sales', { page: 0 })).body.sales[0]
  if (paid.paymentMethod !== 'TRANSFERENCIA' || paid.accountName !== null || paid.accountId !== accountId || (await backend.catalog('accounts')).body.length !== 0) throw new Error('No se cerro la cuenta con pago y nombre opcional.')
  const paidStock = (await backend.catalog('list')).body[0]
  if (paidStock.quantityRemaining !== 1 || paidStock.quantitySold !== accountStock.quantitySold + 2) throw new Error('Cerrar la cuenta desconto las reservas dos veces.')
  await evaluate("document.getElementById('sales-history-tab').click()")
  await waitFor("document.querySelector('.ticket-account-details')?.textContent.includes('Transferencia') && document.querySelector('.ticket-account-details')?.textContent.includes('Cerrada')")
  const salesBeforeDiscard = (await backend.catalog('sales', { page: 0 })).body.sales.map(sale => sale.id)
  await evaluate("document.getElementById('sale-register-tab').click()")
  await waitFor("document.getElementById('payment-cash')")
  await evaluate("document.getElementById('payment-cash').click()")
  await waitFor("!document.getElementById('account-open').disabled")
  await evaluate("document.getElementById('account-open').click()")
  await fill('sale-account-name', 'cuenta pendiente')
  await clickCard(paidStock.id)
  await evaluate("document.getElementById('complete-sale').click()")
  await waitFor("!document.querySelector('[data-sale-product]') && !document.getElementById('open-accounts-toggle').disabled")
  const pendingAccount = (await backend.catalog('accounts')).body[0]
  await evaluate("document.getElementById('open-accounts-toggle').click()")
  await waitFor("document.querySelector('[data-open-account]')")
  if (await evaluate("!!document.querySelector('#cancelled-accounts-toggle, [data-cancel-account], #cancel-current-account')")) throw new Error('La interfaz todavia ofrece anular cuentas.')
  await evaluate("document.querySelector('[data-open-account]').click()")
  await waitFor("document.querySelector('[data-sale-product]') && document.getElementById('clear-sale').textContent === 'Descartar cambios'")
  const reservedStock = (await backend.catalog('list')).body[0]
  const addedStock = await backend.catalog('restock', { id: reservedStock.id, expectedVersion: reservedStock.version, operationId: randomUUID(), quantity: 2 })
  if (!addedStock.ok) throw new Error('No se pudo preparar la cuenta con cambios sin guardar.')
  await evaluate("document.getElementById('refresh-sales').click()")
  await waitFor("!" + stockCard + ".disabled")
  await clickCard(reservedStock.id)
  if (await evaluate("!!document.querySelector('#cancelled-accounts-toggle, [data-cancel-account], #cancel-current-account')")) throw new Error('La cuenta retomada todavia ofrece anular.')
  await evaluate("document.getElementById('clear-sale').click()")
  await waitFor("!document.querySelector('[data-sale-product]')")
  const remainingAccounts = (await backend.catalog('accounts')).body
  const stockAfterDiscard = (await backend.catalog('list')).body[0]
  if (remainingAccounts.length !== 1 || remainingAccounts[0].id !== pendingAccount.id || remainingAccounts[0].lines[0].quantity !== 1 || stockAfterDiscard.quantityRemaining !== 2 || stockAfterDiscard.quantitySold !== paidStock.quantitySold) throw new Error('Descartar cambios debe conservar la cuenta guardada y sus reservas.')
  const salesAfterDiscard = (await backend.catalog('sales', { page: 0 })).body.sales.map(sale => sale.id)
  if (JSON.stringify(salesBeforeDiscard) !== JSON.stringify(salesAfterDiscard)) throw new Error('Descartar cambios modifico el historial de ventas.')
  console.log('APPBARPOS_CATALOG_SMOKE=categories,required,create,presentation,edit,restock,cards,live-total,price-edit,history,checkout,open-accounts,discard-draft,persist,delete:OK')
}

module.exports = { runCatalogSmoke }
