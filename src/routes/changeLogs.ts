import { Hono } from 'hono'
import { authMiddleware } from '../middleware/auth'

const changeLogs = new Hono<{ Bindings: { DB: D1Database } }>()
changeLogs.use('*', authMiddleware)

// 変更履歴一覧
changeLogs.get('/', async (c) => {
  const db = c.env.DB
  const projectId = c.req.query('project_id')
  const accountingStatus = c.req.query('accounting_status')
  const page = Number(c.req.query('page') || '1')
  const limit = 50
  const offset = (page - 1) * limit

  let sql = `
    SELECT cl.*, p.project_no, p.project_name
    FROM change_logs cl
    LEFT JOIN projects p ON cl.project_id = p.id
    WHERE 1=1
  `
  const params: any[] = []
  if (projectId) { sql += ` AND cl.project_id = ?`; params.push(projectId) }
  if (accountingStatus) { sql += ` AND cl.accounting_confirmation_status = ?`; params.push(accountingStatus) }
  sql += ` ORDER BY cl.changed_at DESC LIMIT ? OFFSET ?`
  params.push(limit, offset)

  const result = await db.prepare(sql).bind(...params).all()
  
  let countSql = `SELECT COUNT(*) as cnt FROM change_logs cl WHERE 1=1`
  const countParams: any[] = []
  if (projectId) { countSql += ` AND cl.project_id = ?`; countParams.push(projectId) }
  if (accountingStatus) { countSql += ` AND cl.accounting_confirmation_status = ?`; countParams.push(accountingStatus) }
  const countResult = await db.prepare(countSql).bind(...countParams).first<any>()

  return c.json({
    items: result.results,
    total: countResult?.cnt ?? 0,
    page,
    limit,
  })
})

// 経理確認済みに変更
changeLogs.put('/:id/confirm', async (c) => {
  const db = c.env.DB
  const user = c.get('user')
  const id = Number(c.req.param('id'))

  if (user.role !== 'admin' && user.role !== 'accounting') {
    return c.json({ error: '経理確認は管理者または経理のみ可能です' }, 403)
  }

  const log = await db.prepare('SELECT * FROM change_logs WHERE id = ?').bind(id).first<any>()
  if (!log) return c.json({ error: '変更履歴が見つかりません' }, 404)

  await db.prepare(`
    UPDATE change_logs SET
      accounting_confirmation_status = 'confirmed',
      accounting_confirmed_by = ?,
      accounting_confirmed_by_name = ?,
      accounting_confirmed_at = datetime('now')
    WHERE id = ?
  `).bind(user.id, user.display_name, id).run()

  // 同じプロジェクトの全pendingを確認済みにする（一括確認）
  const bulk = c.req.query('bulk')
  if (bulk === '1' && log.project_id) {
    await db.prepare(`
      UPDATE change_logs SET
        accounting_confirmation_status = 'confirmed',
        accounting_confirmed_by = ?,
        accounting_confirmed_by_name = ?,
        accounting_confirmed_at = datetime('now')
      WHERE project_id = ? AND accounting_confirmation_status = 'pending'
    `).bind(user.id, user.display_name, log.project_id).run()

    await db.prepare(`
      UPDATE acceptances SET accounting_check_status = 'confirmed', updated_at = datetime('now')
      WHERE project_id = ?
    `).bind(log.project_id).run()
  }

  return c.json({ message: '経理確認済みにしました' })
})

// プロジェクト単位で一括経理確認
changeLogs.put('/confirm-project/:projectId', async (c) => {
  const db = c.env.DB
  const user = c.get('user')
  const projectId = Number(c.req.param('projectId'))

  if (user.role !== 'admin' && user.role !== 'accounting') {
    return c.json({ error: '経理確認は管理者または経理のみ可能です' }, 403)
  }

  await db.prepare(`
    UPDATE change_logs SET
      accounting_confirmation_status = 'confirmed',
      accounting_confirmed_by = ?,
      accounting_confirmed_by_name = ?,
      accounting_confirmed_at = datetime('now')
    WHERE project_id = ? AND accounting_confirmation_status = 'pending'
  `).bind(user.id, user.display_name, projectId).run()

  await db.prepare(`
    UPDATE acceptances SET accounting_check_status = 'confirmed', updated_at = datetime('now')
    WHERE project_id = ?
  `).bind(projectId).run()

  return c.json({ message: '経理確認済みにしました' })
})

export default changeLogs
