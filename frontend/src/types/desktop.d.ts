import type { AppInfo, SystemHealth } from '../services/system'
import type { AuthOperation, ApiReply } from '../services/auth'
import type { CatalogOperation } from '../services/catalog'
import type { BackupOperation } from '../services/backups'

declare global {
  interface Window {
    appbarpos?: {
      health: () => Promise<SystemHealth>
      appInfo: () => Promise<AppInfo>
      auth: (operation: AuthOperation, payload?: Record<string, string>) => Promise<ApiReply>
      catalog: (operation: CatalogOperation, payload?: Record<string, unknown>) => Promise<ApiReply>
      backups: (operation: BackupOperation, payload?: Record<string, string>) => Promise<ApiReply>
    }
  }
}
