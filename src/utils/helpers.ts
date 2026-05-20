import { D1Database } from '@cloudflare/workers-types'

export interface ChangeLogEntry {
  project_id: number | null
  target_table: string
  target_record_id: number | null
  target_field: string
  before_value: string | null
  after_value: string | null
  change_reason?: string | null
  changed_by: number
  changed_by_name: string
  accounting_confirmation_status?: string
}

// 経理確認が必要なフィールド
const ACCOUNTING_FIELDS = [
  'order_amount',
  'sales_amount', 
  'planned_acceptance_month',
]

export async function recordChangeLog(db: D1Database, entry: ChangeLogEntry): Promise<void> {
  const needsAccounting = ACCOUNTING_FIELDS.includes(entry.target_field)
  const accountingStatus = needsAccounting ? 'pending' : (entry.accounting_confirmation_status ?? 'none')

  await db.prepare(`
    INSERT INTO change_logs (
      project_id, target_table, target_record_id, target_field,
      before_value, after_value, change_reason,
      changed_by, changed_by_name, accounting_confirmation_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    entry.project_id,
    entry.target_table,
    entry.target_record_id,
    entry.target_field,
    entry.before_value,
    entry.after_value,
    entry.change_reason ?? null,
    entry.changed_by,
    entry.changed_by_name,
    accountingStatus
  ).run()

  // 経理確認待ちフィールドが変更された場合はacceptancesテーブルも更新
  if (needsAccounting && entry.project_id) {
    await db.prepare(`
      UPDATE acceptances SET accounting_check_status = 'pending', updated_at = datetime('now')
      WHERE project_id = ?
    `).bind(entry.project_id).run()
  }
}

export async function recordMultipleChanges(
  db: D1Database,
  projectId: number | null,
  tableName: string,
  recordId: number,
  oldData: Record<string, any>,
  newData: Record<string, any>,
  changedBy: number,
  changedByName: string,
  changeReason?: string
): Promise<void> {
  for (const [field, newVal] of Object.entries(newData)) {
    const oldVal = oldData[field]
    const newValStr = newVal === null || newVal === undefined ? null : String(newVal)
    const oldValStr = oldVal === null || oldVal === undefined ? null : String(oldVal)
    
    if (oldValStr !== newValStr) {
      await recordChangeLog(db, {
        project_id: projectId,
        target_table: tableName,
        target_record_id: recordId,
        target_field: field,
        before_value: oldValStr,
        after_value: newValStr,
        change_reason: changeReason,
        changed_by: changedBy,
        changed_by_name: changedByName,
      })
    }
  }
}

export function generateSessionId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < 64; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

export function getCurrentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export function addMonths(dateStr: string, months: number): string {
  const [year, month] = dateStr.split('-').map(Number)
  const d = new Date(year, month - 1 + months, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function isBeforeCurrentMonth(monthStr: string): boolean {
  return monthStr < getCurrentMonth()
}
