/**
 * Migration utilities for localStorage to IndexedDB migration
 *
 * Provides safe migration with:
 * - Automatic detection of existing localStorage data
 * - Bulk migration to IndexedDB
 * - Backup retention for 30 days
 * - Migration status tracking
 */

import { ActivityDatabase, getActivityDatabase } from './ActivityDatabase'
import type { ActivityLogEntry } from './types'

// Storage keys
const STORAGE_KEY = 'monmouth_activity_log'
const MIGRATION_FLAG_KEY = 'monmouth_activity_log_migrated'
const BACKUP_KEY = 'monmouth_activity_log_backup'
const BACKUP_TIMESTAMP_KEY = 'monmouth_activity_log_backup_timestamp'

// Backup retention period (30 days in milliseconds)
const BACKUP_RETENTION_MS = 30 * 24 * 60 * 60 * 1000

/**
 * Migration result
 */
export interface MigrationResult {
  success: boolean
  migratedCount: number
  error?: string
  alreadyMigrated?: boolean
}

/**
 * JSON serialization helpers for BigInt (matching ActivityLog.ts)
 */
function jsonReviver(_key: string, value: unknown): unknown {
  if (
    value &&
    typeof value === 'object' &&
    '__type' in value &&
    (value as Record<string, unknown>).__type === 'bigint'
  ) {
    return BigInt((value as Record<string, string>).value)
  }
  return value
}

/**
 * Check if migration has already been completed
 */
export function isMigrationComplete(): boolean {
  if (typeof localStorage === 'undefined') return true

  return localStorage.getItem(MIGRATION_FLAG_KEY) === 'true'
}

/**
 * Check if there is localStorage data to migrate
 */
export function hasLocalStorageData(): boolean {
  if (typeof localStorage === 'undefined') return false

  const stored = localStorage.getItem(STORAGE_KEY)
  if (!stored) return false

  try {
    const data = JSON.parse(stored, jsonReviver)
    return Array.isArray(data.entries) && data.entries.length > 0
  } catch {
    return false
  }
}

/**
 * Get the count of entries in localStorage
 */
export function getLocalStorageEntryCount(): number {
  if (typeof localStorage === 'undefined') return 0

  const stored = localStorage.getItem(STORAGE_KEY)
  if (!stored) return 0

  try {
    const data = JSON.parse(stored, jsonReviver)
    return Array.isArray(data.entries) ? data.entries.length : 0
  } catch {
    return 0
  }
}

/**
 * Migrate data from localStorage to IndexedDB
 *
 * @param db - Optional ActivityDatabase instance (uses default if not provided)
 * @param force - If true, re-run migration even if already completed
 * @returns Migration result with success status and migrated count
 */
export async function migrateToIndexedDB(
  db?: ActivityDatabase,
  force: boolean = false
): Promise<MigrationResult> {
  // Check if we're in a browser environment
  if (typeof localStorage === 'undefined' || typeof indexedDB === 'undefined') {
    return {
      success: true,
      migratedCount: 0,
      alreadyMigrated: true,
    }
  }

  // Check if migration has already been completed
  if (!force && isMigrationComplete()) {
    return {
      success: true,
      migratedCount: 0,
      alreadyMigrated: true,
    }
  }

  // Check if there's data to migrate
  const stored = localStorage.getItem(STORAGE_KEY)
  if (!stored) {
    // No data to migrate, mark as complete
    localStorage.setItem(MIGRATION_FLAG_KEY, 'true')
    return {
      success: true,
      migratedCount: 0,
      alreadyMigrated: false,
    }
  }

  try {
    // Parse the localStorage data
    const data = JSON.parse(stored, jsonReviver)
    const entries: ActivityLogEntry[] = data.entries ?? []

    if (entries.length === 0) {
      localStorage.setItem(MIGRATION_FLAG_KEY, 'true')
      return {
        success: true,
        migratedCount: 0,
        alreadyMigrated: false,
      }
    }

    // Get or create database instance
    const database = db ?? getActivityDatabase()

    // Create backup before migration
    localStorage.setItem(BACKUP_KEY, stored)
    localStorage.setItem(BACKUP_TIMESTAMP_KEY, Date.now().toString())

    // Prepare entries for bulk insert (remove IDs to let IndexedDB assign new ones)
    const entriesToMigrate = entries.map((entry) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id, ...rest } = entry
      return {
        ...rest,
        syncStatus: entry.syncStatus ?? 'pending',
        version: entry.version ?? 1,
      }
    })

    // Bulk insert into IndexedDB
    await database.bulkLog(entriesToMigrate as Omit<ActivityLogEntry, 'id'>[])

    // Mark migration as complete
    localStorage.setItem(MIGRATION_FLAG_KEY, 'true')

    // Remove original data (backup is kept)
    localStorage.removeItem(STORAGE_KEY)

    return {
      success: true,
      migratedCount: entries.length,
      alreadyMigrated: false,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error during migration'
    console.error('Migration to IndexedDB failed:', error)

    return {
      success: false,
      migratedCount: 0,
      error: errorMessage,
    }
  }
}

