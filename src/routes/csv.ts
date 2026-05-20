import { Hono } from 'hono'
import { authMiddleware } from '../middleware/auth'
import { recordChangeLog } from '../utils/helpers'

const csv = new Hono<{ Bindings: { DB: D1Database } }>()
csv.use('*', authMiddleware)

// CSVエクスポート：案件基本情報
csv.get('/export/projects', async (c) => {
  const db = c.env.DB
  const result = await db.prepare(`
    SELECT p.project_no, p.project_name, p.client_id, p.customer_name,
      u.display_name as owner_name, p.pj, p.status,
      p.is_progress_target, p.has_recurring_revenue, p.note,
      o.order_amount, o.sales_amount, o.estimated_profit_rate,
      o.has_purchase_order, o.has_development, o.estimate_url,
      a.planned_acceptance_month, a.acceptance_request_date, a.acceptance_status,
      a.accepted_date, a.planned_delivery_month, a.delivery_status, a.delivery_date,
      a.service_start_date, a.free_months, a.maintenance_start_date,
      a.acceptance_memo, a.acceptance_document_checked, a.invoice_sent_date,
      a.maintenance_fee_checked
    FROM projects p
    LEFT JOIN users u ON p.owner_user_id = u.id
    LEFT JOIN orders o ON o.project_id = p.id
    LEFT JOIN acceptances a ON a.project_id = p.id
    ORDER BY p.project_no
  `).all()

  const headers = [
    '案件番号','案件名','CLIENT_ID','顧客名','担当者','PJ','ステータス',
    '進行基準対象','月額売上あり','備考',
    '受注金額','売上額','見積時利益率','発注有無','開発有無','見積資料URL',
    '検収予定月','検収依頼日','検収ステータス','検収日',
    '納品予定月','納品ステータス','納品日',
    '利用開始日','無料期間(月)','保守費用発生月日',
    '検収メモ','検収書チェック','請求書送付日','保守費用チェック'
  ]

  const rows = (result.results as any[]).map(r => [
    r.project_no, r.project_name, r.client_id, r.customer_name,
    r.owner_name, r.pj, r.status,
    r.is_progress_target ? 'はい' : 'いいえ',
    r.has_recurring_revenue ? 'はい' : 'いいえ',
    r.note,
    r.order_amount, r.sales_amount, r.estimated_profit_rate,
    r.has_purchase_order ? 'あり' : 'なし',
    r.has_development ? 'あり' : 'なし',
    r.estimate_url,
    r.planned_acceptance_month, r.acceptance_request_date, r.acceptance_status, r.accepted_date,
    r.planned_delivery_month, r.delivery_status, r.delivery_date,
    r.service_start_date, r.free_months, r.maintenance_start_date,
    r.acceptance_memo, r.acceptance_document_checked ? '済' : '未', r.invoice_sent_date,
    r.maintenance_fee_checked ? '済' : '未'
  ])

  const csvContent = [headers, ...rows].map(row =>
    row.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')
  ).join('\n')

  c.header('Content-Type', 'text/csv; charset=utf-8')
  c.header('Content-Disposition', `attachment; filename="projects_${new Date().toISOString().split('T')[0]}.csv"`)
  return c.body('\uFEFF' + csvContent)
})

// CSVエクスポート：稼働計画（縦持ち）
csv.get('/export/work-plans', async (c) => {
  const db = c.env.DB
  const month = c.req.query('month')

  let sql = `
    SELECT p.project_no, p.project_name, wp.target_month, wp.pj,
      wp.assignee_name, wp.allocation_rate, wp.planned_amount, wp.planned_hours, wp.note
    FROM work_plans wp
    JOIN projects p ON wp.project_id = p.id
    WHERE 1=1
  `
  const params: any[] = []
  if (month) { sql += ` AND wp.target_month = ?`; params.push(month) }
  sql += ` ORDER BY p.project_no, wp.target_month, wp.pj`

  const result = await db.prepare(sql).bind(...params).all()

  const headers = ['案件番号','案件名','対象月','PJ','担当者','稼働割合(%)','稼働金額','予定工数','備考']
  const rows = (result.results as any[]).map(r => [
    r.project_no, r.project_name, r.target_month, r.pj,
    r.assignee_name, r.allocation_rate, r.planned_amount, r.planned_hours, r.note
  ])

  const csvContent = [headers, ...rows].map(row =>
    row.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')
  ).join('\n')

  c.header('Content-Type', 'text/csv; charset=utf-8')
  c.header('Content-Disposition', `attachment; filename="work_plans_${new Date().toISOString().split('T')[0]}.csv"`)
  return c.body('\uFEFF' + csvContent)
})

