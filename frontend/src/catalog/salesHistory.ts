import type { SaleReceipt, SalesHistory } from '../services/catalog'

export const HISTORY_PAGE_SIZE = 4
export const HISTORY_MAX_PAGES = 5

// The API returns batches of 20. Only the latest batch is shown in the interface.
export function visibleHistory(batch: SalesHistory, page: number): SalesHistory {
  const index = Math.max(0, Math.min(HISTORY_MAX_PAGES - 1, page))
  const offset = index * HISTORY_PAGE_SIZE
  return { sales: batch.sales.slice(offset, offset + HISTORY_PAGE_SIZE), page: index,
    hasNext: index < HISTORY_MAX_PAGES - 1 && batch.sales.length > offset + HISTORY_PAGE_SIZE }
}

export async function collectSales(fetchPage: (page: number) => Promise<SalesHistory>): Promise<SaleReceipt[]> {
  const sales = new Map<string, SaleReceipt>()
  for (let page = 0; ; page++) {
    const batch = await fetchPage(page)
    for (const sale of batch.sales) sales.set(sale.id, sale)
    if (!batch.hasNext) return [...sales.values()]
  }
}
