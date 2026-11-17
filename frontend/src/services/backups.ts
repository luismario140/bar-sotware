import { unwrapReply } from './auth'

export interface BackupFile { filename: string; createdAt: string; sizeBytes: number; kind: 'manual' | 'pre-migration' | 'pre-restore' }
export interface RestoreSelection { id: string; filename: string; createdAt: string; expiresAt: string }
export type BackupOperation = 'list' | 'create' | 'openFolder' | 'export' | 'chooseRestore' | 'restore' | 'cancelRestore'

export async function backupRequest<T>(operation: BackupOperation, payload?: Record<string, string>): Promise<T> {
  if (!window.appbarpos) throw new Error('Los respaldos se administran desde la aplicación de escritorio.')
  return unwrapReply<T>(await window.appbarpos.backups(operation, payload))
}

export function backupUpdated() { window.dispatchEvent(new Event('appbarpos:backup-updated')) }
