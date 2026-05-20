import { Hono } from 'hono'
import { authMiddleware } from '../middleware/auth'
import { recordMultipleChanges } from '../utils/helpers'

const projects = new Hono<{ Bindings: { DB: D1Database } }>()

projects.use('*', authMiddleware)

// 案件一覧取得
projects.get('/', async (c) => {
  const db = c.env.DB
  const user = c.get('user')
  const q = c.req.query()

  let sql = `
    SELECT p.*, 
      u.display_name as owner_name,
      o.order_amount, o.sales_amount, o.estimated_profit_rate, o.has_purchase_order, o.has_development,
      a.planned_acceptance_month, a.acceptance_status, a.accepted_date,
      a.planned_delivery_month, a.delivery_status, a.delivery_date,
      a.accounting_check_status,
      (SELECT COUNT(*) FROM change_logs cl WHERE cl.project_id = p.id AND cl.accounting_confirmation_status = 'pending') as pending_changes
    FROM projects p
    LEFT JOIN users u ON p.owner_user_id = u.id
    LEFT JOIN orders o ON o.project_id = p.id
    LEFT JOIN acceptances a ON a.project_id = p.id
    WHERE 1=1
  `
  const params: any[] = []

  if (user.role === 'member') {
    sql += ` AND p.owner_user_id = ?`
    params.push(user.id)
  }

  if (q.project_no) { sql += ` AND p.project_no LIKE ?`; params.push(`%${q.project_no}%`) }
  if (q.project_name) { sql += ` AND p.project_name LIKE ?`; params.push(`%${q.project_name}%`) }
  if (q.client_id) { sql += ` AND p.client_id LIKE ?`; params.push(`%${q.client_id}%`) }
  if (q.customer_name) { sql += ` AND p.customer_name LIKE ?`; params.push(`%${q.customer_name}%`) }
  if (q.owner_user_id) { sql += ` AND p.owner_user_id = ?`; params.push(q.owner_user_id) }
  if (q.status) { sql += ` AND p.status = ?`; params.push(q.status) }
  if (q.planned_acceptance_month) { sql += ` AND a.planned_acceptance_month = ?`; params.push(q.planned_acceptance_month) }
  if (q.is_progress_target === '1') { sql += ` AND p.is_progress_target = 1` }
  if (q.has_recurring_revenue === '1') { sql += ` AND p.has_recurring_revenue = 1` }
  if (q.accounting_pending === '1') { sql += ` AND a.accounting_check_status = 'pending'` }
  if (q.acceptance_undone === '1') { sql += ` AND (a.acceptance_status IS NULL OR a.acceptance_status != 'done')` }
  if (q.acceptance_done === '1') { sql += ` AND a.acceptance_status = 'done'` }

  sql += ` ORDER BY p.project_no ASC`

  const result = await db.prepare(sql).bind(...params).all()
  return c.json(result.results)
})

// 案件詳細取得
projects.get('/:id', async (c) => {
  const db = c.env.DB
  const id = c.req.param('id')

  const project = await db.prepare(`
    SELECT p.*, u.display_name as owner_name
    FROM projects p
    LEFT JOIN users u ON p.owner_user_id = u.id
    WHERE p.id = ?
  `).bind(id).first()

  if (!project) return c.json({ error: '案件が見つかりません' }, 404)

  const order = await db.prepare('SELECT * FROM orders WHERE project_id = ?').bind(id).first()
  const acceptance = await db.prepare('SELECT * FROM acceptances WHERE project_id = ?').bind(id).first()
  const workPlans = await db.prepare('SELECT * FROM work_plans WHERE project_id = ? ORDER BY target_month, pj, assignee_name').bind(id).all()
  const progressProject = await db.prepare('SELECT * FROM progress_standard_projects WHERE project_id = ?').bind(id).first()
  const recurringRevenue = await db.prepare('SELECT * FROM recurring_revenues WHERE project_id = ?').bind(id).first()
  const changeLogs = await db.prepare(`
    SELECT * FROM change_logs WHERE project_id = ? ORDER BY changed_at DESC LIMIT 100
  `).bind(id).all()

  let progressMonthlies: any[] = []
  if (progressProject) {
    const pm = await db.prepare(
      'SELECT * FROM progress_monthlies WHERE progress_standard_project_id = ? ORDER BY target_month'
    ).bind((progressProject as any).id).all()
    progressMonthlies = pm.results
  }

  return c.json({
    project,
    order,
    acceptance,
    work_plans: workPlans.results,
    progress_project: progressProject,
    progress_monthlies: progressMonthlies,
    recurring_revenue: recurringRevenue,
    change_logs: changeLogs.results,
  })
})