// CSVエクスポート：進行基準月次
csv.get('/export/progress-monthlies', async (c) => {
  const db = c.env.DB
  const month = c.req.query('month')

  let sql = `
    SELECT p.project_no, p.project_name, psp.progress_no,
      pm.target_month, pm.progress_rate,
      pm.partner_reported_progress_rate, pm.internal_judged_progress_rate,
      pm.monthly_sales, pm.cumulative_sales, pm.artifact_url,
      pm.judgment_basis, pm.input_user_name, pm.input_date,
      pm.approver_name, pm.approved_date, pm.status, pm.note
    FROM progress_monthlies pm
    JOIN progress_standard_projects psp ON pm.progress_standard_project_id = psp.id
    JOIN projects p ON psp.project_id = p.id
    WHERE psp.is_target = 1
  `
  const params: any[] = []
  if (month) { sql += ` AND pm.target_month = ?`; params.push(month) }
  sql += ` ORDER BY p.project_no, pm.target_month`

  const result = await db.prepare(sql).bind(...params).all()

  const headers = [
    '案件番号','案件名','進行基準番号','対象月','進捗率(%)',
    'パートナー申告進捗率(%)','社内判断進捗率(%)','当月売上','累計売上',
    '成果物URL','進捗率判断根拠','入力者','入力日','承認者','承認日','ステータス','備考'
  ]
  const rows = (result.results as any[]).map(r => [
    r.project_no, r.project_name, r.progress_no, r.target_month, r.progress_rate,
    r.partner_reported_progress_rate, r.internal_judged_progress_rate,
    r.monthly_sales, r.cumulative_sales, r.artifact_url,
    r.judgment_basis, r.input_user_name, r.input_date,
    r.approver_name, r.approved_date, r.status, r.note
  ])

  const csvContent = [headers, ...rows].map(row =>
    row.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')
  ).join('\n')

  c.header('Content-Type', 'text/csv; charset=utf-8')
  c.header('Content-Disposition', `attachment; filename="progress_monthlies_${new Date().toISOString().split('T')[0]}.csv"`)
  return c.body('\uFEFF' + csvContent)
})

// CSVエクスポート：変更履歴
csv.get('/export/change-logs', async (c) => {
  const db = c.env.DB
  const result = await db.prepare(`
    SELECT cl.changed_at, cl.changed_by_name, p.project_no, p.project_name,
      cl.target_table, cl.target_field, cl.before_value, cl.after_value,
      cl.change_reason, cl.accounting_confirmation_status, cl.accounting_confirmed_by_name, cl.accounting_confirmed_at
    FROM change_logs cl
    LEFT JOIN projects p ON cl.project_id = p.id
    ORDER BY cl.changed_at DESC
  `).all()

  const headers = ['変更日時','変更者','案件番号','案件名','対象テーブル','対象フィールド','変更前','変更後','変更理由','経理確認状態','経理確認者','経理確認日時']
  const rows = (result.results as any[]).map(r => [
    r.changed_at, r.changed_by_name, r.project_no, r.project_name,
    r.target_table, r.target_field, r.before_value, r.after_value,
    r.change_reason, r.accounting_confirmation_status, r.accounting_confirmed_by_name, r.accounting_confirmed_at
  ])

  const csvContent = [headers, ...rows].map(row =>
    row.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')
  ).join('\n')

  c.header('Content-Type', 'text/csv; charset=utf-8')
  c.header('Content-Disposition', `attachment; filename="change_logs_${new Date().toISOString().split('T')[0]}.csv"`)
  return c.body('\uFEFF' + csvContent)
})