/**
 * Restore data from backup to localStorage (rollback)
 *
 * @returns true if rollback was successful
 */
export function rollbackMigration(): boolean {
  if (typeof localStorage === 'undefined') return false

  const backup = localStorage.getItem(BACKUP_KEY)
  if (!backup) return false

  try {
    // Restore the backup
    localStorage.setItem(STORAGE_KEY, backup)

    // Remove migration flag
    localStorage.removeItem(MIGRATION_FLAG_KEY)

    return true
  } catch (error) {
    console.error('Rollback failed:', error)
    return false
  }
}

/**
 * Clean up old backups (older than 30 days)
 */
export function cleanupOldBackups(): void {
  if (typeof localStorage === 'undefined') return

  const timestampStr = localStorage.getItem(BACKUP_TIMESTAMP_KEY)
  if (!timestampStr) return

  try {
    const timestamp = parseInt(timestampStr, 10)
    const age = Date.now() - timestamp

    if (age > BACKUP_RETENTION_MS) {
      localStorage.removeItem(BACKUP_KEY)
      localStorage.removeItem(BACKUP_TIMESTAMP_KEY)
    }
  } catch {
    // Ignore parsing errors
  }
}

/**
 * Get backup information
 */
export function getBackupInfo(): { exists: boolean; timestamp?: number; entryCount?: number } {
  if (typeof localStorage === 'undefined') {
    return { exists: false }
  }

  const backup = localStorage.getItem(BACKUP_KEY)
  if (!backup) {
    return { exists: false }
  }

  try {
    const data = JSON.parse(backup, jsonReviver)
    const timestampStr = localStorage.getItem(BACKUP_TIMESTAMP_KEY)
    const timestamp = timestampStr ? parseInt(timestampStr, 10) : undefined

    return {
      exists: true,
      timestamp,
      entryCount: Array.isArray(data.entries) ? data.entries.length : 0,
    }
  } catch {
    return { exists: true }
  }
}

/**
 * Force clear migration status (for testing or manual reset)
 */
export function clearMigrationStatus(): void {
  if (typeof localStorage === 'undefined') return

  localStorage.removeItem(MIGRATION_FLAG_KEY)
}

/**
 * Delete the backup
 */
export function deleteBackup(): void {
  if (typeof localStorage === 'undefined') return

  localStorage.removeItem(BACKUP_KEY)
  localStorage.removeItem(BACKUP_TIMESTAMP_KEY)
}

/**
 * Auto-migrate on module load if conditions are met
 * This is a convenience function that can be called during app initialization
 */
export async function autoMigrate(db?: ActivityDatabase): Promise<MigrationResult | null> {
  // Only migrate if:
  // 1. We're in a browser environment
  // 2. Migration hasn't been completed
  // 3. There's data to migrate
  if (typeof localStorage === 'undefined' || typeof indexedDB === 'undefined') {
    return null
  }

  if (isMigrationComplete()) {
    // Clean up old backups during initialization
    cleanupOldBackups()
    return null
  }

  if (!hasLocalStorageData()) {
    // Mark as complete since there's no data
    localStorage.setItem(MIGRATION_FLAG_KEY, 'true')
    return null
  }

  return migrateToIndexedDB(db)
}