// 案件新規作成
projects.post('/', async (c) => {
  const db = c.env.DB
  const user = c.get('user')
  
  if (user.role === 'viewer') return c.json({ error: 'Forbidden' }, 403)

  const body = await c.req.json()
  const { project_no, project_name, client_id, customer_name, owner_user_id, pj, status, note } = body

  if (!project_no || !project_name) {
    return c.json({ error: '案件番号と案件名は必須です' }, 400)
  }

  // 案件番号の重複チェック
  const existing = await db.prepare('SELECT id FROM projects WHERE project_no = ?').bind(project_no).first()
  if (existing) return c.json({ error: '案件番号が既に存在します' }, 409)

  const result = await db.prepare(`
    INSERT INTO projects (project_no, project_name, client_id, customer_name, owner_user_id, pj, status, note)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    project_no, project_name,
    client_id || null, customer_name || null,
    owner_user_id || user.id,
    pj || null,
    status || 'active',
    note || null
  ).run()

  const newId = result.meta.last_row_id

  // orders / acceptances / recurring_revenues レコードを初期化
  await db.prepare('INSERT INTO orders (project_id) VALUES (?)').bind(newId).run()
  await db.prepare('INSERT INTO acceptances (project_id) VALUES (?)').bind(newId).run()
  await db.prepare('INSERT INTO recurring_revenues (project_id) VALUES (?)').bind(newId).run()

  return c.json({ id: newId, message: '案件を登録しました' }, 201)
})

// 案件基本情報更新
projects.put('/:id', async (c) => {
  const db = c.env.DB
  const user = c.get('user')
  const id = Number(c.req.param('id'))

  const existing = await db.prepare('SELECT * FROM projects WHERE id = ?').bind(id).first<any>()
  if (!existing) return c.json({ error: '案件が見つかりません' }, 404)

  if (user.role === 'viewer') return c.json({ error: 'Forbidden' }, 403)
  if (user.role === 'member' && existing.owner_user_id !== user.id) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  const body = await c.req.json()
  const { project_name, client_id, customer_name, owner_user_id, pj, status, is_progress_target, has_recurring_revenue, recurring_revenue_memo, note } = body

  const trackFields = { project_name, client_id, customer_name, owner_user_id, pj, status, is_progress_target, has_recurring_revenue, recurring_revenue_memo, note }
  await recordMultipleChanges(db, id, 'projects', id, existing, trackFields, user.id, user.display_name)

  await db.prepare(`
    UPDATE projects SET
      project_name = ?, client_id = ?, customer_name = ?, owner_user_id = ?,
      pj = ?, status = ?, is_progress_target = ?, has_recurring_revenue = ?,
      recurring_revenue_memo = ?, note = ?, updated_at = datetime('now')
    WHERE id = ?
  `).bind(
    project_name ?? existing.project_name,
    client_id ?? existing.client_id,
    customer_name ?? existing.customer_name,
    owner_user_id ?? existing.owner_user_id,
    pj ?? existing.pj,
    status ?? existing.status,
    is_progress_target !== undefined ? is_progress_target : existing.is_progress_target,
    has_recurring_revenue !== undefined ? has_recurring_revenue : existing.has_recurring_revenue,
    recurring_revenue_memo ?? existing.recurring_revenue_memo,
    note ?? existing.note,
    id
  ).run()

  return c.json({ message: '更新しました' })
})

// 受注情報更新
projects.put('/:id/order', async (c) => {
  const db = c.env.DB
  const user = c.get('user')
  const id = Number(c.req.param('id'))

  const proj = await db.prepare('SELECT owner_user_id FROM projects WHERE id = ?').bind(id).first<any>()
  if (!proj) return c.json({ error: '案件が見つかりません' }, 404)
  if (user.role === 'viewer') return c.json({ error: 'Forbidden' }, 403)
  if (user.role === 'member' && proj.owner_user_id !== user.id) return c.json({ error: 'Forbidden' }, 403)

  const existing = await db.prepare('SELECT * FROM orders WHERE project_id = ?').bind(id).first<any>()
  const body = await c.req.json()

  const trackFields = {
    order_amount: body.order_amount,
    sales_amount: body.sales_amount,
    estimated_profit_rate: body.estimated_profit_rate,
    has_purchase_order: body.has_purchase_order,
    has_development: body.has_development,
    estimate_url: body.estimate_url,
  }
  if (existing) {
    await recordMultipleChanges(db, id, 'orders', existing.id, existing, trackFields, user.id, user.display_name)
    await db.prepare(`
      UPDATE orders SET
        order_amount = ?, sales_amount = ?, estimated_profit_rate = ?,
        has_purchase_order = ?, has_development = ?, estimate_url = ?,
        updated_at = datetime('now')
      WHERE project_id = ?
    `).bind(
      body.order_amount ?? existing.order_amount,
      body.sales_amount ?? existing.sales_amount,
      body.estimated_profit_rate ?? existing.estimated_profit_rate,
      body.has_purchase_order !== undefined ? body.has_purchase_order : existing.has_purchase_order,
      body.has_development !== undefined ? body.has_development : existing.has_development,
      body.estimate_url ?? existing.estimate_url,
      id
    ).run()
  }

  return c.json({ message: '受注情報を更新しました' })
})

// 検収情報更新
projects.put('/:id/acceptance', async (c) => {
  const db = c.env.DB
  const user = c.get('user')
  const id = Number(c.req.param('id'))

  const proj = await db.prepare('SELECT owner_user_id FROM projects WHERE id = ?').bind(id).first<any>()
  if (!proj) return c.json({ error: '案件が見つかりません' }, 404)
  if (user.role === 'viewer') return c.json({ error: 'Forbidden' }, 403)
  if (user.role === 'member' && proj.owner_user_id !== user.id) return c.json({ error: 'Forbidden' }, 403)

  const existing = await db.prepare('SELECT * FROM acceptances WHERE project_id = ?').bind(id).first<any>()
  const body = await c.req.json()

  // 自動ステータス更新
  let acceptanceStatus = body.acceptance_status ?? existing?.acceptance_status
  if (body.accepted_date) acceptanceStatus = 'done'

  let deliveryStatus = body.delivery_status ?? existing?.delivery_status
  if (body.delivery_date) deliveryStatus = 'done'

  // 保守費用発生月日の自動計算
  let maintenanceStartDate = body.maintenance_start_date ?? existing?.maintenance_start_date
  if (body.service_start_date && body.free_months !== undefined && body.free_months !== null && !body.maintenance_start_date) {
    const [y, m] = (body.service_start_date as string).split('-').map(Number)
    const freeMonths = Number(body.free_months)
    const d = new Date(y, m - 1 + freeMonths, 1)
    maintenanceStartDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
  }

  const trackFields = {
    planned_acceptance_month: body.planned_acceptance_month,
    acceptance_request_date: body.acceptance_request_date,
    acceptance_status: acceptanceStatus,
    accepted_date: body.accepted_date,
    planned_delivery_month: body.planned_delivery_month,
    delivery_status: deliveryStatus,
    delivery_date: body.delivery_date,
    service_start_date: body.service_start_date,
    free_months: body.free_months,
    maintenance_start_date: maintenanceStartDate,
    invoice_sent_date: body.invoice_sent_date,
    maintenance_fee_checked: body.maintenance_fee_checked,
    acceptance_document_checked: body.acceptance_document_checked,
    acceptance_memo: body.acceptance_memo,
  }

  if (existing) {
    await recordMultipleChanges(db, id, 'acceptances', existing.id, existing, trackFields, user.id, user.display_name)
    await db.prepare(`
      UPDATE acceptances SET
        planned_acceptance_month = ?, acceptance_request_date = ?, acceptance_status = ?,
        accepted_date = ?, planned_delivery_month = ?, delivery_status = ?, delivery_date = ?,
        service_start_date = ?, free_months = ?, maintenance_start_date = ?,
        acceptance_memo = ?, acceptance_document_checked = ?, invoice_sent_date = ?,
        maintenance_fee_checked = ?, updated_at = datetime('now')
      WHERE project_id = ?
    `).bind(
      body.planned_acceptance_month ?? existing.planned_acceptance_month,
      body.acceptance_request_date ?? existing.acceptance_request_date,
      acceptanceStatus,
      body.accepted_date ?? existing.accepted_date,
      body.planned_delivery_month ?? existing.planned_delivery_month,
      deliveryStatus,
      body.delivery_date ?? existing.delivery_date,
      body.service_start_date ?? existing.service_start_date,
      body.free_months !== undefined ? body.free_months : existing.free_months,
      maintenanceStartDate,
      body.acceptance_memo ?? existing.acceptance_memo,
      body.acceptance_document_checked !== undefined ? body.acceptance_document_checked : existing.acceptance_document_checked,
      body.invoice_sent_date ?? existing.invoice_sent_date,
      body.maintenance_fee_checked !== undefined ? body.maintenance_fee_checked : existing.maintenance_fee_checked,
      id
    ).run()
  }

  return c.json({ message: '検収情報を更新しました' })
})

// 月額売上情報更新
projects.put('/:id/recurring', async (c) => {
  const db = c.env.DB
  const user = c.get('user')
  const id = Number(c.req.param('id'))

  if (user.role === 'viewer') return c.json({ error: 'Forbidden' }, 403)

  const existing = await db.prepare('SELECT * FROM recurring_revenues WHERE project_id = ?').bind(id).first<any>()
  const body = await c.req.json()

  if (existing) {
    await db.prepare(`
      UPDATE recurring_revenues SET
        has_recurring_revenue = ?, recurring_type = ?, monthly_amount = ?,
        billing_start_month = ?, revenue_start_month = ?, planned_end_month = ?,
        contract_status = ?, note = ?, updated_at = datetime('now')
      WHERE project_id = ?
    `).bind(
      body.has_recurring_revenue !== undefined ? body.has_recurring_revenue : existing.has_recurring_revenue,
      body.recurring_type ?? existing.recurring_type,
      body.monthly_amount ?? existing.monthly_amount,
      body.billing_start_month ?? existing.billing_start_month,
      body.revenue_start_month ?? existing.revenue_start_month,
      body.planned_end_month ?? existing.planned_end_month,
      body.contract_status ?? existing.contract_status,
      body.note ?? existing.note,
      id
    ).run()

    // プロジェクトのhas_recurring_revenueフラグも更新
    if (body.has_recurring_revenue !== undefined) {
      await db.prepare(
        'UPDATE projects SET has_recurring_revenue = ?, updated_at = datetime(\'now\') WHERE id = ?'
      ).bind(body.has_recurring_revenue, id).run()
    }
  }

  return c.json({ message: '月額売上情報を更新しました' })
})

export default projects