// CSVテンプレートダウンロード
csv.get('/template/:type', async (c) => {
  const type = c.req.param('type')
  
  const templates: Record<string, { headers: string[], filename: string, example?: string[] }> = {
    projects: {
      filename: 'template_projects.csv',
      headers: ['案件番号','案件名','CLIENT_ID','顧客名','担当者名','PJ','ステータス','受注金額','売上額','見積時利益率','発注有無(1/0)','開発有無(1/0)','見積資料URL','備考'],
      example: ['D10','サンプル案件','C010','サンプル株式会社','担当者名','EP-SE','active','1000000','1000000','40','1','1','','']
    },
    work_plans: {
      filename: 'template_work_plans.csv',
      headers: ['案件番号','対象月(YYYY-MM)','PJ','担当者名','稼働割合(0-100)','稼働金額','予定工数','備考'],
      example: ['D1','2026-06','EP-SE','小林 太郎','50','900000','80','設計作業']
    },
    progress_monthlies: {
      filename: 'template_progress_monthlies.csv',
      headers: ['案件番号','対象月(YYYY-MM)','進捗率(0-100)','パートナー申告進捗率','社内判断進捗率','当月売上','成果物URL','進捗率判断根拠','備考'],
      example: ['S0111','2026-06','40','40','40','1200000','https://...','設計完了','']
    },
    acceptances: {
      filename: 'template_acceptances.csv',
      headers: ['案件番号','検収予定月(YYYY-MM)','検収依頼日(YYYY-MM-DD)','検収日(YYYY-MM-DD)','納品予定月(YYYY-MM)','納品日(YYYY-MM-DD)','利用開始日(YYYY-MM-DD)','無料期間(月)','保守費用発生月日(YYYY-MM-DD)','検収メモ','請求書送付日(YYYY-MM-DD)','備考'],
      example: ['D1','2026-06','2026-05-15','','2026-06','','','0','','','','']
    },
  }

  const template = templates[type]
  if (!template) return c.json({ error: 'テンプレートが見つかりません' }, 404)

  const rows = [template.headers]
  if (template.example) rows.push(template.example)

  const csvContent = rows.map(row =>
    row.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')
  ).join('\n')

  c.header('Content-Type', 'text/csv; charset=utf-8')
  c.header('Content-Disposition', `attachment; filename="${template.filename}"`)
  return c.body('\uFEFF' + csvContent)
})

