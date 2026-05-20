import { Hono } from 'hono'
import { authMiddleware } from '../middleware/auth'
import { recordChangeLog, isBeforeCurrentMonth } from '../utils/helpers'

const workPlans = new Hono<{ Bindings: { DB: D1Database } }>()
workPlans.use('*', authMiddleware)

// 稼働計画一覧（案件別）
workPlans.get('/project/:projectId', async (c) => {
  const db = c.env.DB
  const projectId = c.req.param('projectId')

  const plans = await db.prepare(
    'SELECT * FROM work_plans WHERE project_id = ? ORDER BY target_month, pj, assignee_name'
  ).bind(projectId).all()

  return c.json(plans.results)
})

// 稼働計画一覧（全件・月別）
workPlans.get('/', async (c) => {
  const db = c.env.DB
  const month = c.req.query('month')
  const userId = c.req.query('user_id')

  let sql = `
    SELECT wp.*, p.project_no, p.project_name, p.client_id, p.customer_name
    FROM work_plans wp
    JOIN projects p ON wp.project_id = p.id
    WHERE 1=1
  `
  const params: any[] = []

  if (month) { sql += ` AND wp.target_month = ?`; params.push(month) }
  if (userId) { sql += ` AND wp.assignee_user_id = ?`; params.push(userId) }

  sql += ` ORDER BY wp.target_month, p.project_no, wp.pj`

  const result = await db.prepare(sql).bind(...params).all()
  return c.json(result.results)
})

// 稼働計画登録
workPlans.post('/', async (c) => {
  const db = c.env.DB
  const user = c.get('user')

  if (user.role === 'viewer') return c.json({ error: 'Forbidden' }, 403)

  const body = await c.req.json()
  const { project_id, target_month, pj, assignee_user_id, assignee_name, allocation_rate, planned_amount, planned_hours, note } = body

  if (!project_id || !target_month) {
    return c.json({ error: '案件IDと対象月は必須です' }, 400)
  }

  // 過去月ロックチェック
  if (isBeforeCurrentMonth(target_month) && user.role !== 'admin') {
    return c.json({ error: '過去月の稼働計画は管理者のみ編集できます' }, 403)
  }

  const result = await db.prepare(`
    INSERT INTO work_plans (project_id, target_month, pj, assignee_user_id, assignee_name, allocation_rate, planned_amount, planned_hours, note)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    project_id, target_month,
    pj || null,
    assignee_user_id || null,
    assignee_name || null,
    allocation_rate || null,
    planned_amount || null,
    planned_hours || null,
    note || null
  ).run()

  // 変更ログ記録
  await recordChangeLog(db, {
    project_id,
    target_table: 'work_plans',
    target_record_id: result.meta.last_row_id,
    target_field: 'created',
    before_value: null,
    after_value: JSON.stringify({ target_month, pj, assignee_name, allocation_rate, planned_amount }),
    changed_by: user.id,
    changed_by_name: user.display_name,
  })

  return c.json({ id: result.meta.last_row_id, message: '稼働計画を登録しました' }, 201)
})

// 稼働計画更新
workPlans.put('/:id', async (c) => {
  const db = c.env.DB
  const user = c.get('user')
  const id = Number(c.req.param('id'))

  if (user.role === 'viewer') return c.json({ error: 'Forbidden' }, 403)

  const existing = await db.prepare('SELECT * FROM work_plans WHERE id = ?').bind(id).first<any>()
  if (!existing) return c.json({ error: '稼働計画が見つかりません' }, 404)

  if (isBeforeCurrentMonth(existing.target_month) && user.role !== 'admin') {
    return c.json({ error: '過去月の稼働計画は管理者のみ編集できます' }, 403)
  }

  const body = await c.req.json()

  await db.prepare(`
    UPDATE work_plans SET
      pj = ?, assignee_user_id = ?, assignee_name = ?,
      allocation_rate = ?, planned_amount = ?, planned_hours = ?, note = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `).bind(
    body.pj ?? existing.pj,
    body.assignee_user_id ?? existing.assignee_user_id,
    body.assignee_name ?? existing.assignee_name,
    body.allocation_rate ?? existing.allocation_rate,
    body.planned_amount ?? existing.planned_amount,
    body.planned_hours ?? existing.planned_hours,
    body.note ?? existing.note,
    id
  ).run()

  await recordChangeLog(db, {
    project_id: existing.project_id,
    target_table: 'work_plans',
    target_record_id: id,
    target_field: 'updated',
    before_value: JSON.stringify(existing),
    after_value: JSON.stringify({ ...existing, ...body }),
    changed_by: user.id,
    changed_by_name: user.display_name,
  })

  return c.json({ message: '稼働計画を更新しました' })
})

// 稼働計画削除
workPlans.delete('/:id', async (c) => {
  const db = c.env.DB
  const user = c.get('user')
  const id = Number(c.req.param('id'))

  if (user.role === 'viewer') return c.json({ error: 'Forbidden' }, 403)

  const existing = await db.prepare('SELECT * FROM work_plans WHERE id = ?').bind(id).first<any>()
  if (!existing) return c.json({ error: '稼働計画が見つかりません' }, 404)

  if (isBeforeCurrentMonth(existing.target_month) && user.role !== 'admin') {
    return c.json({ error: '過去月の稼働計画は管理者のみ削除できます' }, 403)
  }

  await db.prepare('DELETE FROM work_plans WHERE id = ?').bind(id).run()

  return c.json({ message: '稼働計画を削除しました' })
})

export default workPlans
