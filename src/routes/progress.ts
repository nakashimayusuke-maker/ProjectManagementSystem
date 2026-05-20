import { Hono } from 'hono'
import { authMiddleware } from '../middleware/auth'
import { recordChangeLog } from '../utils/helpers'

const progress = new Hono<{ Bindings: { DB: D1Database } }>()
progress.use('*', authMiddleware)

// 進行基準案件一覧
progress.get('/', async (c) => {
  const db = c.env.DB
  const isTarget = c.req.query('is_target')

  let sql = `
    SELECT psp.*, p.project_no, p.project_name, p.customer_name,
      u1.display_name as dev_owner_name_user,
      u2.display_name as design_owner_name_user
    FROM progress_standard_projects psp
    JOIN projects p ON psp.project_id = p.id
    LEFT JOIN users u1 ON psp.dev_owner_user_id = u1.id
    LEFT JOIN users u2 ON psp.design_owner_user_id = u2.id
    WHERE 1=1
  `
  const params: any[] = []
  if (isTarget === '1') { sql += ` AND psp.is_target = 1`; }
  sql += ` ORDER BY psp.progress_no`

  const result = await db.prepare(sql).bind(...params).all()
  return c.json(result.results)
})

// 進行基準案件取得（案件ID別）
progress.get('/by-project/:projectId', async (c) => {
  const db = c.env.DB
  const projectId = c.req.param('projectId')

  const psp = await db.prepare(
    'SELECT * FROM progress_standard_projects WHERE project_id = ?'
  ).bind(projectId).first()

  if (!psp) return c.json(null)

  const monthlies = await db.prepare(
    'SELECT * FROM progress_monthlies WHERE progress_standard_project_id = ? ORDER BY target_month'
  ).bind((psp as any).id).all()

  return c.json({ ...psp, monthlies: monthlies.results })
})