// CSVインポート：案件基本情報
csv.post('/import/projects', async (c) => {
  const db = c.env.DB
  const user = c.get('user')

  if (user.role !== 'admin' && user.role !== 'member') {
    return c.json({ error: '権限がありません' }, 403)
  }

  const formData = await c.req.formData()
  const file = formData.get('file') as File
  const preview = formData.get('preview') === 'true'

  if (!file) return c.json({ error: 'ファイルが必要です' }, 400)

  const text = await file.text()
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim())
  
  if (lines.length < 2) return c.json({ error: 'データがありません' }, 400)

  const headers = parseCSVLine(lines[0])
  const results: any[] = []
  let created = 0, updated = 0, errors = 0

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i])
    if (values.length === 0) continue

    const row: Record<string, string> = {}
    headers.forEach((h, idx) => { row[h] = values[idx] ?? '' })

    const projectNo = row['案件番号']?.trim()
    if (!projectNo) {
      results.push({ row: i + 1, status: 'error', message: '案件番号が空です', data: row })
      errors++
      continue
    }

    const existing = await db.prepare('SELECT * FROM projects WHERE project_no = ?').bind(projectNo).first<any>()

    const projectData: any = {}
    if (row['案件名']) projectData.project_name = row['案件名']
    if (row['CLIENT_ID']) projectData.client_id = row['CLIENT_ID'] === '__CLEAR__' ? null : row['CLIENT_ID']
    if (row['顧客名']) projectData.customer_name = row['顧客名']
    if (row['PJ']) projectData.pj = row['PJ']
    if (row['ステータス']) projectData.status = row['ステータス']
    if (row['備考']) projectData.note = row['備考'] === '__CLEAR__' ? null : row['備考']

    if (existing) {
      if (!preview) {
        await db.prepare(`
          UPDATE projects SET
            project_name = COALESCE(NULLIF(?, ''), project_name),
            client_id = CASE WHEN ? = '__CLEAR__' THEN NULL WHEN ? = '' THEN client_id ELSE ? END,
            customer_name = COALESCE(NULLIF(?, ''), customer_name),
            pj = COALESCE(NULLIF(?, ''), pj),
            status = COALESCE(NULLIF(?, ''), status),
            note = CASE WHEN ? = '__CLEAR__' THEN NULL WHEN ? = '' THEN note ELSE ? END,
            updated_at = datetime('now')
          WHERE project_no = ?
        `).bind(
          projectData.project_name || '', 
          row['CLIENT_ID'] || '', row['CLIENT_ID'] || '', row['CLIENT_ID'] || '',
          projectData.customer_name || '',
          projectData.pj || '',
          projectData.status || '',
          row['備考'] || '', row['備考'] || '', row['備考'] || '',
          projectNo
        ).run()
      }
      results.push({ row: i + 1, status: 'updated', project_no: projectNo, data: projectData })
      updated++
    } else {
      if (!row['案件名']?.trim()) {
        results.push({ row: i + 1, status: 'error', message: '案件名が必要です（新規登録）', data: row })
        errors++
        continue
      }
      if (!preview) {
        const insertResult = await db.prepare(`
          INSERT INTO projects (project_no, project_name, client_id, customer_name, pj, status, note)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).bind(
          projectNo,
          projectData.project_name,
          projectData.client_id || null,
          projectData.customer_name || null,
          projectData.pj || null,
          projectData.status || 'active',
          projectData.note || null
        ).run()
        const newId = insertResult.meta.last_row_id
        await db.prepare('INSERT INTO orders (project_id) VALUES (?)').bind(newId).run()
        await db.prepare('INSERT INTO acceptances (project_id) VALUES (?)').bind(newId).run()
        await db.prepare('INSERT INTO recurring_revenues (project_id) VALUES (?)').bind(newId).run()
      }
      results.push({ row: i + 1, status: 'created', project_no: projectNo, data: projectData })
      created++
    }
  }

  if (!preview) {
    await db.prepare(`
      INSERT INTO csv_import_histories (import_type, file_name, imported_by, imported_by_name, total_rows, created_count, updated_count, error_count)
      VALUES ('projects', ?, ?, ?, ?, ?, ?, ?)
    `).bind(file.name, user.id, user.display_name, lines.length - 1, created, updated, errors).run()
  }

  return c.json({
    preview,
    total: lines.length - 1,
    created,
    updated,
    errors,
    warnings: 0,
    results: results.slice(0, 100),
  })
})

// CSVインポート：稼働計画
csv.post('/import/work-plans', async (c) => {
  const db = c.env.DB
  const user = c.get('user')

  if (user.role === 'viewer') return c.json({ error: '権限がありません' }, 403)

  const formData = await c.req.formData()
  const file = formData.get('file') as File
  const preview = formData.get('preview') === 'true'

  if (!file) return c.json({ error: 'ファイルが必要です' }, 400)

  const text = await file.text()
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim())
  
  if (lines.length < 2) return c.json({ error: 'データがありません' }, 400)

  const headers = parseCSVLine(lines[0])
  let created = 0, updated = 0, errors = 0
  const results: any[] = []

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i])
    if (values.length === 0) continue

    const row: Record<string, string> = {}
    headers.forEach((h, idx) => { row[h] = values[idx] ?? '' })

    const projectNo = row['案件番号']?.trim()
    const targetMonth = row['対象月(YYYY-MM)']?.trim() || row['対象月']?.trim()

    if (!projectNo || !targetMonth) {
      results.push({ row: i + 1, status: 'error', message: '案件番号と対象月は必須です' })
      errors++
      continue
    }

    const project = await db.prepare('SELECT id FROM projects WHERE project_no = ?').bind(projectNo).first<any>()
    if (!project) {
      results.push({ row: i + 1, status: 'error', message: `案件番号 ${projectNo} が見つかりません` })
      errors++
      continue
    }

    const allocationRate = row['稼働割合(0-100)'] ? Number(row['稼働割合(0-100)']) : null
    const assigneeName = row['担当者名']?.trim() || null
    const pj = row['PJ']?.trim() || null

    if (!preview) {
      const existing = await db.prepare(
        'SELECT id FROM work_plans WHERE project_id = ? AND target_month = ? AND pj = ? AND assignee_name = ?'
      ).bind(project.id, targetMonth, pj, assigneeName).first<any>()

      if (existing) {
        await db.prepare(`
          UPDATE work_plans SET
            allocation_rate = ?, planned_amount = ?, planned_hours = ?, note = ?, updated_at = datetime('now')
          WHERE id = ?
        `).bind(
          allocationRate,
          row['稼働金額'] ? Number(row['稼働金額']) : null,
          row['予定工数'] ? Number(row['予定工数']) : null,
          row['備考'] || null,
          existing.id
        ).run()
        updated++
      } else {
        await db.prepare(`
          INSERT INTO work_plans (project_id, target_month, pj, assignee_name, allocation_rate, planned_amount, planned_hours, note)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          project.id, targetMonth, pj, assigneeName, allocationRate,
          row['稼働金額'] ? Number(row['稼働金額']) : null,
          row['予定工数'] ? Number(row['予定工数']) : null,
          row['備考'] || null
        ).run()
        created++
      }
    } else {
      created++
    }

    results.push({ row: i + 1, status: 'ok', project_no: projectNo, target_month: targetMonth })
  }

  if (!preview) {
    await db.prepare(`
      INSERT INTO csv_import_histories (import_type, file_name, imported_by, imported_by_name, total_rows, created_count, updated_count, error_count)
      VALUES ('work_plans', ?, ?, ?, ?, ?, ?, ?)
    `).bind(file.name, user.id, user.display_name, lines.length - 1, created, updated, errors).run()
  }

  return c.json({ preview, total: lines.length - 1, created, updated, errors, warnings: 0, results: results.slice(0, 100) })
})

// インポート履歴
csv.get('/import-histories', async (c) => {
  const db = c.env.DB
  const result = await db.prepare(
    'SELECT * FROM csv_import_histories ORDER BY imported_at DESC LIMIT 100'
  ).all()
  return c.json(result.results)
})

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += char
    }
  }
  result.push(current)
  return result
}

export default csv
