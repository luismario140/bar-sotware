import type { SystemHealth } from '../services/system'
import type { AuthOperation, ApiReply } from '../services/auth'
import type { CatalogOperation } from '../services/catalog'

declare global {
  interface Window {
    appbarpos?: {
      health: () => Promise<SystemHealth>
      auth: (operation: AuthOperation, payload?: Record<string, string>) => Promise<ApiReply>
      catalog: (operation: CatalogOperation, payload?: Record<string, unknown>) => Promise<ApiReply>
    }
  }
}