// 進行基準案件登録・更新（案件に1つ）
progress.post('/by-project/:projectId', async (c) => {
  const db = c.env.DB
  const user = c.get('user')
  const projectId = Number(c.req.param('projectId'))

  if (user.role === 'viewer') return c.json({ error: 'Forbidden' }, 403)

  const body = await c.req.json()
  const existing = await db.prepare(
    'SELECT * FROM progress_standard_projects WHERE project_id = ?'
  ).bind(projectId).first<any>()

  if (existing) {
    await db.prepare(`
      UPDATE progress_standard_projects SET
        progress_no = ?, is_target = ?, related_project_numbers = ?,
        dev_owner_user_id = ?, design_owner_user_id = ?,
        dev_owner_name = ?, design_owner_name = ?,
        artifact_folder_url = ?, planned_end_month = ?, end_month = ?,
        status = ?, note = ?, updated_at = datetime('now')
      WHERE project_id = ?
    `).bind(
      body.progress_no ?? existing.progress_no,
      body.is_target !== undefined ? body.is_target : existing.is_target,
      body.related_project_numbers ?? existing.related_project_numbers,
      body.dev_owner_user_id ?? existing.dev_owner_user_id,
      body.design_owner_user_id ?? existing.design_owner_user_id,
      body.dev_owner_name ?? existing.dev_owner_name,
      body.design_owner_name ?? existing.design_owner_name,
      body.artifact_folder_url ?? existing.artifact_folder_url,
      body.planned_end_month ?? existing.planned_end_month,
      body.end_month ?? existing.end_month,
      body.status ?? existing.status,
      body.note ?? existing.note,
      projectId
    ).run()

    // プロジェクトのis_progress_targetフラグも連動
    if (body.is_target !== undefined) {
      await db.prepare(
        'UPDATE projects SET is_progress_target = ?, updated_at = datetime(\'now\') WHERE id = ?'
      ).bind(body.is_target, projectId).run()
    }

    return c.json({ message: '進行基準情報を更新しました' })
  } else {
    const result = await db.prepare(`
      INSERT INTO progress_standard_projects
        (project_id, progress_no, is_target, related_project_numbers, dev_owner_user_id, design_owner_user_id,
         dev_owner_name, design_owner_name, artifact_folder_url, planned_end_month, status, note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      projectId,
      body.progress_no || null,
      body.is_target || 0,
      body.related_project_numbers || null,
      body.dev_owner_user_id || null,
      body.design_owner_user_id || null,
      body.dev_owner_name || null,
      body.design_owner_name || null,
      body.artifact_folder_url || null,
      body.planned_end_month || null,
      body.status || 'not_started',
      body.note || null
    ).run()

    if (body.is_target) {
      await db.prepare(
        'UPDATE projects SET is_progress_target = 1, updated_at = datetime(\'now\') WHERE id = ?'
      ).bind(projectId).run()
    }

    return c.json({ id: result.meta.last_row_id, message: '進行基準情報を登録しました' }, 201)
  }
})

// 進行基準月次一覧
progress.get('/:pspId/monthlies', async (c) => {
  const db = c.env.DB
  const pspId = c.req.param('pspId')

  const monthlies = await db.prepare(
    'SELECT * FROM progress_monthlies WHERE progress_standard_project_id = ? ORDER BY target_month'
  ).bind(pspId).all()

  return c.json(monthlies.results)
})

// 全進行基準月次一覧（ダッシュボード用）
progress.get('/monthlies/all', async (c) => {
  const db = c.env.DB
  const month = c.req.query('month')

  let sql = `
    SELECT pm.*, psp.progress_no, p.project_no, p.project_name
    FROM progress_monthlies pm
    JOIN progress_standard_projects psp ON pm.progress_standard_project_id = psp.id
    JOIN projects p ON psp.project_id = p.id
    WHERE psp.is_target = 1
  `
  const params: any[] = []
  if (month) { sql += ` AND pm.target_month = ?`; params.push(month) }
  sql += ` ORDER BY pm.target_month, p.project_no`

  const result = await db.prepare(sql).bind(...params).all()
  return c.json(result.results)
})

// 進行基準月次登録・更新
progress.post('/:pspId/monthlies', async (c) => {
  const db = c.env.DB
  const user = c.get('user')
  const pspId = Number(c.req.param('pspId'))

  if (user.role === 'viewer') return c.json({ error: 'Forbidden' }, 403)

  const body = await c.req.json()
  const { target_month } = body

  if (!target_month) return c.json({ error: '対象月は必須です' }, 400)

  // 進捗率バリデーション
  if (body.progress_rate !== undefined && body.progress_rate !== null) {
    if (body.progress_rate < 0 || body.progress_rate > 100) {
      return c.json({ error: '進捗率は0〜100の範囲で入力してください' }, 400)
    }
  }

  const existing = await db.prepare(
    'SELECT * FROM progress_monthlies WHERE progress_standard_project_id = ? AND target_month = ?'
  ).bind(pspId, target_month).first<any>()

  // 累計売上の自動計算
  let cumulativeSales = body.cumulative_sales
  if (body.monthly_sales !== undefined && cumulativeSales === undefined) {
    const prevMonthly = await db.prepare(`
      SELECT SUM(monthly_sales) as total FROM progress_monthlies
      WHERE progress_standard_project_id = ? AND target_month < ?
    `).bind(pspId, target_month).first<any>()
    cumulativeSales = (prevMonthly?.total || 0) + (body.monthly_sales || 0)
  }

  if (existing) {
    await db.prepare(`
      UPDATE progress_monthlies SET
        partner_reported_progress_rate = ?, internal_judged_progress_rate = ?, progress_rate = ?,
        monthly_sales = ?, cumulative_sales = ?, artifact_url = ?,
        judgment_basis = ?, input_user_id = ?, input_user_name = ?, input_date = ?,
        approver_user_id = ?, approver_name = ?, approved_date = ?,
        status = ?, note = ?, updated_at = datetime('now')
      WHERE id = ?
    `).bind(
      body.partner_reported_progress_rate ?? existing.partner_reported_progress_rate,
      body.internal_judged_progress_rate ?? existing.internal_judged_progress_rate,
      body.progress_rate ?? existing.progress_rate,
      body.monthly_sales ?? existing.monthly_sales,
      cumulativeSales ?? existing.cumulative_sales,
      body.artifact_url ?? existing.artifact_url,
      body.judgment_basis ?? existing.judgment_basis,
      body.input_user_id ?? user.id,
      body.input_user_name ?? user.display_name,
      body.input_date ?? new Date().toISOString().split('T')[0],
      body.approver_user_id ?? existing.approver_user_id,
      body.approver_name ?? existing.approver_name,
      body.approved_date ?? existing.approved_date,
      body.status ?? existing.status,
      body.note ?? existing.note,
      existing.id
    ).run()

    await recordChangeLog(db, {
      project_id: null,
      target_table: 'progress_monthlies',
      target_record_id: existing.id,
      target_field: 'progress_rate',
      before_value: String(existing.progress_rate),
      after_value: String(body.progress_rate),
      changed_by: user.id,
      changed_by_name: user.display_name,
    })

    return c.json({ message: '進行基準月次を更新しました' })
  } else {
    const result = await db.prepare(`
      INSERT INTO progress_monthlies
        (progress_standard_project_id, target_month, partner_reported_progress_rate,
         internal_judged_progress_rate, progress_rate, monthly_sales, cumulative_sales,
         artifact_url, judgment_basis, input_user_id, input_user_name, input_date, status, note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      pspId, target_month,
      body.partner_reported_progress_rate || null,
      body.internal_judged_progress_rate || null,
      body.progress_rate || null,
      body.monthly_sales || null,
      cumulativeSales || null,
      body.artifact_url || null,
      body.judgment_basis || null,
      user.id,
      user.display_name,
      body.input_date || new Date().toISOString().split('T')[0],
      body.status || 'inputted',
      body.note || null
    ).run()

    return c.json({ id: result.meta.last_row_id, message: '進行基準月次を登録しました' }, 201)
  }
})

export default progress
